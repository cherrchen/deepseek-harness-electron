/**
 * Main-process compatibility proxy to the supervised dsh web loopback origin.
 * The renderer never receives this URL; only Main opens HTTP and WebSocket to it.
 */

import type { MessagePortMain } from 'electron'
import type { HostBootstrap, HostHttpRequest, HostHttpResponse, HostStreamPortMessage } from './bridge-types.ts'
import { extractHostBootstrap } from './bootstrap-extract.ts'

const EVENT_PATHS = new Set(['/api/events.mux', '/api/events.host'])

/** Owns the Harness origin and performs every Main→DSH network call. */
export class HarnessProxy {
  private origin: string | undefined

  /**
   * Bind the ready loopback origin after harness startup.
   * @param origin - Validated `http://127.0.0.1:<port>` origin (no path).
   */
  setOrigin(origin: string): void {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`harness proxy: unsupported origin protocol ${url.protocol}`)
    }
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error(`harness proxy: refusing non-loopback origin ${origin}`)
    }
    this.origin = `${url.protocol}//${url.host}`
  }

  /** Absolute Harness origin, or throw when not ready. */
  requireOrigin(): string {
    if (this.origin === undefined) throw new Error('harness proxy: origin is not ready')
    return this.origin
  }

  /**
   * Fetch Host index HTML and extract the boot graph plus preload URLs.
   * @returns Bootstrap payload for the Electron renderer.
   */
  async getBootstrap(): Promise<HostBootstrap> {
    const response = await fetch(this.requireOrigin() + '/', {
      headers: { accept: 'text/html' },
    })
    if (!response.ok) {
      throw new Error(`harness proxy: bootstrap GET failed with HTTP ${String(response.status)}`)
    }
    return extractHostBootstrap(await response.text())
  }

  /**
   * Forward one unary HTTP request to the Harness origin.
   * @param init - Renderer request (URL resolved against the renderer origin).
   * @returns Plain response suitable for IPC.
   */
  async request(init: HostHttpRequest): Promise<HostHttpResponse> {
    const target = this.resolveHarnessUrl(init.url)
    const headers = { ...init.headers }
    delete headers.host
    delete headers.Host
    delete headers.origin
    delete headers.Origin
    delete headers.referer
    delete headers.Referer
    const response = await fetch(target, {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    })
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: await response.text(),
    }
  }

  /**
   * Proxy a WHATWG Request (custom-scheme protocol handler) to Harness.
   * @param request - Incoming `dsh-electron://` request.
   * @returns Upstream response (streaming body preserved when present).
   */
  async proxyRequest(request: Request): Promise<Response> {
    const incoming = new URL(request.url)
    const target = new URL(incoming.pathname + incoming.search, this.requireOrigin())
    const headers = new Headers(request.headers)
    // Drop browser initiator markers: the Main process is the trusted client.
    // Forwarding `Origin: dsh-electron://localhost` would fail the Host fence
    // against `Host: 127.0.0.1:<port>`.
    headers.delete('host')
    headers.delete('origin')
    headers.delete('referer')
    headers.delete('sec-fetch-site')
    headers.delete('sec-fetch-mode')
    headers.delete('sec-fetch-dest')
    headers.delete('sec-fetch-user')
    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
    }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null) {
      Object.assign(init, { body: request.body, duplex: 'half' })
    }
    return await fetch(new Request(target, init))
  }

  /**
   * Open a real Host WebSocket and bridge frames onto a renderer MessagePort.
   * @param path - `/api/events.mux` or `/api/events.host`.
   * @param port - MessagePort transferred from the preload bridge.
   */
  openStream(path: string, port: MessagePortMain): void {
    if (!EVENT_PATHS.has(path)) {
      port.postMessage({ type: 'error', message: `harness proxy: unsupported stream path ${path}` } satisfies HostStreamPortMessage)
      port.close()
      return
    }
    const wsUrl = new URL(path, this.requireOrigin())
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(wsUrl)
    let closed = false

    const shutdown = (): void => {
      if (closed) return
      closed = true
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      } catch {
        // Socket already gone.
      }
      try {
        port.close()
      } catch {
        // Port already gone.
      }
    }

    socket.addEventListener('open', () => {
      port.postMessage({ type: 'open' } satisfies HostStreamPortMessage)
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        port.postMessage({
          type: 'error',
          message: 'harness proxy: binary WebSocket frame',
        } satisfies HostStreamPortMessage)
        return
      }
      port.postMessage({ type: 'message', data: event.data } satisfies HostStreamPortMessage)
    })
    socket.addEventListener('close', () => {
      if (closed) return
      port.postMessage({ type: 'close' } satisfies HostStreamPortMessage)
      shutdown()
    })
    socket.addEventListener('error', () => {
      port.postMessage({
        type: 'error',
        message: `harness proxy: WebSocket error on ${path}`,
      } satisfies HostStreamPortMessage)
      shutdown()
    })

    port.on('message', (event) => {
      const data = event.data as HostStreamPortMessage
      if (data?.type === 'abort') shutdown()
    })
    port.start()
  }

  /**
   * Map a renderer URL onto the Harness origin.
   * @param url - Absolute `dsh-electron://` URL or path.
   * @returns Absolute Harness URL.
   */
  resolveHarnessUrl(url: string): string {
    const parsed = new URL(url, 'dsh-electron://localhost/')
    return new URL(parsed.pathname + parsed.search, this.requireOrigin()).href
  }
}
