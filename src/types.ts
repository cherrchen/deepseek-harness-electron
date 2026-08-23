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

/** Diff text with its normalized repository identity. */
export interface GitDiff {
  readonly repository: string
  readonly staged: boolean
  readonly path?: string
  readonly text: string
}
