import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ManagedPlugin } from './runtime-plugins.ts'
import { validateRuntimePlugin } from './runtime-plugins.ts'
import type { PluginCatalog } from './plugin-catalog.ts'
import { PluginMutationCoordinator } from './plugin-mutation.ts'
import type { PluginState } from './plugin-state.ts'
import { loadPluginState, savePluginState } from './plugin-state.ts'
import { effectivePluginRoster, type PluginCompositionBackend } from './plugin-runtime-config.ts'
import type { PluginInventoryEntry, PluginInventoryProbe } from './plugin-inventory-probe.ts'
import type { PluginLifecycleSnapshot, PluginRuntimeState } from './plugin-lifecycle-contract.ts'
import type { PluginRestartTracker } from './plugin-restart-tracker.ts'

export type {
  PluginLifecycleEntry,
  PluginLifecycleSnapshot,
  PluginRuntimeState,
} from './plugin-lifecycle-contract.ts'

/** Renderer refresh hook after a client-bearing plugin reaches its target Host state. */
export type RendererRefresher = () => Promise<void>

/** Ensure a packaged plugin artifact is ready for runtime composition. */
export type PluginArtifactEnsurer = (plugin: ManagedPlugin) => void | Promise<void>

/** Polling configuration for Host lifecycle settlement. */
export interface PluginLifecycleOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  hmrQuietMs?: number
}

/** Runtime state captured before replacing or removing package files. */
export interface PluginQuiesceToken {
  name: string
  wasActive: boolean
  hasClient: boolean
}

type InventoryRuntimeState = PluginRuntimeState | null

/**
 * Main-process orchestrator that applies desired composition and waits on Host truth.
 */
export class PluginLifecycleController {
  private readonly timeoutMs: number
  private readonly pollIntervalMs: number
  private readonly hmrQuietMs: number
  private readonly catalog: PluginCatalog
  private readonly moduleRevisions = new Map<string, number>()

  constructor(
    catalog: PluginCatalog | readonly ManagedPlugin[],
    private state: PluginState,
    private readonly statePath: string,
    private readonly backend: PluginCompositionBackend,
    private readonly inventory: PluginInventoryProbe,
    private readonly ensureArtifactReady: PluginArtifactEnsurer,
    private readonly refreshRenderer: RendererRefresher,
    options: PluginLifecycleOptions = {},
    private readonly mutations = new PluginMutationCoordinator(),
    private readonly restartTracker?: PluginRestartTracker,
  ) {
    if (Array.isArray(catalog)) {
      const plugins = catalog as readonly ManagedPlugin[]
      this.catalog = { list: () => Promise.resolve(plugins) }
    } else {
      this.catalog = catalog as PluginCatalog
    }
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.pollIntervalMs = options.pollIntervalMs ?? 100
    this.hmrQuietMs = options.hmrQuietMs ?? 150
  }

  /**
   * Read desired enablement against current Host inventory for every bundled plugin.
   * @returns Ordered lifecycle entries.
   */
  list(): Promise<PluginLifecycleSnapshot> {
    return this.snapshot()
  }

  /**
   * Enable one manageable bundled plugin and wait until its Host fiber is active.
   * @param name - Distribution package name.
   */
  enable(name: string): Promise<void> {
    return this.enqueueMutation({ kind: 'enable', plugin: name }, () => this.runEnable(name))
  }

  /**
   * Disable one manageable bundled plugin and wait until it leaves Host inventory.
   * @param name - Distribution package name.
   */
  disable(name: string): Promise<void> {
    return this.enqueueMutation({ kind: 'disable', plugin: name }, () => this.runDisable(name))
  }

  /**
   * Dispose then remount one enabled manageable plugin without changing persisted state.
   * @param name - Distribution package name.
   */
  reload(name: string): Promise<void> {
    return this.enqueueMutation({ kind: 'reload', plugin: name }, () => this.runReload(name))
  }

  /**
   * Activate a newly installed runtime plugin while the caller owns the shared mutation coordinator.
   * @param name - Installed profile package name.
   */
  activateInstalled(name: string): Promise<void> {
    this.state = loadPluginState(this.statePath).state
    return this.runEnable(name)
  }

  /** Stop one active runtime plugin without changing the user's disabled preference. */
  async quiesceForPackageMutation(name: string): Promise<PluginQuiesceToken> {
    const plugins = await this.catalog.list()
    const plugin = plugins.find(candidate => candidate.name === name)
    if (plugin === undefined) throw new Error(`plugin lifecycle: unknown plugin ${JSON.stringify(name)}`)
    const inventory = await this.inventory.list()
    const wasActive = inventory.entries.some(entry => matchesInventoryEntry(entry, name) && entry.fiberPhase !== 'failed')
    if (plugin.activationMode === 'hot' && wasActive) {
      const roster = effectivePluginRoster(plugins, this.readState()).filter(candidate => candidate.name !== name)
      await this.backend.apply(this.withRuntimeRequests(roster))
      await this.waitForRuntime(name, state => state === 'absent')
      await delay(this.hmrQuietMs)
    }
    return { name, wasActive, hasClient: plugin.hasClient }
  }

