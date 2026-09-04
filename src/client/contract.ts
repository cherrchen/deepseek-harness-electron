/** Stable Git details surface identities shared by slot registration and `ctx.shellDetails`. */

/** Registered `shell.details.surface` id for the Git Changes panel. */
export const GIT_CHANGES_SURFACE_ID = 'git.changes' as const

/** Registered `shell.details.surface` id for one Git Diff panel. */
export const GIT_DIFF_SURFACE_ID = 'git.diff' as const

/** Registered `shell.details.surface` id for the Git Graph panel. */
export const GIT_GRAPH_SURFACE_ID = 'git.graph' as const

/** Which sides of the comparison a Diff surface shows. */
export type GitDiffMode = 'worktree' | 'staged'

/** Open arguments for the Changes surface; the repository follows the workspace. */
export interface GitChangesPayload {}

/** Open arguments for one Diff surface tab. */
export interface GitDiffPayload {
  /** Repository-relative changed path. */
  readonly path: string
  /** `true` compares index↔HEAD; `false` compares working tree↔index. */
  readonly staged: boolean
}

/** Open arguments for the Graph surface; the repository follows the workspace. */
export interface GitGraphPayload {}

/**
 * Stable tab key of a diff payload: one tab per path + comparison side, so
 * repeated opens of the same file reuse the tab.
 * @param payload - Diff open payload.
 * @returns The dedupe/tab key.
 */
export function gitDiffTabKey(payload: GitDiffPayload): string {
  return `git:diff:${payload.path}:${payload.staged ? 'staged' : 'worktree'}`
}

declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    [GIT_CHANGES_SURFACE_ID]: GitChangesPayload
    [GIT_DIFF_SURFACE_ID]: GitDiffPayload
    [GIT_GRAPH_SURFACE_ID]: GitGraphPayload
  }
}
