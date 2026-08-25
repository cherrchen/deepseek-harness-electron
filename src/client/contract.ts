/** Stable Git details surface identity shared by slot registration and `ctx.shellDetails`. */

/** Registered `shell.details.surface` id for the Git panel. */
export const GIT_DETAILS_SURFACE_ID = 'git' as const

/** Git panel tabs owned by the client controller. */
export type GitDetailsTab = 'changes' | 'diff' | 'commit'

/** Payload routed through Details Host for the Git surface. */
export interface GitDetailsPayload {
  tab?: GitDetailsTab
  path?: string
}

declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    [GIT_DETAILS_SURFACE_ID]: GitDetailsPayload
  }
}
