import type { SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkRuntimeClient } from '../src/network/runtime-client.ts'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../src/network/runtime-path.ts', () => ({ resolveNetworkRuntimePath: () => '/app/network-runtime' }))

const hello = {
  protocolVersion: 1,
  gateway: { host: '127.0.0.1', port: 12345 },
  systemBackend: 'unsupported',
  capabilities: {
    manual: { http: true, https: true, socks5: true, socks5Auth: false },
    system: { manual: false, pac: false, wpad: false, watchers: false },
    auth: { basic: true, digest: false, ntlm: false, negotiate: false },
  },
}

function fixture(respond?: (frame: Record<string, unknown>, output: PassThrough) => void) {
  const child = new EventEmitter()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const requests: Record<string, unknown>[] = []
  const stdin = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const frame = JSON.parse(chunk.toString()) as Record<string, unknown>
      requests.push(frame)
      queueMicrotask(() => {
        if (respond !== undefined) respond(frame, stdout)
        else stdout.write(`${JSON.stringify({ v: 1, id: frame.id, ok: true, result: frame.type === 'hello' ? hello : {} })}\n`)
        if (frame.type === 'shutdown') child.emit('close', 0, null)
      })
      callback()
    },
  })
  const kill = vi.fn(() => { queueMicrotask(() => child.emit('close', null, 'SIGKILL')); return true })
  mocks.spawn.mockReturnValue(Object.assign(child, { stdin, stdout, stderr, kill }))
  const client = new NetworkRuntimeClient({ appPath: '/app', resourcesPath: '/resources', packaged: true, requestTimeoutMs: 100, shutdownTimeoutMs: 100 })
  return { child, client, requests, kill, stdout, stderr }
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

describe('Network Runtime client', () => {
  it('negotiates, transfers credentials only through stdin, and awaits shutdown', async () => {
    const f = fixture()
    await expect(f.client.start()).resolves.toEqual(hello)
    await f.client.configure({ mode: 'manual', strictFallback: true, proxy: { protocol: 'http', host: 'localhost', port: 8080, username: 'alice', password: 'TOP_SECRET' } })
    expect(f.requests[1]).toMatchObject({ type: 'configure', payload: { config: { proxy: { password: 'TOP_SECRET' } } } })
    const [path, args, options] = mocks.spawn.mock.calls[0] as [string, string[], SpawnOptions]
    expect(path).toBe('/app/network-runtime')
    expect(args).toEqual([])
    expect(JSON.stringify(options)).not.toContain('TOP_SECRET')
    expect(options.env?.HTTP_PROXY).toBeUndefined()
    expect(options.env?.NODE_OPTIONS).toBeUndefined()
    await f.client.shutdown()
    expect(f.kill).not.toHaveBeenCalled()
    await expect(f.client.configure({ mode: 'direct', strictFallback: true })).rejects.toThrow('not active')
  })

  it('terminates incompatible hello, malformed frames, and oversized stdout', async () => {
    for (const output of [JSON.stringify({ v: 1, id: '1', ok: true, result: { ...hello, gateway: { host: '0.0.0.0', port: 1 } } }) + '\n', '{invalid}\n', 'x'.repeat(1024 * 1024 + 1)]) {
      const f = fixture((_frame, stdout) => { stdout.write(output) })
      await expect(f.client.start()).rejects.toMatchObject({ code: 'NETWORK_RUNTIME_PROTOCOL_MISMATCH' })
      expect(f.kill).toHaveBeenCalledOnce()
      await f.client.shutdown()
    }
  })

  it('rejects pending commands on crash without changing the selected route', async () => {
    const f = fixture((frame, stdout) => {
      if (frame.type === 'hello') stdout.write(`${JSON.stringify({ v: 1, id: frame.id, ok: true, result: hello })}\n`)
    })
    const events: unknown[] = []
    f.client.onEvent(event => events.push(event))
    await f.client.start()
    const configuring = f.client.configure({ mode: 'direct', strictFallback: true })
    const rejected = expect(configuring).rejects.toMatchObject({ code: 'NETWORK_RUNTIME_EXITED' })
    f.child.emit('close', 1, null)
    await rejected
    expect(events).toEqual([{ event: 'runtime-exited', payload: { code: 'NETWORK_RUNTIME_EXITED' } }])
    expect(f.requests.map(frame => frame.type)).toEqual(['hello', 'configure'])
    await f.client.shutdown()
  })

  it('kills a helper that does not answer within the request deadline', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture(() => {})
      const failed = expect(f.client.start()).rejects.toMatchObject({ code: 'NETWORK_RUNTIME_EXITED' })
      await vi.advanceTimersByTimeAsync(100)
      await failed
      expect(f.kill).toHaveBeenCalledOnce()
      await f.client.shutdown()
    } finally { vi.useRealTimers() }
  })

  it('contains observer failures and preserves protocol response processing', async () => {
    const f = fixture()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await f.client.start()
    f.client.onEvent(() => { throw new Error('TOP_SECRET') })
    const observed = vi.fn()
    const dispose = f.client.onEvent(observed)
    f.stdout.write('{"v":1,"event":"runtime_warning","payload":{"code":"MALFORMED_FRAME"}}\n')
    expect(observed).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('desktop network: runtime event listener failed')
    dispose()
    await f.client.shutdown()
  })
})
