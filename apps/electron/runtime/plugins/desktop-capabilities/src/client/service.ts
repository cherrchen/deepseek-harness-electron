/**
 * Desktop capability provider service (`ctx.desktop`).
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopCapabilitiesContract } from './contract.ts'
import { createDesktopCapabilities, requireDesktopBridge } from './contract.ts'

/** The `ctx.desktop` capability adapter over the typed preload bridge. */
export class DesktopCapabilitiesService extends Service implements DesktopCapabilitiesContract {
  readonly app: DesktopCapabilitiesContract['app']
  readonly dialog: DesktopCapabilitiesContract['dialog']
  readonly clipboard: DesktopCapabilitiesContract['clipboard']
  readonly shell: DesktopCapabilitiesContract['shell']
  readonly notification: DesktopCapabilitiesContract['notification']
  readonly updater: DesktopCapabilitiesContract['updater']
  readonly theme: DesktopCapabilitiesContract['theme']
  readonly window: DesktopCapabilitiesContract['window']

  /**
   * @param ctx - Client root context.
   */
  constructor(ctx: Context) {
    super(ctx, 'desktop')
    const capabilities = createDesktopCapabilities(requireDesktopBridge())
    this.app = capabilities.app
    this.dialog = capabilities.dialog
    this.clipboard = capabilities.clipboard
    this.shell = capabilities.shell
    this.notification = capabilities.notification
    this.updater = capabilities.updater
    this.theme = capabilities.theme
    this.window = capabilities.window
  }
}
