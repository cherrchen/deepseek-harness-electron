/** Client-side Git state and RPC orchestration. */

import type { GitCommitSummary, GitDiff, GitRepositorySnapshot } from '../types.ts'

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

/** Selected diff identity retained across refresh. */
export interface GitSelectedDiff {
  readonly path: string
  readonly staged: boolean
}

/** Number of commits loaded per graph page. */
export const GIT_GRAPH_PAGE_SIZE = 100

export interface GitClientState {
  readonly workspacePath: string | undefined
  readonly repository: GitRepositorySnapshot | null | undefined
  readonly selectedDiff: GitSelectedDiff | undefined
  readonly diff: GitDiff | undefined
  readonly loading: boolean
  readonly error: string | undefined
  readonly desktopAvailable: boolean
  /** Commit history page, newest first. */
  readonly graph: readonly GitCommitSummary[]
  /** Whether a graph page request is in flight. */
  readonly graphLoading: boolean
  /** Whether another graph page may exist past the loaded ones. */
  readonly graphHasMore: boolean
  readonly graphError: string | undefined
  /** Editable commit message proposal/input shared by the commit region. */
  readonly commitMessage: string
  /** Whether a commit message generation request is in flight. */
  readonly generating: boolean
  /** Whether the Host reports a configured generation backend. */
  readonly generationAvailable: boolean
  readonly generationError: string | undefined
}

/** Observable controller shared by the composer control and details surface. */
export class GitClientController {
  private state: GitClientState = {
    workspacePath: undefined,
    repository: undefined,
    selectedDiff: undefined,
    diff: undefined,
    loading: false,
    error: undefined,
    desktopAvailable: false,
    graph: [],
    graphLoading: false,
    graphHasMore: true,
    graphError: undefined,
    commitMessage: '',
    generating: false,
    generationAvailable: false,
    generationError: undefined,
  }
  private readonly listeners = new Set<() => void>()
  private desktop: GitDesktopCapability | undefined
  private operationGeneration = 0
  private diffNavigator: ((path: string, staged: boolean) => void) | undefined

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
   * Install the Details Host diff navigation (set at plugin mount).
   * @param navigator - Opens one Diff surface tab for the path and side.
   */
  setDiffNavigator(navigator: ((path: string, staged: boolean) => void) | undefined): void {
    this.diffNavigator = navigator
  }

  /**
   * Open one changed path as its own Diff surface tab (create-or-reuse via
   * the stable diff tab key). No-op when Details Host is unavailable.
   * @param path - Repository-relative changed path.
   * @param staged - Whether to open the staged comparison.
   */
  openDiff(path: string, staged: boolean): void {
    if (this.diffNavigator !== undefined) {
      this.diffNavigator(path, staged)
      return
    }
    void this.showDiff(path, staged)
  }

  /**
   * Bind repository discovery to the current workspace path.
   * @param workspacePath - Current workspace path, if one is selected.
   * @returns Completion after the first discover and status calls settle.
   */
  async setWorkspace(workspacePath: string | undefined): Promise<void> {
    const generation = ++this.operationGeneration
    this.patch({
      workspacePath,
      repository: undefined,
      diff: undefined,
      selectedDiff: undefined,
      error: undefined,
      graph: [],
      graphHasMore: true,
      graphError: undefined,
      commitMessage: '',
      generationError: undefined,
    })
    if (workspacePath === undefined) {
      this.patch({ loading: false })
      return
    }
    await this.loadRepository(generation, workspacePath)
    void this.loadGraph(true)
    void this.loadGenerationCapability()
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
    const generation = ++this.operationGeneration
    await this.loadRepository(generation, workspacePath)
  }