  /** Restore a runtime plugin after a package command failed without changing disk state. */
  async restoreAfterPackageMutation(token: PluginQuiesceToken): Promise<void> {
    if (!token.wasActive) return
    const plugins = await this.catalog.list()
    const roster = effectivePluginRoster(plugins, this.readState())
    await this.backend.apply(this.withRuntimeRequests(roster))
    await this.waitForRuntime(token.name, state => state === 'active')
    await delay(this.hmrQuietMs)
    if (token.hasClient) await this.refreshRenderer()
  }

  /** Activate a healthy managed runtime package after its files settle. */
  async activateAfterPackageMutation(name: string): Promise<void> {
    this.state = loadPluginState(this.statePath).state
    const plugins = await this.catalog.list()
    const plugin = plugins.find(candidate => candidate.name === name)
    if (plugin === undefined || plugin.activationMode !== 'hot' || !plugin.manageable) return
    if (this.state.disabled.includes(name)) return
    await this.ensureArtifactReady(plugin)
    this.bumpModuleRevision(name)
    await this.backend.apply(this.withRuntimeRequests(effectivePluginRoster(plugins, this.state)))
    await this.waitForRuntime(name, state => state === 'active')
    await delay(this.hmrQuietMs)
    if (plugin.hasClient) await this.refreshRenderer()
  }

  /** Refresh the renderer after removal of a client-bearing package. */
  async refreshAfterPackageRemoval(hasClient: boolean): Promise<void> {
    if (hasClient) await this.refreshRenderer()
  }

  private async runEnable(name: string): Promise<void> {
    const plugins = await this.catalog.list()
    const plugin = this.requireManageablePlugin(plugins, name)
    await this.ensureArtifactReady(plugin)
    const previousState = this.readState()
    const targetState = {
      ...previousState,
      disabled: previousState.disabled.filter(candidate => candidate !== plugin.name),
    }
    await this.applyWithRollback(plugins, previousState, targetState, async () => {
      await this.waitForRuntime(plugin.name, state => state === 'active')
    })
    if (plugin.hasClient) await this.refreshRenderer()
  }

  private async runDisable(name: string): Promise<void> {
    const plugins = await this.catalog.list()
    const plugin = this.requireManageablePlugin(plugins, name)
    const previousState = this.readState()
    if (previousState.disabled.includes(plugin.name)) return
    const targetState = {
      ...previousState,
      disabled: [...previousState.disabled, plugin.name],
    }
    await this.applyWithRollback(plugins, previousState, targetState, async () => {
      await this.waitForRuntime(plugin.name, state => state === 'absent')
    })
    if (plugin.hasClient) await this.refreshRenderer()
  }

  private async runReload(name: string): Promise<void> {
    const plugins = await this.catalog.list()
    const plugin = this.requireManageablePlugin(plugins, name)
    const currentState = this.readState()
    if (currentState.disabled.includes(plugin.name)) {
      throw new Error(`plugin lifecycle: cannot reload disabled plugin ${JSON.stringify(plugin.name)}`)
    }
    await this.ensureArtifactReady(plugin)
    const roster = effectivePluginRoster(plugins, currentState)
    const withoutPlugin = roster.filter(candidate => candidate.name !== plugin.name)
    await this.backend.apply(this.withRuntimeRequests(withoutPlugin))
    try {
      await this.waitForRuntime(plugin.name, state => state === 'absent')
      await delay(this.hmrQuietMs)
      this.bumpModuleRevision(plugin.name)
      await this.backend.apply(this.withRuntimeRequests(roster))
      await this.waitForRuntime(plugin.name, state => state === 'active')
      await delay(this.hmrQuietMs)
    } catch (error) {
      await this.backend.apply(this.withRuntimeRequests(roster))
      await this.waitForRuntime(plugin.name, state => state === 'active')
      throw error
    }
    if (plugin.hasClient) await this.refreshRenderer()
  }

  private async applyWithRollback(
    plugins: readonly ManagedPlugin[],
    previousState: PluginState,
    targetState: PluginState,
    settle: () => Promise<void>,
  ): Promise<void> {
    const previousRoster = effectivePluginRoster(plugins, previousState)
    const targetRoster = effectivePluginRoster(plugins, targetState)
    await this.backend.apply(this.withRuntimeRequests(targetRoster))
    try {
      await settle()
      await savePluginState(this.statePath, targetState)
      this.state = targetState
      await delay(this.hmrQuietMs)
    } catch (error) {
      await this.backend.apply(this.withRuntimeRequests(previousRoster))
      await this.restoreRuntime(plugins, previousState)
      throw error
    }
  }

