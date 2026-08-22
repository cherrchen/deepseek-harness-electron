/**
 * Desktop capability provider: adapts window.deepseekDesktop into ctx.desktop.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { DesktopCapabilitiesService } from './service.ts'

export type { DesktopCapabilitiesContract } from './contract.ts'
export { createDesktopCapabilities, requireDesktopBridge } from './contract.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Approved desktop capabilities for Electron feature plugins. */
    desktop: import('./contract.ts').DesktopCapabilitiesContract
  }
}

/**
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.plugin(DesktopCapabilitiesService)
}
