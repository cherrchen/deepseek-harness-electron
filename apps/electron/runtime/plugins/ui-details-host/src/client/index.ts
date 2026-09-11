/**
 * Details Host plugin, browser half: `ctx.shellDetails` plus on-demand
 * takeover of the AppFrame `details` column.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ShellDetailsService } from './service.ts'

export {
  CONVERSATION_HEADER_UTILITIES_SLOT,
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_HOST_ENTRY_ID,
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  DETAILS_TOGGLE_ENTRY_ID,
  DETAILS_TOGGLE_PRIORITY,
  SHELL_DETAILS_API_VERSION,
  SHELL_DETAILS_ENABLED_FEATURES,
  SHELL_DETAILS_LOCALE_NS,
  SHELL_DETAILS_P0_FEATURES,
} from './contract.ts'
export { DETAILS_TAB_LIMIT } from './session-state.ts'
export type {
  DetailsHostInjected,
  DetailsHostState,
  DetailsSurfaceCloseReason,
  DetailsSurfaceDescriptor,
  DetailsSurfaceInstance,
  DetailsIcon,
  DetailsLauncherContribution,
  DetailsSurfaceOwnerProps,
  DetailsToggleInjected,
  ShellDetailsController,
  ShellDetailsFeature,
  ShellDetailsOpenRequest,
  ShellDetailsSnapshot,
} from './contract.ts'
export type { DetailsSessionState } from './session-state.ts'
export { DetailsLauncherRegistry } from './launcher.ts'
export {
  DetailsSurfaceDuplicateError,
  DetailsSurfaceNotFoundError,
  DetailsTakeoverConflictError,
} from './errors.ts'
export { ShellDetailsService } from './service.ts'
export { DetailsHeaderAction } from './DetailsHeaderAction.tsx'
export type { DetailsHeaderActionProps } from './DetailsHeaderAction.tsx'
export type { DetailsHostProps } from './DetailsHost.tsx'
export type { DetailsToggleProps } from './DetailsToggle.tsx'

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

/** Required services: slot ledger, panel geometry, session identity, and locale copy. */
export const inject = ['slots', 'layout', 'sessions', 'locale']

/**
 * Mount `ctx.shellDetails`. Takeover is deferred until `open()`.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.plugin(ShellDetailsService)
}
