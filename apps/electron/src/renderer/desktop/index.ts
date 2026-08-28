/**
 * Thin renderer facades over `window.deepseekDesktop`.
 * UI code imports these instead of reading IPC channel names.
 */

import type {
  DesktopNotificationOptions,
  DesktopNotificationResult,
  DesktopUnsubscribe,
  DesktopUpdaterSnapshot,
  PickDirectoryOptions,
  PickDirectoryResult,
  ThemeState,
  WindowState,
} from '../../bridge-types.ts'

function requireBridge(): NonNullable<Window['deepseekDesktop']> {
  const bridge = window.deepseekDesktop
  if (bridge === undefined) {
    throw new Error('desktop renderer: window.deepseekDesktop is missing')
  }
  return bridge
}

/** Directory picker facade. */
export const dialog = {
  pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult | null> {
    return requireBridge().dialog.pickDirectory(options)
  },
}

/** Clipboard facade. */
export const clipboard = {
  readText(): Promise<string> {
    return requireBridge().clipboard.readText()
  },
  writeText(text: string): Promise<void> {
    return requireBridge().clipboard.writeText(text)
  },
}

/** Shell facade. */
export const shell = {
  openExternal(url: string): Promise<void> {
    return requireBridge().shell.openExternal(url)
  },
  openPath(path: string): Promise<void> {
    return requireBridge().shell.openPath(path)
  },
  showItemInFolder(path: string): Promise<void> {
    return requireBridge().shell.showItemInFolder(path)
  },
}

/** Notification facade. */
export const notification = {
  show(options: DesktopNotificationOptions): Promise<DesktopNotificationResult> {
    return requireBridge().notification.show(options)
  },
}

/** Updater facade. */
export const updater = {
  check(): Promise<void> {
    return requireBridge().updater.check()
  },
  download(): Promise<void> {
    return requireBridge().updater.download()
  },
  install(): Promise<void> {
    return requireBridge().updater.install()
  },
  getState(): Promise<DesktopUpdaterSnapshot> {
    return requireBridge().updater.getState()
  },
  subscribe(callback: (state: DesktopUpdaterSnapshot) => void): DesktopUnsubscribe {
    return requireBridge().updater.subscribe(callback)
  },
}

/** Theme facade. */
export const theme = {
  getState(): Promise<ThemeState> {
    return requireBridge().theme.getState()
  },
  subscribe(callback: (state: ThemeState) => void): DesktopUnsubscribe {
    return requireBridge().theme.subscribe(callback)
  },
}

/** Application facade. */
export const app = {
  getVersion(): Promise<string> {
    return requireBridge().app.getVersion()
  },
  getPlatform(): Promise<string> {
    return requireBridge().app.getPlatform()
  },
  relaunch(): Promise<void> {
    return requireBridge().app.relaunch()
  },
}

/** Window facade. */
export const windowControls = {
  minimize(): Promise<void> {
    return requireBridge().window.minimize()
  },
  maximize(): Promise<void> {
    return requireBridge().window.maximize()
  },
  close(): Promise<void> {
    return requireBridge().window.close()
  },
  getState(): Promise<WindowState> {
    return requireBridge().window.getState()
  },
}

export {
  app as desktopApp,
  dialog as desktopDialog,
  clipboard as desktopClipboard,
  shell as desktopShell,
  notification as desktopNotification,
  updater as desktopUpdater,
  theme as desktopTheme,
  windowControls as desktopWindow,
}
