/** Client-side Git state and RPC orchestration. */

import type { GitDiff, GitRepositorySnapshot } from '../types.ts'

type GitRpcResult = { ok: true; value: unknown } | { ok: false; error: { message: string } }

/** Structural subset of the Connection RPC caller consumed by the Git client. */
export interface GitRpcClient {
  /**
   * Call one Git endpoint through the logical Connection channel.
   * @param channel - Absolute logical channel.
   * @param endpoint - Channel-relative Git endpoint.
   * @param payload - Endpoint request payload.
   * @returns Host success or error result.
   */
  call(channel: string, endpoint: string, payload: unknown): Promise<GitRpcResult>
}

/** Exact Desktop methods consumed by this plugin's optional enhancement. */
export interface GitDesktopCapability {
  shell: {
    showItemInFolder(path: string): Promise<void>
    openPath(path: string): Promise<string>
  }
  notification: {
    show(options: { title: string; body?: string }): Promise<{ shown: boolean }>
  }
}

export interface GitClientState {
  readonly open: boolean
  readonly workspacePath: string | undefined
  readonly repository: GitRepositorySnapshot | null | undefined
  readonly diff: GitDiff | undefined
  readonly loading: boolean
  readonly error: string | undefined
  readonly desktopAvailable: boolean
}

/** Observable controller shared by the footer action and overlay panel. */
export class GitClientController {
  private state: GitClientState = {
    open: false,
    workspacePath: undefined,
    repository: undefined,
    diff: undefined,
    loading: false,
    error: undefined,
    desktopAvailable: false,
  }
  private readonly listeners = new Set<() => void>()
  private desktop: GitDesktopCapability | undefined

  constructor(private readonly rpc: GitRpcClient) {}

  /**
   * Read the current immutable view consumed by React external-store hooks.
   * @returns Current controller state.
   */
  readonly getSnapshot = (): GitClientState => this.state
  /**
   * Subscribe to state changes.
   * @param listener - Callback invoked after a state replacement.
   * @returns Disposer that removes the callback.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Install or remove the optional native capability.
   * @param desktop - Minimal Desktop service, or `undefined` after provider unload.
   */
  setDesktop(desktop: GitDesktopCapability | undefined): void {
    this.desktop = desktop
    this.patch({ desktopAvailable: desktop !== undefined })
  }

  /**
   * Open the repository panel and discover the current workspace.
   * @param workspacePath - Current workspace path, if one is selected.
   * @returns Completion after the first refresh settles.
   */
  async open(workspacePath: string | undefined): Promise<void> {
    this.patch({ open: true, workspacePath, diff: undefined, error: undefined })
    await this.refresh(workspacePath)
  }

  /** Close the repository panel without discarding its loaded snapshot. */
  close(): void {
    this.patch({ open: false })
  }

  /**
   * Discover and reload repository state for a workspace.
   * @param workspacePath - Workspace path, defaulting to the current controller state.
   * @returns Completion after Host discovery and status calls settle.
   */
  async refresh(workspacePath = this.state.workspacePath): Promise<void> {
    if (workspacePath === undefined) {
      this.patch({ workspacePath, repository: undefined, loading: false, error: undefined })
      return
    }
    this.patch({ workspacePath, loading: true, error: undefined })
    try {
      const root = decodeRoot(await this.call('discover', { path: workspacePath }))
      if (root === null) {
        this.patch({ repository: null, diff: undefined, loading: false })
        return
      }
      this.patch({ repository: decodeSnapshot(await this.call('status', { repository: root })), loading: false })
    } catch (error) {
      this.patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Load a diff for one changed path.
   * @param path - Repository-relative changed path.
   * @param staged - Whether to read the staged diff.
   * @returns Completion after the Host diff call settles.
   */
  async selectDiff(path: string, staged: boolean): Promise<void> {
    const repository = this.requireRepository()
    this.patch({ loading: true, error: undefined })
    try {
      const diff = decodeDiff(await this.call('diff', { repository: repository.root, path, staged }))
      this.patch({ diff, loading: false })
    } catch (error) {
      this.patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Stage one path or every path.
   * @param path - Optional repository-relative path.
   * @returns Completion after state refresh.
   */
  stage(path?: string): Promise<void> { return this.mutate('stage', { path }) }
  /**
   * Unstage one path or the complete index.
   * @param path - Optional repository-relative path.
   * @returns Completion after state refresh.
   */
  unstage(path?: string): Promise<void> { return this.mutate('unstage', { path }) }
  /**
   * Switch to an existing local branch.
   * @param branch - Local branch name.
   * @returns Completion after state refresh.
   */
  switchBranch(branch: string): Promise<void> { return this.mutate('switch-branch', { branch }) }
  /**
   * Create a local branch without switching to it.
   * @param branch - New local branch name.
   * @returns Completion after state refresh.
   */
  createBranch(branch: string): Promise<void> { return this.mutate('create-branch', { branch }) }

  /**
   * Commit the staged index and optionally show a native notification.
   * @param message - Non-empty commit message.
   * @returns Completion after the mutation and optional notification settle.
   */
  async commit(message: string): Promise<void> {
    await this.mutate('commit', { message })
    await this.desktop?.notification.show({ title: 'Git commit created', body: message.trim() })
  }

  /**
   * Reveal the repository through the optional native file-manager action.
   * @returns Completion after the native action settles, or immediately without Desktop.
   */
  async reveal(): Promise<void> {
    const repository = this.requireRepository()
    await this.desktop?.shell.showItemInFolder(repository.root)
  }

  private async mutate(endpoint: string, fields: Record<string, unknown>): Promise<void> {
    const repository = this.requireRepository()
    this.patch({ loading: true, error: undefined })
    try {
      const payload = { repository: repository.root, ...fields }
      const next = decodeSnapshot(await this.call(endpoint, payload))
      this.patch({ repository: next, diff: undefined, loading: false })
    } catch (error) {
      this.patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private requireRepository(): GitRepositorySnapshot {
    const repository = this.state.repository
    if (repository === undefined || repository === null) throw new Error('no Git repository is selected')
    return repository
  }

  private async call(endpoint: string, payload: unknown): Promise<unknown> {
    const result = await this.rpc.call('/git', endpoint, payload)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  private patch(patch: Partial<GitClientState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of [...this.listeners]) listener()
  }
}

function decodeRoot(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value
  throw new Error('Git Host returned an invalid repository root')
}

function decodeDiff(value: unknown): GitDiff {
  if (typeof value !== 'object' || value === null) throw new Error('Git Host returned an invalid diff')
  const diff = value as Partial<GitDiff>
  if (typeof diff.repository !== 'string' || typeof diff.staged !== 'boolean' || typeof diff.text !== 'string'
    || (diff.path !== undefined && typeof diff.path !== 'string')) {
    throw new Error('Git Host returned an invalid diff')
  }
  return diff as GitDiff
}

function decodeSnapshot(value: unknown): GitRepositorySnapshot {
  if (typeof value !== 'object' || value === null) throw new Error('Git Host returned an invalid repository snapshot')
  const snapshot = value as Partial<GitRepositorySnapshot>
  if (typeof snapshot.root !== 'string' || typeof snapshot.version !== 'string'
    || !Array.isArray(snapshot.staged) || !Array.isArray(snapshot.unstaged)
    || !Array.isArray(snapshot.untracked) || !Array.isArray(snapshot.branches)) {
    throw new Error('Git Host returned an invalid repository snapshot')
  }
  return snapshot as GitRepositorySnapshot
}
