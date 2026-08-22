/**
 * Approved desktop capability groups exposed to Electron feature plugins.
 * Mirrors the typed preload bridge without exposing host transport or raw IPC.
 */

/** Options forwarded to Electron Main's directory chooser. */
export interface PickDirectoryOptions {
  /** Dialog title shown by the OS chooser. */
  title?: string
  /** Initial directory shown by the OS chooser. */
  defaultPath?: string
}

/** Result of a successful directory pick, or null when cancelled. */
export interface PickDirectoryResult {
  /** Absolute path selected by the user. */
  path: string
}

/** OS notification payload validated by Electron Main. */
export interface DesktopNotificationOptions {
  /** Notification title. */
  title: string
  /** Notification body text. */
  body?: string
  /** Opaque payload echoed on click handling in Main. */
  payload?: string
}

/** Result of showing an OS notification. */
export interface DesktopNotificationResult {
  /** Whether the notification was shown. */
  shown: boolean
}

/** Native theme snapshot from Electron Main. */
export interface ThemeState {
  /** Whether the OS prefers dark colors. */
  shouldUseDarkColors: boolean
  /** Electron nativeTheme.themeSource value. */
  themeSource: 'system' | 'light' | 'dark'
}

/** Main window snapshot from Electron Main. */
export interface WindowState {
  /** Whether the main window is maximized. */
  isMaximized: boolean
  /** Whether the main window is in fullscreen mode. */
  isFullScreen: boolean
}

/** Updater snapshot from Electron Main. */
export interface DesktopUpdaterSnapshot {
  /** Current updater lifecycle state. */
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  /** Download progress percentage when downloading. */
  progress?: number
  /** Active update channel. */
  channel: 'stable' | 'prerelease'
}

/** Unsubscribe handle returned by desktop capability subscriptions. */
export type DesktopUnsubscribe = () => void

/** Renderer-facing desktop capabilities for feature plugins (`ctx.desktop`). */
export interface DesktopCapabilitiesContract {
  app: {
    /** Packaged application version. */
    getVersion(): Promise<string>
    /** Electron process.platform. */
    getPlatform(): Promise<string>
  }
  dialog: {
    /** Open the OS directory chooser owned by Electron Main. */
    pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult | null>
  }
  clipboard: {
    /** Read text from the system clipboard. */
    readText(): Promise<string>
    /** Write text to the system clipboard. */
    writeText(text: string): Promise<void>
  }
  shell: {
    /** Open an allowlisted URL with the OS default handler. */
    openExternal(url: string): Promise<void>
    /** Open a local path with the OS default application. */
    openPath(path: string): Promise<void>
    /** Reveal a local path in the OS file manager. */
    showItemInFolder(path: string): Promise<void>
  }
  notification: {
    /** Show an OS notification; click handling stays in Main. */
    show(options: DesktopNotificationOptions): Promise<DesktopNotificationResult>
  }
  updater: {
    /** Request an update check. */
    check(): Promise<void>
    /** Request download of an available update. */
    download(): Promise<void>
    /** Request install of a downloaded update. */
    install(): Promise<void>
    /** Read the current updater snapshot. */
    getState(): Promise<DesktopUpdaterSnapshot>
    /** Subscribe to updater snapshot changes. */
    subscribe(callback: (state: DesktopUpdaterSnapshot) => void): DesktopUnsubscribe
  }
  theme: {
    /** Read the current native theme snapshot. */
    getState(): Promise<ThemeState>
    /** Subscribe to native theme changes. */
    subscribe(callback: (state: ThemeState) => void): DesktopUnsubscribe
  }
  window: {
    /** Minimize the main window. */
    minimize(): Promise<void>
    /** Toggle maximize on the main window. */
    maximize(): Promise<void>
    /** Close (hide-to-tray) the main window. */
    close(): Promise<void>
    /** Read the current window snapshot. */
    getState(): Promise<WindowState>
  }
}

/** Typed preload bridge subset used by the desktop capability provider. */
interface DesktopBridge {
  app: DesktopCapabilitiesContract['app']
  dialog: DesktopCapabilitiesContract['dialog']
  clipboard: DesktopCapabilitiesContract['clipboard']
  shell: DesktopCapabilitiesContract['shell']
  notification: DesktopCapabilitiesContract['notification']
  updater: DesktopCapabilitiesContract['updater']
  theme: DesktopCapabilitiesContract['theme']
  window: DesktopCapabilitiesContract['window']
}

declare global {
  interface Window {
    /** Typed desktop bridge; undefined outside the Electron renderer. */
    deepseekDesktop?: DesktopBridge
  }
}

/**
 * Read the typed preload bridge installed on window.
 * @returns The desktop bridge.
 */
export function requireDesktopBridge(): DesktopBridge {
  const bridge = globalThis.window?.deepseekDesktop
  if (bridge === undefined) {
    throw new Error('desktop capabilities: window.deepseekDesktop is unavailable')
  }
  return bridge
}

/**
 * Wrap the preload bridge as the stable desktop capability contract.
 * @param bridge - Typed preload bridge from window.deepseekDesktop.
 * @returns Capability groups exposed through ctx.desktop.
 */
export function createDesktopCapabilities(bridge: DesktopBridge): DesktopCapabilitiesContract {
  return {
    app: {
      getVersion: () => bridge.app.getVersion(),
      getPlatform: () => bridge.app.getPlatform(),
    },
    dialog: {
      pickDirectory: options => bridge.dialog.pickDirectory(options),
    },
    clipboard: {
      readText: () => bridge.clipboard.readText(),
      writeText: text => bridge.clipboard.writeText(text),
    },
    shell: {
      openExternal: url => bridge.shell.openExternal(url),
      openPath: path => bridge.shell.openPath(path),
      showItemInFolder: path => bridge.shell.showItemInFolder(path),
    },
    notification: {
      show: options => bridge.notification.show(options),
    },
    updater: {
      check: () => bridge.updater.check(),
      download: () => bridge.updater.download(),
      install: () => bridge.updater.install(),
      getState: () => bridge.updater.getState(),
      subscribe: callback => bridge.updater.subscribe(callback),
    },
    theme: {
      getState: () => bridge.theme.getState(),
      subscribe: callback => bridge.theme.subscribe(callback),
    },
    window: {
      minimize: () => bridge.window.minimize(),
      maximize: () => bridge.window.maximize(),
      close: () => bridge.window.close(),
      getState: () => bridge.window.getState(),
    },
  }
}
