/**
 * Typed desktop bridge shared by the Electron preload and main process.
 * Channel names are closed; the renderer never receives a generic invoke API.
 */

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
}

declare global {
  interface Window {
    /** Typed desktop bridge; undefined outside the Electron renderer. */
    deepseekDesktop?: DeepseekDesktopBridge
  }
}
