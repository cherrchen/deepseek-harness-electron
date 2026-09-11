/** Portable Git repository operations over `ctx.subprocess`. */

import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { GIT_LOG_FORMAT, parseGitLog } from './log.ts'
import { parseBranches, parsePorcelainV2 } from './status.ts'
import type { GitCommitSummary, GitDiff, GitFileChange, GitLogScope, GitRepositorySnapshot } from './types.ts'

/** Extra `git log` arguments implementing one history scope. */
function logScopeArgs(scope: GitLogScope): readonly string[] {
  if (scope === 'all') return ['--all']
  if (scope === 'first-parent') return ['--first-parent']
  return []
}

/** Resolved Git process policy. */
export interface GitServiceOptions {
  readonly executable: string
  readonly maxOutputBytes: number
  readonly graceMs: number
}

/** Failure from a settled Git invocation. */
export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message)
    this.name = 'GitCommandError'
  }
}

/** Cohesive local-repository service consumed by RPC and same-process plugins. */
export class GitService {
  private executable: Promise<string> | undefined

  constructor(
    private readonly subprocess: SubprocessRuntime,
    private readonly options: GitServiceOptions,
  ) {}

  /**
   * Locate the repository containing a path.
   * @param path - Existing path used as the Git working directory.
   * @param signal - Optional command cancellation signal.
   * @returns Repository root, or `null` when the path is outside a repository.
   */
  async discover(path: string, signal?: AbortSignal): Promise<string | null> {
    try {
      return (await this.run(path, ['rev-parse', '--show-toplevel'], signal)).trim()
    } catch (error) {
      if (error instanceof GitCommandError && /not a git repository/iu.test(error.stderr)) return null
      throw error
    }
  }

