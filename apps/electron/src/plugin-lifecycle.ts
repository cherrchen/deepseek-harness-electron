import type { ManagedPlugin } from './runtime-plugins.ts'
import { validateRuntimePlugin } from './runtime-plugins.ts'
import type { PluginState } from './plugin-state.ts'
import { savePluginState } from './plugin-state.ts'
import { effectivePluginRoster, type PluginCompositionBackend } from './plugin-runtime-config.ts'
import type { PluginInventoryProbe } from './plugin-inventory-probe.ts'

/** One manageable plugin's observable lifecycle state. */
export type PluginRuntimeState =
  | 'absent'
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'

/** UI-facing lifecycle snapshot for one bundled plugin artifact. */
export interface PluginLifecycleEntry {
  name: string
  hasClient: boolean
  manageable: boolean
  required: boolean
  desiredEnabled: boolean
  runtime: PluginRuntimeState
}

/** Ordered snapshot returned to the desktop bridge. */
export interface PluginLifecycleSnapshot {
  entries: PluginLifecycleEntry[]
}

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
  private operationQueue = Promise.resolve()

  constructor(
    private readonly plugins: readonly ManagedPlugin[],
    private state: PluginState,
    private readonly statePath: string,
    private readonly backend: PluginCompositionBackend,
    private readonly inventory: PluginInventoryProbe,
    private readonly ensureArtifactReady: PluginArtifactEnsurer,
    private readonly refreshRenderer: RendererRefresher,
    options: PluginLifecycleOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.pollIntervalMs = options.pollIntervalMs ?? 100
    this.hmrQuietMs = options.hmrQuietMs ?? 150
  }

  /**
   * Read desired enablement against current Host inventory for every bundled plugin.
   * @returns Ordered lifecycle entries.
   */
  list(): Promise<PluginLifecycleSnapshot> {
    return this.enqueue(() => this.snapshot())
  }

  /**
   * Enable one manageable bundled plugin and wait until its Host fiber is active.
   * @param name - Distribution package name.
   */
  enable(name: string): Promise<void> {
    return this.enqueue(() => this.runEnable(name))
  }

  /**
   * Disable one manageable bundled plugin and wait until it leaves Host inventory.
   * @param name - Distribution package name.
   */
  disable(name: string): Promise<void> {
    return this.enqueue(() => this.runDisable(name))
  }

  /**
   * Dispose then remount one enabled manageable plugin without changing persisted state.
   * @param name - Distribution package name.
   */
  reload(name: string): Promise<void> {
    return this.enqueue(() => this.runReload(name))
  }

  private async runEnable(name: string): Promise<void> {
    const plugin = this.requireManageablePlugin(name)
    await this.ensureArtifactReady(plugin)
    const previousState = this.state
    const targetState = {
      ...previousState,
      disabled: previousState.disabled.filter(candidate => candidate !== plugin.name),
    }
    await this.applyWithRollback(previousState, targetState, async () => {
      await this.waitForRuntime(plugin.name, state => state === 'active')
    })
    if (plugin.hasClient) await this.refreshRenderer()
  }

  private async runDisable(name: string): Promise<void> {
    const plugin = this.requireManageablePlugin(name)
    const previousState = this.state
    if (previousState.disabled.includes(plugin.name)) return
    const targetState = {
      ...previousState,
      disabled: [...previousState.disabled, plugin.name],
    }
    await this.applyWithRollback(previousState, targetState, async () => {
      await this.waitForRuntime(plugin.name, state => state === 'absent')
    })
    if (plugin.hasClient) await this.refreshRenderer()
  }

  private async runReload(name: string): Promise<void> {
    const plugin = this.requireManageablePlugin(name)
    if (this.state.disabled.includes(plugin.name)) {
      throw new Error(`plugin lifecycle: cannot reload disabled plugin ${JSON.stringify(plugin.name)}`)
    }
    await this.ensureArtifactReady(plugin)
    const roster = effectivePluginRoster(this.plugins, this.state)
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
    previousState: PluginState,
    targetState: PluginState,
    settle: () => Promise<void>,
  ): Promise<void> {
    const previousRoster = effectivePluginRoster(this.plugins, previousState)
    const targetRoster = effectivePluginRoster(this.plugins, targetState)
    await this.backend.apply(targetRoster)
    try {
      await settle()
      await savePluginState(this.statePath, targetState)
      this.state = targetState
      await delay(this.hmrQuietMs)
    } catch (error) {
      await this.backend.apply(previousRoster)
      await this.restoreRuntime(previousState)
      throw error
    }
  }

  private async restoreRuntime(previousState: PluginState): Promise<void> {
    const waits = effectivePluginRoster(this.plugins, previousState)
      .map(plugin => this.waitForRuntime(plugin.name, state => state === 'active'))
    const removals = this.plugins
      .filter(plugin => plugin.manageable && previousState.disabled.includes(plugin.name))
      .map(plugin => this.waitForRuntime(plugin.name, state => state === 'absent'))
    await Promise.all([...waits, ...removals])
  }

  private async snapshot(): Promise<PluginLifecycleSnapshot> {
    const inventory = await this.inventory.list()
    const runtimeByName = new Map<string, InventoryRuntimeState>()
    for (const entry of inventory.entries) {
      runtimeByName.set(entry.moduleName, toRuntimeState(entry.fiberPhase))
    }
    return {
      entries: this.plugins.map(plugin => ({
        name: plugin.name,
        hasClient: plugin.hasClient,
        manageable: plugin.manageable,
        required: plugin.required,
        desiredEnabled: plugin.required || !this.state.disabled.includes(plugin.name),
        runtime: runtimeByName.get(plugin.name) ?? 'absent',
      })),
    }
  }

  private requireManageablePlugin(name: string): ManagedPlugin {
    const plugin = this.plugins.find(candidate => candidate.name === name)
    if (plugin === undefined) {
      throw new Error(`plugin lifecycle: unknown bundled plugin ${JSON.stringify(name)}`)
    }
    if (!plugin.manageable) {
      throw new Error(`plugin lifecycle: ${JSON.stringify(name)} is required and cannot be managed at runtime`)
    }
    validateRuntimePlugin(plugin)
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

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(() => undefined, () => undefined)
    return result
  }
}

function toRuntimeState(phase: InventoryRuntimeState): PluginRuntimeState {
  return phase ?? 'absent'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
