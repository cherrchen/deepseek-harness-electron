/**
 * Typed desktop bridge shared by the Electron preload and main process.
 * Channel names are closed; the renderer never receives a generic invoke API.
 */

import type {
  DesktopNotificationOptions,
  DesktopNotificationResult,
  PickDirectoryOptions,
  PickDirectoryResult,
  ThemeState,
  WindowState,
  DesktopUpdaterSnapshot,
} from './desktop/index.ts'

/** Privileged custom scheme that owns the packaged renderer origin. */
export const RENDERER_SCHEME = 'dsh-electron'

/** Origin loaded by BrowserWindow (`hostname` stays loopback for upstream UI gates). */
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://localhost`

/** Production entry URL for the Electron-owned renderer. */
export const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`

/** Closed IPC channel set for the desktop bridge. */
export const DesktopIpcChannel = {
  getBootstrap: 'deepseek-desktop:host:getBootstrap',
  request: 'deepseek-desktop:host:request',
  openStream: 'deepseek-desktop:host:openStream',
  getVersion: 'deepseek-desktop:app:getVersion',
  getPlatform: 'deepseek-desktop:app:getPlatform',
  pickDirectory: 'deepseek-desktop:dialog:pickDirectory',
  clipboardReadText: 'deepseek-desktop:clipboard:readText',
  clipboardWriteText: 'deepseek-desktop:clipboard:writeText',
  shellOpenExternal: 'deepseek-desktop:shell:openExternal',
  shellOpenPath: 'deepseek-desktop:shell:openPath',
  shellShowItemInFolder: 'deepseek-desktop:shell:showItemInFolder',
  notificationShow: 'deepseek-desktop:notification:show',
  updaterCheck: 'deepseek-desktop:updater:check',
  updaterDownload: 'deepseek-desktop:updater:download',
  updaterInstall: 'deepseek-desktop:updater:install',
  updaterGetState: 'deepseek-desktop:updater:getState',
  updaterSubscribe: 'deepseek-desktop:updater:subscribe',
  themeGetState: 'deepseek-desktop:theme:getState',
  themeSubscribe: 'deepseek-desktop:theme:subscribe',
  windowMinimize: 'deepseek-desktop:window:minimize',
  windowMaximize: 'deepseek-desktop:window:maximize',
  windowClose: 'deepseek-desktop:window:close',
  windowGetState: 'deepseek-desktop:window:getState',
} as const

/** Host boot payload extracted from the supervised dsh web index HTML. */
export interface HostBootstrap {
  /** Raw `window.__DSH_BOOT__` graph object. */
  boot: unknown
  /** Classic-script URLs the Host would preload before the shell (same-origin `/plugins/...`). */
  preloadUrls: string[]
}

/** Unary HTTP request forwarded through the main-process Harness proxy. */
export interface HostHttpRequest {
  /** Absolute or origin-relative URL resolved against the renderer origin. */
  url: string
  /** HTTP method. */
  method: string
  /** Request headers as a plain object (Headers are not structured-clone friendly). */
  headers: Record<string, string>
  /** Optional body text; binary bodies use protocol proxy instead of IPC. */
  body?: string
}

/** Unary HTTP response returned to the renderer through IPC. */
export interface HostHttpResponse {
  /** HTTP status code. */
  status: number
  /** Response status text. */
  statusText: string
  /** Response headers as a plain object. */
  headers: Record<string, string>
  /** Response body text. */
  body: string
}

/** Stream control messages carried on the MessagePort opened for Host event paths. */
export type HostStreamPortMessage =
  | { type: 'open' }
  | { type: 'message'; data: string }
  | { type: 'close' }
  | { type: 'error'; message: string }
  | { type: 'abort' }

/** Unsubscribe handle returned by bridge subscriptions. */
export type DesktopUnsubscribe = () => void

/** Renderer-facing desktop bridge installed as `window.deepseekDesktop`. */
export interface DeepseekDesktopBridge {
  host: {
    /** Fetch Host bootstrap (boot graph + parser preload URLs). */
    getBootstrap(): Promise<HostBootstrap>
    /** Unary Host HTTP request (JSON API paths). */
    request(init: HostHttpRequest): Promise<HostHttpResponse>
    /**
     * Open a Host event stream. The returned MessagePort receives
     * {@link HostStreamPortMessage} frames; posting `{ type: 'abort' }` closes it.
     */
    openStream(path: '/api/events.mux' | '/api/events.host'): Promise<MessagePort>
  }
  app: {
    /** Packaged application version. */
    getVersion(): Promise<string>
    /** Electron `process.platform`. */
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
    /** Request download of an available update (no-op when auto-download owns it). */
    download(): Promise<void>
    /** Request install of a downloaded update (`quitAndInstall` stays in Main). */
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

export type {
  DesktopNotificationOptions,
  DesktopNotificationResult,
  PickDirectoryOptions,
  PickDirectoryResult,
  ThemeState,
  WindowState,
  DesktopUpdaterSnapshot,
}

declare global {
  interface Window {
    /** Typed desktop bridge; undefined outside the Electron renderer. */
    deepseekDesktop?: DeepseekDesktopBridge
  }
}
