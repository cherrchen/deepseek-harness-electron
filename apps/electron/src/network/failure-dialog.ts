import type { BrowserWindow, MessageBoxOptions } from 'electron'
import type { DesktopMainMessages } from '../locale.ts'
import type { DesktopNetworkIncidentSummary } from './domain.ts'

/** A Main-owned native dialog action; permanent Default requires a second confirmation. */
export type NetworkFailureAction = 'retry' | 'default-once' | 'default-always' | 'open-settings' | 'dismiss'

/** Narrow dialog adapter for deterministic action tests. */
export interface NetworkDialog {
  showMessageBox(window: BrowserWindow | undefined, options: MessageBoxOptions): Promise<{ response: number }>
}

/** Present a sanitized real-traffic failure without putting credentials in native dialog text. */
export async function presentNetworkFailure(options: {
  incident: DesktopNetworkIncidentSummary
  messages: DesktopMainMessages
  window?: BrowserWindow
  dialog: NetworkDialog
}): Promise<NetworkFailureAction> {
  const { incident, messages, window, dialog } = options
  const endpoint = incident.route?.host === undefined
    ? '' : `\n${incident.route.kind.toUpperCase()} ${incident.route.host}:${String(incident.route.port)}`
  const result = await dialog.showMessageBox(window, {
    type: 'warning', title: messages.networkFailureTitle,
    message: messages.networkFailureTitle,
    detail: `${messages.networkFailureBody}\n${incident.mode.toUpperCase()}${endpoint}\n${incident.failure.code}`,
    buttons: [
      messages.networkFailureRetry, messages.networkFailureDefaultOnce,
      messages.networkFailureSettings, messages.networkFailureDismiss,
    ],
    defaultId: 3, cancelId: 3, noLink: true,
  })
  switch (result.response) {
    case 0: return 'retry'
    case 1: {
      const confirm = await dialog.showMessageBox(window, {
        type: 'question', title: messages.networkFailurePermanentTitle,
        message: messages.networkFailurePermanentTitle,
        detail: messages.networkFailurePermanentBody,
        buttons: [messages.networkFailurePermanentOnce, messages.networkFailurePermanentConfirm],
        defaultId: 0, cancelId: 0, noLink: true,
      })
      return confirm.response === 1 ? 'default-always' : 'default-once'
    }
    case 2: return 'open-settings'
    default: return 'dismiss'
  }
}
