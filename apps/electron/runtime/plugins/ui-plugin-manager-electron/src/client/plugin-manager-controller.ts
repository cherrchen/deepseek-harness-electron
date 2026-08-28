import type {
  DesktopCapabilitiesContract,
  PluginLifecycleSnapshot,
  PluginUpdateInfo,
} from '@dsh-electron/dsh-electron-desktop-capabilities/client'

/** Mutations supported by Electron Main's plugin lifecycle controller. */
export type PluginOperationKind = 'enable' | 'disable' | 'reload' | 'update' | 'reinstall' | 'remove'

/** One in-flight user command. Main serializes these commands globally. */
export interface ActivePluginOperation {
  plugin: string
  kind: PluginOperationKind
}

/** Renderer state derived from lifecycle snapshots and the current user command. */
export interface PluginManagerState {
  status: 'loading' | 'ready' | 'error'
  snapshot?: PluginLifecycleSnapshot
  activeOperation?: ActivePluginOperation
  operationError?: ActivePluginOperation
  updateInfo?: PluginUpdateInfo[]
  packageError?: { operation: ActivePluginOperation; message: string; recovery?: string }
  checkingUpdates?: boolean
  checkError?: string
}

type PluginLifecycleCapabilities = DesktopCapabilitiesContract['plugins']
type StateListener = (state: PluginManagerState) => void

/** Coordinates lazy reads, mutation-only polling, final reconciliation, and cleanup. */
export class PluginManagerController {
  private state: PluginManagerState = { status: 'loading' }
  private readonly listeners = new Set<StateListener>()
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private started = false
  private disposed = false

  /**
   * @param plugins - Lifecycle capability exposed through `ctx.desktop.plugins`.
   * @param pollIntervalMs - Delay between reads while one mutation is active.
   */
  constructor(
    private readonly plugins: PluginLifecycleCapabilities,
    private readonly pollIntervalMs = 250,
  ) {}

  /** @returns the current immutable view state. */
  getState(): PluginManagerState {
    return this.state
  }

  /**
   * Observe state changes and receive the current state immediately.
   * @param listener - View state consumer.
   * @returns a subscription disposer.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  /** Load the first snapshot after the Installed tab mounts. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return
    this.started = true
    await this.load()
  }

  /** Retry an initial or reconciliation read that failed. */
  async retryLoad(): Promise<void> {
    if (this.disposed || this.state.activeOperation !== undefined) return
    this.update({ status: 'loading' })
    await this.load()
  }

  /** Refresh the catalog after a package installation completes. */
  async refresh(): Promise<void> {
    if (this.disposed || this.state.activeOperation !== undefined) return
    await this.load()
  }

  /** Ask Main to check only eligible Registry dependencies, then retain the result beside the snapshot. */
  async checkUpdates(): Promise<void> {
    if (this.disposed || this.state.status !== 'ready' || this.state.activeOperation !== undefined) return
    const snapshot = this.state.snapshot
    if (snapshot === undefined) return
    this.update({ status: 'ready', snapshot, checkingUpdates: true })
    try {
      const updateInfo = await this.plugins.checkUpdates()
      if (!this.disposed) this.update({ status: 'ready', snapshot: await this.plugins.list(), updateInfo })
    } catch (error) {
      if (!this.disposed) {
        this.update({ status: 'ready', snapshot, checkError: (error as Error).message })
      }
    }
  }

  /**
   * Run one global lifecycle mutation and reconcile with Main afterward.
   * @param operation - Plugin package name and lifecycle command.
   */
  async mutate(operation: ActivePluginOperation): Promise<void> {
    if (this.disposed || this.state.status !== 'ready' || this.state.activeOperation !== undefined) return
    const snapshot = this.state.snapshot
    if (snapshot === undefined) return
    this.update({ status: 'ready', snapshot, activeOperation: operation })
    this.schedulePoll(operation)

    let failure: { message: string; recovery?: string } | undefined
    try {
      await this.plugins[operation.kind](operation.plugin)
    } catch (error) {
      const value = error as Error & { recovery?: string }
      failure = { message: value.message, ...(value.recovery === undefined ? {} : { recovery: value.recovery }) }
      console.error(`plugin manager: ${operation.kind} failed for ${JSON.stringify(operation.plugin)}`, error)
    } finally {
      this.stopPolling()
    }
    if (this.disposed) return

    try {
      const finalSnapshot = await this.plugins.list()
      if (this.disposed) return
      this.update({
        status: 'ready',
        snapshot: finalSnapshot,
        ...(failure === undefined ? {} : {
          operationError: operation,
          ...(operation.kind === 'enable' || operation.kind === 'disable' || operation.kind === 'reload'
            ? {}
            : { packageError: { operation, ...failure } }),
        }),
        ...(this.state.updateInfo === undefined ? {} : { updateInfo: this.state.updateInfo }),
      })
    } catch {
      if (!this.disposed) {
        this.update({ status: 'error', ...(failure === undefined ? {} : { operationError: operation }) })
      }
    }
  }

  /** Stop polling and prevent in-flight work from publishing state. */
  dispose(): void {
    this.disposed = true
    this.stopPolling()
    this.listeners.clear()
  }

  private async load(): Promise<void> {
    try {
      const snapshot = await this.plugins.list()
      if (!this.disposed) this.update({ status: 'ready', snapshot })
    } catch {
      if (!this.disposed) this.update({ status: 'error' })
    }
  }

  private schedulePoll(operation: ActivePluginOperation): void {
    this.pollTimer = setTimeout(() => { void this.poll(operation) }, this.pollIntervalMs)
  }

  private async poll(operation: ActivePluginOperation): Promise<void> {
    if (this.disposed || this.state.activeOperation !== operation) return
    try {
      const snapshot = await this.plugins.list()
      if (!this.disposed && this.state.activeOperation === operation) {
        this.update({ status: 'ready', snapshot, activeOperation: operation })
      }
    } catch {
      // A transient read failure does not change the outcome of the active Main mutation.
    }
    if (!this.disposed && this.state.activeOperation === operation) this.schedulePoll(operation)
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) clearTimeout(this.pollTimer)
    this.pollTimer = undefined
  }

  private update(state: PluginManagerState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}
