import { EventEmitter } from 'node:events'
import type { MessagePortMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { HarnessProxy } from '../src/harness-proxy.ts'
import { HttpHarnessTransport } from '../src/harness/transport.ts'

class FakeWebSocket extends EventTarget {
  readyState = WebSocket.CONNECTING
  readonly close = vi.fn(() => {
    this.readyState = WebSocket.CLOSING
  })

  finishClose(): void {
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

function createPort(): { port: MessagePortMain; emitClose: () => void } {
  const emitter = new EventEmitter()
  const port = Object.assign(emitter, {
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(() => { emitter.emit('close') }),
  }) as unknown as MessagePortMain
  return {
    port,
    emitClose: () => { emitter.emit('close') },
  }
}

describe('HarnessProxy', () => {
  it('accepts only loopback origins', () => {
    const proxy = new HarnessProxy()
    proxy.setOrigin('http://127.0.0.1:43127')
    expect(proxy.requireOrigin()).toBe('http://127.0.0.1:43127')
    expect(() => { proxy.setOrigin('http://example.com:80') }).toThrow(/non-loopback/)
  })

  it('maps renderer URLs onto the Harness origin', () => {
    const proxy = new HarnessProxy()
    proxy.setOrigin('http://127.0.0.1:43127/')
    expect(proxy.resolveHarnessUrl('dsh-electron://localhost/api/session.list')).toBe(
      'http://127.0.0.1:43127/api/session.list',
    )
    expect(proxy.resolveHarnessUrl('/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=1')).toBe(
      'http://127.0.0.1:43127/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=1',
    )
  })

  it('refuses stream open before the origin is ready', () => {
    const proxy = new HarnessProxy()
    expect(() => proxy.requireOrigin()).toThrow(/not ready/)
  })

  it('closes the Host WebSocket when the renderer port closes', async () => {
    const socket = new FakeWebSocket()
    const proxy = new HarnessProxy(() => socket as unknown as WebSocket)
    const { port, emitClose } = createPort()
    proxy.setOrigin('http://127.0.0.1:43127')
    proxy.openStream('/api/events.host', port)

    emitClose()
    expect(socket.close.mock.calls).toHaveLength(1)
    socket.finishClose()
    await proxy.stop()
  })

  it('waits for active WebSockets to close when the transport stops', async () => {
    const socket = new FakeWebSocket()
    const proxy = new HarnessProxy(() => socket as unknown as WebSocket)
    const transport = new HttpHarnessTransport(proxy)
    const { port } = createPort()
    await transport.start('http://127.0.0.1:43127')
    transport.openStream('/api/events.mux', port)

    let stopped = false
    const stopping = transport.stop().then(() => { stopped = true })
    await Promise.resolve()
    expect(socket.close.mock.calls).toHaveLength(1)
    expect(stopped).toBe(false)

    socket.finishClose()
    await stopping
    expect(stopped).toBe(true)
  })
})
