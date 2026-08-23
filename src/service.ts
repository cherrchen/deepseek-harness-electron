/** Portable Git repository operations over `ctx.subprocess`. */

import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { parseBranches, parsePorcelainV2 } from './status.ts'
import type { GitDiff, GitRepositorySnapshot } from './types.ts'

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
   * @param path - Optional repository-relative path.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the index update.
   */
  async stage(repository: string, path?: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, path === undefined ? ['add', '--all'] : ['add', '--', path], signal)
    return this.status(repository, signal)
  }

  /**
   * Remove one path, or every path, from the index without changing the working tree.
   * @param repository - Repository working directory.
   * @param path - Optional repository-relative path.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the index update.
   */
  async unstage(repository: string, path?: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    await this.run(repository, path === undefined ? ['reset', '--mixed'] : ['reset', '--mixed', '--', path], signal)
    return this.status(repository, signal)
  }

  /**
   * Commit the staged index with a non-empty message.
   * @param repository - Repository working directory.
   * @param message - Commit message passed as one argv value.
   * @param signal - Optional command cancellation signal.
   * @returns Repository snapshot after the commit.
   */
  async commit(repository: string, message: string, signal?: AbortSignal): Promise<GitRepositorySnapshot> {
    const normalized = message.trim()
    if (normalized.length === 0) throw new Error('commit message must not be empty')
    await this.run(repository, ['commit', '-m', normalized], signal)
    return this.status(repository, signal)
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
      env: { GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat', NO_COLOR: '1', TERM: 'dumb' },
    })
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0) {
      throw new GitCommandError(stderr.trim() || `git ${args[0] ?? 'command'} failed`, outcome.exitCode, stderr)
    }
    return stdout
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
