/** Browser-safe Git domain records shared by the Host and Client halves. */

/** One normalized path change reported by Git. */
export interface GitFileChange {
  /** Repository-relative current path. */
  readonly path: string
  /** Repository-relative source path for a rename or copy. */
  readonly originalPath?: string
  /** Two-character porcelain-v2 index/worktree status. */
  readonly status: string
}

/** One local branch. */
export interface GitBranch {
  readonly name: string
  readonly head: string
  readonly current: boolean
}

/** Complete repository state required by the first Git client experience. */
export interface GitRepositorySnapshot {
  readonly root: string
  readonly version: string
  readonly branch: string | null
  readonly head: string | null
  readonly staged: readonly GitFileChange[]
  readonly unstaged: readonly GitFileChange[]
  readonly untracked: readonly string[]
  readonly branches: readonly GitBranch[]
}

/** History scope of a `git log` query. */
export type GitLogScope =
  /** HEAD ancestry (default `git log` behavior). */
  | 'auto'
  /** All refs and their ancestry (`git log --all`). */
  | 'all'
  /** First-parent chain of HEAD (`git log --first-parent`). */
  | 'first-parent'

/** Diff text with its normalized repository identity. */
export interface GitDiff {
  readonly repository: string
  readonly staged: boolean
  readonly path?: string
  readonly text: string
}

/** One parsed commit from `git log`, in topological/date order. */
export interface GitCommitSummary {
  /** Full commit hash. */
  readonly hash: string
  /** Abbreviated commit hash. */
  readonly shortHash: string
  /** Parent hashes, oldest first; empty for a root commit. */
  readonly parents: readonly string[]
  /** Commit subject line. */
  readonly subject: string
  /** Author name. */
  readonly author: string
  /** Author date, ISO-8601. */
  readonly date: string
  /** Decorations for the commit: branch names, tags, and `HEAD`. */
  readonly refs: readonly string[]
}