  /**
   * Read a complete repository snapshot.
   * @param repository - Repository working directory.
   * @param signal - Optional command cancellation signal.
   * @returns Normalized identity, status, and local branches.
   */
  async status(repository: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    const root = (await this.run(repository, ['rev-parse', '--show-toplevel'], signal)).trim()
    const [versionText, statusText, branchText] = await Promise.all([
      this.run(root, ['--version'], signal),
      this.run(root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], signal),
      this.run(root, ['for-each-ref', '--format=%(refname:short)%00%(objectname)%00%(HEAD)', 'refs/heads'], signal),
    ])
    const parsed = parsePorcelainV2(statusText)
    return {
      root,
      version: versionText.trim().replace(/^git version\s+/u, ''),
      ...parsed,
      branches: parseBranches(branchText),
    }
  }

  /**
   * Read a working-tree or staged diff.
   * @param repository - Repository working directory.
   * @param staged - Whether to compare the index instead of the working tree.
   * @param path - Optional repository-relative path filter.
   * @param signal - Optional command cancellation signal.
   * @returns Plain, colorless diff text and its repository identity.
   */
  async diff(repository: string, staged: boolean, path?: string, signal?: AbortSignal): Promise<GitDiff> {
    const args = ['diff', '--no-ext-diff', '--no-color', ...staged ? ['--cached'] : []]
    if (path !== undefined) args.push('--', path)
    return { repository, staged, ...path === undefined ? {} : { path }, text: await this.run(repository, args, signal) }
  }

  /**
   * Stage one path, or all paths when omitted.
   * @param repository - Repository working directory.
   * @param change - Optional complete change record. Its target path is staged.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the index update.
   */
  async stage(repository: string, change?: GitFileChange, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, change === undefined ? ['add', '--all'] : ['add', '--', change.path], signal)
    return this.status(repository, signal)
  }

  /**
   * Remove one path, or every path, from the index without changing the working tree.
   * @param repository - Repository working directory.
   * @param change - Optional complete change record. Renames reset both paths.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the index update.
   */
  async unstage(repository: string, change?: GitFileChange, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, change === undefined ? ['reset', '--mixed'] : ['reset', '--mixed', '--', ...changePaths(change)], signal)
    return this.status(repository, signal)
  }

  /**
   * Commit the staged index with a non-empty message.
   * @param repository - Repository working directory.
   * @param message - Commit message passed as one argv value.
   * @param signal - Optional command cancellation signal.
   * @param amend - When true, rewrite HEAD instead of creating a new commit.
   * @returns Repository snapshot after the commit.
   */
  async commit(repository: string, message: string, signal?: AbortSignal, amend: boolean = false): Promise<GitRepositorySnapshot> {
    const normalized = message.trim()
    if (normalized.length === 0) throw new Error('commit message must not be empty')
    await this.run(
      repository,
      amend ? ['commit', '--amend', '-m', normalized] : ['commit', '-m', normalized],
      signal,
    )
    return this.status(repository, signal)
  }

  /**
   * Push the current branch to `origin`, creating upstream tracking on first push.
   * @param repository - Repository working directory.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the push.
   */
  async push(repository: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, ['push', '--set-upstream', 'origin', 'HEAD'], signal)
    return this.status(repository, signal)
  }

  /**
   * Rebase the current branch onto its upstream, then push.
   * @param repository - Repository working directory.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the sync.
   */
  async sync(repository: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, ['pull', '--rebase', '--autostash'], signal)
    await this.run(repository, ['push'], signal)
    return this.status(repository, signal)
  }

  /**
   * Discard working-tree, HEAD, or untracked content. Destructive: callers
   * confirm before invoking.
   * @param repository - Repository working directory.
   * @param change - Optional complete change record. Required for `head` and `untracked`.
   * @param signal - Optional command cancellation signal.
   * @param mode - `worktree` restores the index, `head` restores both index and working tree from HEAD, `untracked` deletes the path.
   * @returns Repository snapshot after the discard.
   */
  async discard(
    repository: string,
    change?: GitFileChange,
    signal?: AbortSignal,
    mode: 'worktree' | 'head' | 'untracked' = 'worktree',
  ): Promise<GitRepositorySnapshot> {
    if (mode === 'untracked') {
      if (change === undefined) throw new Error('untracked discard requires a change record')
      await this.run(repository, ['clean', '-f', '--', change.path], signal)
      return this.status(repository, signal)
    }
    if (mode === 'head') {
      if (change === undefined) throw new Error('HEAD discard requires a change record')
      await this.discardHead(repository, change, signal)
      return this.status(repository, signal)
    }
    if (change === undefined) await this.run(repository, ['checkout', '--', '.'], signal)
    else await this.discardWorktree(repository, change, signal)
    return this.status(repository, signal)
  }

  /** Restore one staged change to HEAD, including paths absent from HEAD with later working-tree edits. */
  private async discardHead(repository: string, change: GitFileChange, signal?: AbortSignal): Promise<void> {
    const indexStatus = change.status[0]
    if (indexStatus === 'A' || indexStatus === 'C') {
      await this.run(repository, ['rm', '-f', '--cached', '--', change.path], signal)
      await this.run(repository, ['clean', '-f', '--', change.path], signal)
      return
    }
    if (indexStatus === 'R' && change.originalPath !== undefined) {
      await this.run(repository, ['rm', '-f', '--cached', '--', change.path], signal)
      await this.run(repository, ['clean', '-f', '--', change.path], signal)
      await this.run(repository, ['checkout', 'HEAD', '--', change.originalPath], signal)
      return
    }
    await this.run(repository, ['checkout', 'HEAD', '--', change.path], signal)
  }

  /** Restore one working-tree change while retaining the index. */
  private async discardWorktree(repository: string, change: GitFileChange, signal?: AbortSignal): Promise<void> {
    const worktreeStatus = change.status[1]
    if (worktreeStatus === 'A' || worktreeStatus === 'C') {
      await this.run(repository, ['clean', '-f', '--', change.path], signal)
      return
    }
    if (worktreeStatus === 'R' && change.originalPath !== undefined) {
      await this.run(repository, ['clean', '-f', '--', change.path], signal)
      await this.run(repository, ['checkout', '--', change.originalPath], signal)
      return
    }
    await this.run(repository, ['checkout', '--', change.path], signal)
  }

  /**
   * Read one bounded page of commit history, newest first.
   * @param repository - Repository working directory.
   * @param limit - Page size; callers page forward with `skip`.
   * @param skip - Number of commits to offset before the first returned row.
   * @param scope - History scope: HEAD ancestry (`auto`), all refs (`all`),
   *   or the HEAD first-parent chain (`first-parent`).
   * @param signal - Optional command cancellation signal.
   * @returns Commit rows in output order (newest first).
   */
  async log(
    repository: string,
    limit: number,
    skip: number,
    scope: GitLogScope = 'auto',
    signal?: AbortSignal,
  ): Promise<readonly GitCommitSummary[]> {
    const cappedLimit = Math.max(1, Math.min(1000, Math.floor(limit)))
    const cappedSkip = Math.max(0, Math.floor(skip))
    const text = await this.run(repository, [
      'log', `--max-count=${cappedLimit}`, `--skip=${cappedSkip}`,
      `--format=${GIT_LOG_FORMAT}`, '--date-order', ...logScopeArgs(scope),
    ], signal)
    return parseGitLog(text)
  }

  /**
   * Create a local branch without switching to it.
   * @param repository - Repository working directory.
   * @param branch - Non-empty local branch name passed as one argv value.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot containing the new branch.
   */
  async createBranch(repository: string, branch: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, ['branch', requireBranch(branch)], signal)
    return this.status(repository, signal)
  }

  /**
   * Switch to an existing local branch.
   * @param repository - Repository working directory.
   * @param branch - Existing local branch name passed as one argv value.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after switching branches.
   */
  async switchBranch(repository: string, branch: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, ['switch', requireBranch(branch)], signal)
    return this.status(repository, signal)
  }

  private async run(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
    this.executable ??= this.subprocess.resolveExecutable(this.options.executable, undefined, signal)
    const executable = await this.executable
    const handle = this.subprocess.spawn({
      argv: [executable, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: this.options.maxOutputBytes },
        stderr: { maxBytes: this.options.maxOutputBytes },
      },
      graceMs: this.options.graceMs,
      signal,
      env: {
        GIT_OPTIONAL_LOCKS: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        NO_COLOR: '1',
        TERM: 'dumb',
        // Filenames are literal pathspecs; magic prefixes such as `:(glob)` stay one path.
        GIT_LITERAL_PATHSPECS: '1',
      },
    })
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    if (stdout?.lossy === true || stderr?.lossy === true) {
      throw new GitCommandError(`git ${args[0] ?? 'command'} output exceeded ${this.options.maxOutputBytes} bytes`, outcome.exitCode, stderr?.text ?? '')
    }
    if (outcome.exitCode !== 0) {
      throw new GitCommandError(stderr?.text.trim() || `git ${args[0] ?? 'command'} failed`, outcome.exitCode, stderr?.text ?? '')
    }
    return stdout?.text ?? ''
  }
}

/** Cordis declaration for the portable service. */
declare module '@deepseek-ai/cordis' {
  interface Context {
    git: GitService
  }
}

/**
 * Read the Git service from a typed Host context.
 * @param ctx - Context whose active composition provides `git`.
 * @returns Installed Git service.
 */
export function gitService(ctx: Context): GitService {
  return ctx.git
}

function requireBranch(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error('branch name must not be empty')
  return normalized
}

/** Paths that represent one rename as a single index operation. */
function changePaths(change: GitFileChange): readonly string[] {
  return change.originalPath === undefined ? [change.path] : [change.path, change.originalPath]
}
