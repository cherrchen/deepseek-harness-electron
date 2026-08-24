/** Stable Git details surface identity shared by slot registration and `ctx.shellDetails`. */

/** Registered `shell.details.surface` id for the Git panel. */
export const GIT_DETAILS_SURFACE_ID = 'git' as const

/** Git panel tabs owned by the client controller. */
export type GitDetailsTab = 'changes' | 'diff' | 'commit'
