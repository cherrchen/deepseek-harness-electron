import type { ManagedPlugin } from './runtime-plugins.ts'
import { validateRuntimePlugin } from './runtime-plugins.ts'
import type { PluginCatalog } from './plugin-catalog.ts'
import { PluginMutationCoordinator } from './plugin-mutation.ts'
import type { PluginState } from './plugin-state.ts'
import { loadPluginState, savePluginState } from './plugin-state.ts'
import { effectivePluginRoster, type PluginCompositionBackend } from './plugin-runtime-config.ts'
import type { PluginInventoryProbe } from './plugin-inventory-probe.ts'
import type { PluginLifecycleSnapshot, PluginRuntimeState } from './plugin-lifecycle-contract.ts'

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

type InventoryRuntimeState = PluginRuntimeState | null

/**
 * Main-process orchestrator that applies desired composition and waits on Host truth.
 */
export class PluginLifecycleController {
  private readonly timeoutMs: number
  private readonly pollIntervalMs: number
  private readonly hmrQuietMs: number
  private readonly catalog: PluginCatalog

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
    return this.enqueueMutation(() => this.runEnable(name))
  }

  /**
   * Disable one manageable bundled plugin and wait until it leaves Host inventory.
   * @param name - Distribution package name.
   */
  disable(name: string): Promise<void> {
    return this.enqueueMutation(() => this.runDisable(name))
  }

  /**
   * Dispose then remount one enabled manageable plugin without changing persisted state.
   * @param name - Distribution package name.
   */
  reload(name: string): Promise<void> {
    return this.enqueueMutation(() => this.runReload(name))
  }

  /**
   * Activate a newly installed runtime plugin while the caller owns the shared mutation coordinator.
   * @param name - Installed profile package name.
   */
  activateInstalled(name: string): Promise<void> {
    this.state = loadPluginState(this.statePath).state
    return this.runEnable(name)
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
    await this.backend.apply(withoutPlugin)
    try {
      await this.waitForRuntime(plugin.name, state => state === 'absent')
      await delay(this.hmrQuietMs)
      await this.backend.apply(roster)
      await this.waitForRuntime(plugin.name, state => state === 'active')
      await delay(this.hmrQuietMs)
    } catch (error) {
      await this.backend.apply(roster)
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
    await this.backend.apply(targetRoster)
    try {
      await settle()
      await savePluginState(this.statePath, targetState)
      this.state = targetState
      await delay(this.hmrQuietMs)
    } catch (error) {
      await this.backend.apply(previousRoster)
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

  private async snapshot(): Promise<PluginLifecycleSnapshot> {
    const [plugins, inventory] = await Promise.all([this.catalog.list(), this.inventory.list()])
    const currentState = this.readState()
    const runtimeByName = new Map<string, InventoryRuntimeState>()
    for (const entry of inventory.entries) {
      runtimeByName.set(entry.moduleName, toRuntimeState(entry.fiberPhase))
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
        ...(plugin.activation === 'hot' ? {
          desiredEnabled: plugin.required || !currentState.disabled.includes(plugin.name),
          runtime: runtimeByName.get(plugin.name) ?? 'absent',
        } : {}),
        activation: plugin.activation,
      })),
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
      const match = inventory.entries.find(entry => entry.moduleName === moduleName)
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

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    return this.mutations.run(operation)
  }

  private readState(): PluginState {
    return this.state
  }
}

function toRuntimeState(phase: InventoryRuntimeState): PluginRuntimeState {
  return phase ?? 'absent'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
