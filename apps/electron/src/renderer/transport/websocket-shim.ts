/**
 * Renderer WebSocket stand-in for Host event streams.
 * Unmodified WebApiClient opens `ws://…/api/events.*`; custom schemes cannot
 * carry native WebSockets, so those paths ride MessagePort → Main → real WS.
 */

import type { HostStreamPortMessage } from '../../bridge-types.ts'

const EVENT_PATHS = new Set(['/api/events.mux', '/api/events.host'])

export const DESKTOP_WS_CONNECTING = 0
export const DESKTOP_WS_OPEN = 1
export const DESKTOP_WS_CLOSING = 2
export const DESKTOP_WS_CLOSED = 3

/**
 * Install a global `WebSocket` that bridges Host event paths through the desktop IPC port.
 */
export function installDesktopWebSocket(): void {
  const native = globalThis.WebSocket
  const bridge = globalThis.window?.deepseekDesktop
  if (bridge === undefined) {
    throw new Error('desktop websocket: window.deepseekDesktop is missing')
  }

  const StandIn = function DesktopWebSocket(
    this: unknown,
    url: string | URL,
  ): DesktopWebSocketImpl {
    return new DesktopWebSocketImpl(String(url), bridge, native)
  } as unknown as typeof WebSocket

  StandIn.CONNECTING = native?.CONNECTING ?? DESKTOP_WS_CONNECTING
  StandIn.OPEN = native?.OPEN ?? DESKTOP_WS_OPEN
  StandIn.CLOSING = native?.CLOSING ?? DESKTOP_WS_CLOSING
  StandIn.CLOSED = native?.CLOSED ?? DESKTOP_WS_CLOSED
  globalThis.WebSocket = StandIn
}

class DesktopWebSocketImpl {
  url: string
  readyState = DESKTOP_WS_CONNECTING
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  private port: MessagePort | undefined

  constructor(
    url: string,
    bridge: NonNullable<Window['deepseekDesktop']>,
    native: typeof WebSocket | undefined,
  ) {
    this.url = url
    const parsed = new URL(url, globalThis.location.origin)
    if (!EVENT_PATHS.has(parsed.pathname)) {
      if (native === undefined) throw new Error(`desktop websocket: no native WebSocket for ${url}`)
      const socket = new native(url)
      this.url = socket.url
      this.readyState = socket.readyState
      this.addEventListener = socket.addEventListener.bind(socket)
      this.removeEventListener = socket.removeEventListener.bind(socket)
      this.close = socket.close.bind(socket)
      return
    }
    const path = parsed.pathname as '/api/events.mux' | '/api/events.host'
    void this.open(path, bridge)
  }

  close(): void {
    if (this.readyState === DESKTOP_WS_CLOSING || this.readyState === DESKTOP_WS_CLOSED) return
    this.readyState = DESKTOP_WS_CLOSING
    this.port?.postMessage({ type: 'abort' } satisfies HostStreamPortMessage)
    this.port?.close()
    this.port = undefined
    this.readyState = DESKTOP_WS_CLOSED
    this.emit('close', new CloseEvent('close'))
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener)
  }

  private emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event)
      else listener.handleEvent(event)
    }
  }

  private async open(
    path: '/api/events.mux' | '/api/events.host',
    bridge: NonNullable<Window['deepseekDesktop']>,
  ): Promise<void> {
    try {
      const port = await bridge.host.openStream(path)
      this.port = port
      port.addEventListener('message', (event) => {
        const message = event.data as HostStreamPortMessage
        switch (message.type) {
          case 'open':
            this.readyState = DESKTOP_WS_OPEN
            this.emit('open', new Event('open'))
            break
          case 'message':
            this.emit('message', new MessageEvent('message', { data: message.data }))
            break
          case 'close':
            this.readyState = DESKTOP_WS_CLOSED
            this.emit('close', new CloseEvent('close'))
            port.close()
            this.port = undefined
            break
          case 'error':
            this.emit('error', new Event('error'))
            this.readyState = DESKTOP_WS_CLOSED
            this.emit('close', new CloseEvent('close'))
            port.close()
            this.port = undefined
            break
          case 'abort':
            break
          default: {
            const _exhaustive: never = message
            void _exhaustive
          }
        }
      })
      port.start()
    } catch {
      this.readyState = DESKTOP_WS_CLOSED
      this.emit('error', new Event('error'))
      this.emit('close', new CloseEvent('close'))
    }
  }
}