  private async restoreRuntime(plugins: readonly ManagedPlugin[], previousState: PluginState): Promise<void> {
    const waits = effectivePluginRoster(plugins, previousState)
      .map(plugin => this.waitForRuntime(plugin.name, state => state === 'active'))
    const removals = plugins
      .filter(plugin => plugin.manageable && previousState.disabled.includes(plugin.name))
      .map(plugin => this.waitForRuntime(plugin.name, state => state === 'absent'))
    await Promise.all([...waits, ...removals])
  }

  private bumpModuleRevision(name: string): void {
    this.moduleRevisions.set(name, (this.moduleRevisions.get(name) ?? 0) + 1)
  }

  private withRuntimeRequests(roster: readonly ManagedPlugin[]): ManagedPlugin[] {
    return roster.map((plugin) => {
      const revision = this.moduleRevisions.get(plugin.name)
      if (revision === undefined) return plugin
      const request = pathToFileURL(join(plugin.rootPath, 'lib', 'index.js'))
      request.searchParams.set('dsh-electron-revision', String(revision))
      return { ...plugin, runtimeRequest: request.href }
    })
  }

  private async snapshot(): Promise<PluginLifecycleSnapshot> {
    const [plugins, inventory] = await Promise.all([this.catalog.list(), this.inventory.list()])
    const currentState = this.readState()
    const activeOperation = this.mutations.getActiveOperation()
    const runtimeByName = new Map<string, InventoryRuntimeState>()
    for (const entry of inventory.entries) {
      runtimeByName.set(entry.moduleName, toRuntimeState(entry.fiberPhase))
      runtimeByName.set(entry.entryId, toRuntimeState(entry.fiberPhase))
    }
    for (const plugin of plugins) {
      const entry = inventory.entries.find(candidate => matchesInventoryEntry(candidate, plugin.name))
      if (entry !== undefined) runtimeByName.set(plugin.name, toRuntimeState(entry.fiberPhase))
    }
    return {
      entries: plugins.map(plugin => ({
        name: plugin.name,
        version: plugin.version,
        ...(plugin.description === undefined ? {} : { description: plugin.description }),
        ownership: plugin.ownership,
        kind: plugin.kind,
        installSource: plugin.installSource,
        ...(plugin.requestedSpec === undefined ? {} : { requestedSpec: plugin.requestedSpec }),
        hasClient: plugin.hasClient,
        manageable: plugin.manageable,
        required: plugin.required,
        ...(plugin.activationMode === 'hot' ? {
          desiredEnabled: plugin.required || !currentState.disabled.includes(plugin.name),
          runtime: runtimeByName.get(plugin.name) ?? 'absent',
        } : {}),
        activationMode: plugin.activationMode,
        health: plugin.health,
        packageActions: plugin.packageActions,
      })),
      pendingRestart: this.restartTracker?.list() ?? [],
      ...(activeOperation === undefined ? {} : { activeOperation }),
    }
  }

  private requireManageablePlugin(plugins: readonly ManagedPlugin[], name: string): ManagedPlugin {
    const plugin = plugins.find(candidate => candidate.name === name)
    if (plugin === undefined) {
      throw new Error(`plugin lifecycle: unknown plugin ${JSON.stringify(name)}`)
    }
    if (!plugin.manageable) {
      throw new Error(`plugin lifecycle: ${JSON.stringify(name)} is required and cannot be managed at runtime`)
    }
    if (plugin.ownership !== 'profile') validateRuntimePlugin(plugin)
    return plugin
  }

  private async waitForRuntime(
    moduleName: string,
    predicate: (state: PluginRuntimeState) => boolean,
  ): Promise<void> {
    const startedAt = Date.now()
    let lastState: PluginRuntimeState = 'absent'
    for (;;) {
      const inventory = await this.inventory.list()
      const match = inventory.entries.find(entry => matchesInventoryEntry(entry, moduleName))
      const state = match === undefined ? 'absent' : toRuntimeState(match.fiberPhase)
      lastState = state
      if (state === 'failed') {
        throw new Error(`plugin lifecycle: ${JSON.stringify(moduleName)} entered failed state`)
      }
      if (predicate(state)) return
      if (Date.now() - startedAt >= this.timeoutMs) {
        throw new Error(`plugin lifecycle: timed out waiting for ${JSON.stringify(moduleName)} to settle from last state ${JSON.stringify(lastState)}`)
      }
      await delay(this.pollIntervalMs)
    }
  }

  private enqueueMutation<T>(
    descriptor: import('./plugin-lifecycle-contract.ts').PluginMutationDescriptor,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.mutations.run(descriptor, operation)
  }

  private readState(): PluginState {
    return this.state
  }
}

function toRuntimeState(phase: InventoryRuntimeState): PluginRuntimeState {
  return phase ?? 'absent'
}

function matchesInventoryEntry(entry: PluginInventoryEntry, packageName: string): boolean {
  return entry.entryId === packageName
    || entry.entryId.endsWith(`:${packageName}`)
    || entry.moduleName === packageName
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
