/**
 * Details Host plugin, browser half: `ctx.shellDetails` plus on-demand
 * takeover of the AppFrame `details` column.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ShellDetailsService } from './service.ts'

export {
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
} from './contract.ts'
export type {
  DetailsHostInjected,
  DetailsHostState,
  ShellDetailsController,
} from './contract.ts'
export { ShellDetailsService } from './service.ts'
export type { DetailsHostProps } from './DetailsHost.tsx'

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