  /**
   * Load a diff for one changed path (Diff surface payload routing).
   * @param path - Repository-relative changed path.
   * @param staged - Whether to read the staged diff.
   * @returns Completion after the Host diff call settles.
   */
  async showDiff(path: string, staged: boolean): Promise<void> {
    const repository = this.requireRepository()
    const selectedDiff = { path, staged }
    this.patch({ selectedDiff, error: undefined })
    if (repository.untracked.includes(path)) {
      this.patch({ diff: undefined, loading: false })
      return
    }
    this.patch({ loading: true })
    try {
      const diff = decodeDiff(await this.call('diff', { repository: repository.root, path, staged }))
      if (this.state.selectedDiff === undefined
        || this.state.selectedDiff.path !== path
        || this.state.selectedDiff.staged !== staged) return
      this.patch({ diff, loading: false })
    } catch (error) {
      this.patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Discard unstaged working-tree changes of one tracked path, or of every
   * tracked path when omitted. Destructive; callers confirm first.
   * @param path - Optional repository-relative tracked path.
   * @returns Completion after state refresh.
   */
  discard(path?: string): Promise<void> { return this.mutate('discard', { path }) }

  /**
   * Load the first graph page, replacing any loaded history.
   * @param reset - Replace the loaded page instead of appending.
   * @returns Completion after the Host log call settles.
   */
  async loadGraph(reset = true): Promise<void> {
    const repository = this.state.repository
    if (repository === undefined || repository === null) {
      this.patch({ graph: [], graphHasMore: false })
      return
    }
    const skip = reset ? 0 : this.state.graph.length
    this.patch({ graphLoading: true, graphError: undefined })
    try {
      const commits = decodeCommits(await this.call('log', {
        repository: repository.root,
        limit: GIT_GRAPH_PAGE_SIZE,
        skip,
      }))
      const graph = reset ? commits : [...this.state.graph, ...commits]
      this.patch({ graph, graphLoading: false, graphHasMore: commits.length === GIT_GRAPH_PAGE_SIZE })
    } catch (error) {
      this.patch({ graphLoading: false, graphError: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Load the next graph page and append it.
   * @returns Completion after the Host log call settles.
   */
  loadMoreGraph(): Promise<void> { return this.loadGraph(false) }

  /**
   * Editable commit message input (survives tab switches within a session).
   * @param message - Current message text.
   */
  setCommitMessage(message: string): void {
    this.patch({ commitMessage: message })
  }

  /**
   * Generate a commit message proposal from the staged diff. Generation only
   * produces text: it never stages, commits, or pushes.
   * @returns Completion after the proposal lands in `commitMessage`.
   */
  async generateCommitMessage(): Promise<void> {
    const repository = this.requireRepository()
    if (repository.staged.length === 0) {
      this.patch({ generationError: 'stage-changes-first' })
      return
    }
    this.patch({ generating: true, generationError: undefined })
    try {
      const staged = decodeDiff(await this.call('diff', { repository: repository.root, staged: true }))
      const proposal = await this.call('generate-commit-message', {
        repository: repository.root,
        stagedDiff: staged.text,
      })
      if (typeof proposal !== 'string' || proposal.trim().length === 0) {
        throw new Error('generation returned an empty message')
      }
      this.patch({ commitMessage: proposal, generating: false })
    } catch (error) {
      this.patch({ generating: false, generationError: error instanceof Error ? error.message : String(error) })
    }
  }

  private async loadGenerationCapability(): Promise<void> {
    if (this.state.workspacePath === undefined) return
    try {
      const capability = await this.call('commit-message-capability', {}) as { available?: unknown }
      this.patch({ generationAvailable: capability.available === true })
    } catch {
      this.patch({ generationAvailable: false })
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

  private async loadRepository(generation: number, workspacePath: string): Promise<void> {
    this.patch({ workspacePath, loading: true, error: undefined })
    try {
      const root = decodeRoot(await this.call('discover', { path: workspacePath }))
      if (generation !== this.operationGeneration) return
      if (root === null) {
        this.patch({ repository: null, diff: undefined, selectedDiff: undefined, loading: false })
        return
      }
      const snapshot = decodeSnapshot(await this.call('status', { repository: root }))
      if (generation !== this.operationGeneration) return
      this.patch({
        repository: snapshot,
        diff: undefined,
        selectedDiff: undefined,
        loading: false,
      })
    } catch (error) {
      if (generation !== this.operationGeneration) return
      this.patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async mutate(endpoint: string, fields: Record<string, unknown>): Promise<void> {
    const repository = this.requireRepository()
    this.patch({ loading: true, error: undefined })
    try {
      const payload = { repository: repository.root, ...fields }
      const next = decodeSnapshot(await this.call(endpoint, payload))
      this.patch({ repository: next, diff: undefined, selectedDiff: undefined, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.patch({ loading: false, error: message })
      throw error instanceof Error ? error : new Error(message)
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

function decodeCommits(value: unknown): readonly GitCommitSummary[] {
  if (!Array.isArray(value)) throw new Error('Git Host returned an invalid commit log')
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Git Host returned an invalid commit')
    const commit = entry as Partial<GitCommitSummary>
    if (typeof commit.hash !== 'string' || typeof commit.shortHash !== 'string'
      || typeof commit.subject !== 'string' || !Array.isArray(commit.parents)) {
      throw new Error('Git Host returned an invalid commit')
    }
    return {
      hash: commit.hash,
      shortHash: commit.shortHash,
      parents: commit.parents,
      subject: commit.subject,
      author: typeof commit.author === 'string' ? commit.author : '',
      date: typeof commit.date === 'string' ? commit.date : '',
      refs: Array.isArray(commit.refs) ? commit.refs.filter((ref): ref is string => typeof ref === 'string') : [],
    }
  })
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
