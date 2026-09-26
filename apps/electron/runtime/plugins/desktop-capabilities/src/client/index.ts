/**
 * Desktop capability provider: adapts window.deepseekDesktop into ctx.desktop.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { DesktopCapabilitiesService } from './service.ts'

export type { DesktopCapabilitiesContract } from './contract.ts'
export type {
  DesktopNetworkConfigInput, DesktopNetworkDiagnostics, DesktopNetworkMode,
  DesktopNetworkReloadResult, DesktopNetworkRetryResult, DesktopNetworkState,
  DesktopNetworkTestRequest, DesktopNetworkTestResult, DesktopNetworkTestItem, ManualProxyInput,
  SanitizedManualProxy,
} from './contract.ts'
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
