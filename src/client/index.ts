/**
 * Details Host plugin, browser half: `ctx.shellDetails` plus on-demand
 * takeover of the AppFrame `details` column.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ShellDetailsService } from './service.ts'

export {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_HOST_ENTRY_ID,
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  SHELL_DETAILS_API_VERSION,
  SHELL_DETAILS_ENABLED_FEATURES,
  SHELL_DETAILS_P0_FEATURES,
} from './contract.ts'
export { DETAILS_HISTORY_LIMIT } from './session-state.ts'
export type {
  DetailsHostInjected,
  DetailsHostState,
  DetailsSurfaceCloseReason,
  DetailsSurfaceDescriptor,
  DetailsSurfaceInstance,
  DetailsSurfaceOwnerProps,
  ShellDetailsController,
  ShellDetailsFeature,
  ShellDetailsOpenRequest,
  ShellDetailsSnapshot,
} from './contract.ts'
export type { DetailsSessionState } from './session-state.ts'
export {
  DetailsSurfaceDuplicateError,
  DetailsSurfaceNotFoundError,
  DetailsTakeoverConflictError,
} from './errors.ts'
export { ShellDetailsService } from './service.ts'
export type { DetailsHostProps } from './DetailsHost.tsx'

/**
 * Declaration-merging table of known surface payloads.
 * Business plugins augment this module (`.../client`); unknown surfaces remain
 * supported with `unknown` payloads.
 */
export interface DetailsSurfacePayloadMap {}

/** Surface ids that have a declared payload entry. */
export type DetailsSurfaceId = keyof DetailsSurfacePayloadMap & string

/** Payload type for a declared surface id. */
export type DetailsSurfacePayload<K extends DetailsSurfaceId> = DetailsSurfacePayloadMap[K]

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Details-column takeover controller. */
    shellDetails: ShellDetailsService
  }
}

/** Required services: slot ledger, panel geometry, and current-session identity. */
export const inject = ['slots', 'layout', 'sessions']

/**
 * Mount `ctx.shellDetails`. Takeover is deferred until `open()`.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.plugin(ShellDetailsService)
}
