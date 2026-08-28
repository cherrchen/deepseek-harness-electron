// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeepseekDesktopBridge, HostStreamHandlers } from '../src/bridge-types.ts'
import {
  DESKTOP_WS_CLOSED,
  DESKTOP_WS_CONNECTING,
  DESKTOP_WS_OPEN,
  installDesktopWebSocket,
} from '../src/renderer/transport/websocket-shim.ts'

describe('desktop WebSocket stand-in', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    delete globalThis.window.deepseekDesktop
  })

  it('bridges Host event paths through openStream callbacks (not a returned MessagePort)', () => {
    let captured: HostStreamHandlers | undefined
    const stop = vi.fn()
    const bridge = {
      host: {
        openStream: (_path: '/api/events.host', handlers: HostStreamHandlers) => {
          captured = handlers
          return stop
        },
      },
    } as unknown as DeepseekDesktopBridge
    globalThis.window.deepseekDesktop = bridge
    installDesktopWebSocket()

    const socket = new WebSocket('dsh-electron://localhost/api/events.host')
    expect(socket.readyState).toBe(DESKTOP_WS_CONNECTING)
    expect(captured).toBeDefined()

    const opens: Event[] = []
    const messages: MessageEvent[] = []
    socket.addEventListener('open', (event) => { opens.push(event) })
    socket.addEventListener('message', (event) => { messages.push(event) })

    captured!.onOpen()
    expect(socket.readyState).toBe(DESKTOP_WS_OPEN)
    expect(opens).toHaveLength(1)

    captured!.onMessage('{"type":"ping"}')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.data).toBe('{"type":"ping"}')

    socket.close()
    expect(stop).toHaveBeenCalledOnce()
    expect(socket.readyState).toBe(DESKTOP_WS_CLOSED)
  })

  it('emits error and close when openStream throws', async () => {
    globalThis.window.deepseekDesktop = {
      host: {
        openStream: () => {
          throw new Error('bridge unavailable')
        },
      },
    } as unknown as DeepseekDesktopBridge
    installDesktopWebSocket()

    const socket = new WebSocket('dsh-electron://localhost/api/events.mux')
    const events: string[] = []
    socket.addEventListener('error', () => { events.push('error') })
    socket.addEventListener('close', () => { events.push('close') })
    await vi.waitFor(() => {
      expect(events).toEqual(['error', 'close'])
    })
    expect(socket.readyState).toBe(DESKTOP_WS_CLOSED)
  })
})
