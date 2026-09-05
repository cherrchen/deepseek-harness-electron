/** Client-side Git state and RPC orchestration. */

import type { GitCommitSummary, GitDiff, GitLogScope, GitRepositorySnapshot } from '../types.ts'
import { layoutGitGraph } from './graph/layout.ts'
import type { GraphContinuationState, GraphLayoutRow } from './graph/types.ts'

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
export const GIT_GRAPH_PAGE_SIZE = 25

/** Hard cap on simultaneously active graph lanes. */
export const GIT_GRAPH_MAX_LANES = 3

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
  /** History scope used for the loaded graph. */
  readonly graphScope: GitLogScope
  /** Whether the current binding's first graph page already settled (loaded, empty, or failed). */
  readonly graphLoaded: boolean
  /** Renderer-ready graph rows laid out across all loaded pages. */
  readonly graphRows: readonly GraphLayoutRow[]
  /** Maximum visible lane count across the loaded rows. */
  readonly graphLaneCount: number
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
    graphScope: 'auto',
    graphLoaded: false,
    graphRows: [],
    graphLaneCount: 0,
    commitMessage: '',
    generating: false,
    generationAvailable: false,
    generationError: undefined,
  }
  private readonly listeners = new Set<() => void>()
  private desktop: GitDesktopCapability | undefined
  private operationGeneration = 0
  /** Workspace path of the last completed `setWorkspace` binding (idempotence guard). */
  private boundWorkspace: { path: string | undefined; generation: number } | undefined
  private diffNavigator: ((path: string, staged: boolean) => void) | undefined
  /** Monotonic request identity for graph pages; stale responses are discarded. */
  private graphRequestGeneration = 0
  /** Lane continuation state between loaded graph pages. */
  private graphContinuation: GraphContinuationState | undefined

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
   * Bind repository discovery to the current workspace path. Idempotent: the
   * Details Host remounts surfaces on tab switches, and rebinding the same
   * workspace must not reset retained state (commit drafts, loaded graph).
   * @param workspacePath - Current workspace path, if one is selected.
   * @returns Completion after the first discover and status calls settle.
   */
  async setWorkspace(workspacePath: string | undefined): Promise<void> {
    if (this.boundWorkspace !== undefined && this.boundWorkspace.path === workspacePath) return
    const generation = ++this.operationGeneration
    this.boundWorkspace = { path: workspacePath, generation }
    this.patch({
      workspacePath,
      repository: undefined,
      diff: undefined,
      selectedDiff: undefined,
      error: undefined,
      graph: [],
      graphRows: [],
      graphLaneCount: 0,
      graphHasMore: true,
      graphError: undefined,
      graphLoading: false,
      graphLoaded: false,
      commitMessage: '',
      generating: false,
      generationError: undefined,
    })
    this.graphContinuation = undefined
    if (workspacePath === undefined) {
      this.patch({ loading: false })
      return
    }
    await this.loadRepository(generation, workspacePath)
    if (generation !== this.operationGeneration) {
      // A newer operation replaced this binding while discovery was in
      // flight; drop the bookkeeping so the next identical setWorkspace call
      // rebinds instead of trusting stale state.
      const binding = this.boundWorkspace
      if (binding !== undefined && binding.generation === generation) this.boundWorkspace = undefined
      return
    }
    void this.loadGraph(true)
    void this.loadGenerationCapability()
  }

  /**
   * Discover and reload repository state for a workspace. A successful reload
   * invalidates the loaded graph so the Graph surface reloads history that may
   * have changed outside this session (external commits, branch switches).
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
    if (generation !== this.operationGeneration || this.state.error !== undefined) return
    this.patch({ graphLoaded: false, generating: false, generationError: undefined })
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
   * Load a graph page, replacing (reset) or appending to the loaded history.
   * Appended pages continue the previous page's active lanes through the
   * stored continuation state instead of restarting from empty lanes.
   * @param reset - Replace the loaded page instead of appending.
   * @returns Completion after the Host log call settles.
   */
  async loadGraph(reset = true): Promise<void> {
    const repository = this.state.repository
    if (repository === undefined || repository === null) {
      this.graphContinuation = undefined
      this.patch({ graph: [], graphRows: [], graphLaneCount: 0, graphHasMore: false, graphLoaded: false })
      return
    }
    const requestGeneration = ++this.graphRequestGeneration
    const repositoryRoot = repository.root
    const scope = this.state.graphScope
    const skip = reset ? 0 : this.state.graph.length
    this.patch({ graphLoading: true, graphError: undefined })
    try {
      const commits = decodeCommits(await this.call('log', {
        repository: repositoryRoot,
        limit: GIT_GRAPH_PAGE_SIZE,
        skip,
        scope,
      }))
      if (!this.isGraphRequestCurrent(requestGeneration, repositoryRoot)) return
      const graph = reset ? commits : [...this.state.graph, ...commits]
      if (reset) this.graphContinuation = undefined
      const layout = layoutGitGraph(commits, {
        ...(this.graphContinuation !== undefined ? { continuation: this.graphContinuation } : {}),
        firstParentOnly: scope === 'first-parent',
        maxLanes: GIT_GRAPH_MAX_LANES,
      })
      this.graphContinuation = layout.continuation
      this.patch({
        graph,
        graphRows: reset ? layout.rows : [...this.state.graphRows, ...layout.rows],
        graphLaneCount: reset ? layout.laneCount : Math.max(this.state.graphLaneCount, layout.laneCount),
        graphLoading: false,
        graphHasMore: commits.length === GIT_GRAPH_PAGE_SIZE,
        graphLoaded: true,
      })
    } catch (error) {
      // A settled failure counts as loaded: the empty-history auto effect must
      // not turn a failing `git log` into an infinite retry loop. Recovery is
      // an explicit refresh.
      if (!this.isGraphRequestCurrent(requestGeneration, repositoryRoot)) return
      this.patch({
        graphLoading: false,
        graphError: error instanceof Error ? error.message : String(error),
        graphLoaded: true,
      })
    }
  }

  /** Whether a graph response still belongs to the newest request and binding. */
  private isGraphRequestCurrent(generation: number, repositoryRoot: string): boolean {
    return generation === this.graphRequestGeneration && this.state.repository?.root === repositoryRoot
  }

  /**
   * Load the next graph page and append it.
   * @returns Completion after the Host log call settles.
   */
  loadMoreGraph(): Promise<void> { return this.loadGraph(false) }

  /**
   * Switch the graph history scope and reload the first page.
   * @param scope - New history scope (`auto`, `all`, or `first-parent`).
   * @returns Completion after the reloaded page settles.
   */
  async setGraphScope(scope: GitLogScope): Promise<void> {
    if (scope === this.state.graphScope) return
    this.patch({ graphScope: scope })
    await this.loadGraph(true)
  }

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
    const generation = this.operationGeneration
    const repositoryRoot = repository.root
    this.patch({ generating: true, generationError: undefined })
    try {
      const staged = decodeDiff(await this.call('diff', { repository: repositoryRoot, staged: true }))
      if (!this.isGenerationCurrent(generation, repositoryRoot)) return
      const proposal = await this.call('generate-commit-message', {
        repository: repositoryRoot,
        stagedDiff: staged.text,
      })
      if (!this.isGenerationCurrent(generation, repositoryRoot)) return
      if (typeof proposal !== 'string' || proposal.trim().length === 0) {
        throw new Error('generation returned an empty message')
      }
      this.patch({ commitMessage: proposal, generating: false })
    } catch (error) {
      // Stale requests (workspace switched, repository reloaded) publish
      // neither their proposal nor their failure.
      if (!this.isGenerationCurrent(generation, repositoryRoot)) return
      this.patch({ generating: false, generationError: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Whether a generation response still belongs to the newest operation and binding. */
  private isGenerationCurrent(generation: number, repositoryRoot: string): boolean {
    return generation === this.operationGeneration && this.state.repository?.root === repositoryRoot
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
      // Commits, discards, and branch switches may change history: invalidate
      // the loaded graph so the Graph surface reloads instead of rendering the
      // pre-mutation log.
      this.patch({ repository: next, diff: undefined, selectedDiff: undefined, loading: false, graphLoaded: false })
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
