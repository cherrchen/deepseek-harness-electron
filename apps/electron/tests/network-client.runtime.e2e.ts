import { createServer, type Server } from 'node:net'
import { once } from 'node:events'
import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { NetworkRuntimeClient } from '../src/network/runtime-client.ts'
import { environmentForHarness } from '../src/network/environment.ts'

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture port')
  return address.port
}

function getThroughGateway(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: 'http://remote-only.invalid/health', headers: { Connection: 'close' } }, (response) => {
      let body = ''
      response.setEncoding('utf8').on('data', (chunk: string) => { body += chunk })
      response.once('end', () => { resolve(`${String(response.statusCode)} ${body}`) })
      response.once('error', reject)
    })
    req.once('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('Gateway request deadline')))
    req.end()
  })
}

describe('Main client with built Network Runtime', () => {
  it('negotiates and forwards through the sole authenticated Manual endpoint', async () => {
    const requests: string[] = []
    const sockets = new Set<import('node:net').Socket>()
    const proxy = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let received = ''
      socket.setEncoding('utf8').on('data', (chunk: string) => {
        received += chunk
        if (!received.endsWith('\r\n\r\n')) return
        requests.push(received)
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
      })
    })
    const runtime = new NetworkRuntimeClient({ appPath: process.cwd(), resourcesPath: '', packaged: false })
    const events: unknown[] = []
    runtime.onEvent(event => events.push(event))
    try {
      const port = await listen(proxy)
      const hello = await runtime.start()
      expect(hello.capabilities.manual).toEqual({ http: true, https: true, socks5: true, socks5Auth: false })
      expect(await runtime.diagnostics()).toEqual({ configured: false })
      await runtime.configure({ mode: 'manual', strictFallback: true, proxy: { protocol: 'http', host: '127.0.0.1', port, username: 'user', password: 'secret' } })
      const env = environmentForHarness({ HTTP_PROXY: 'ambient' }, { mode: 'manual', proxyAgentTraffic: false, gateway: hello.gateway })
      expect(JSON.stringify(env)).not.toMatch(/user|secret|ambient/)
      expect(await getThroughGateway(hello.gateway.port)).toBe('200 ok')
      expect(requests).toHaveLength(1)
      expect(requests[0]).toContain('GET http://remote-only.invalid/health HTTP/1.1')
      expect(requests[0]).toContain('proxy-authorization: Basic dXNlcjpzZWNyZXQ=')
      expect(JSON.stringify(events)).not.toMatch(/secret|dXNlcjpzZWNyZXQ=/)
      await expect(runtime.reloadSystem()).rejects.toMatchObject({ code: 'NOT_IN_SYSTEM_MODE' })
      expect(await runtime.diagnostics()).toEqual({ configured: true })
      await runtime.configure({ mode: 'manual', strictFallback: true, proxy: { protocol: 'http', host: '127.0.0.1', port } })
      expect(await getThroughGateway(hello.gateway.port)).toBe('200 ok')
      expect(requests).toHaveLength(2)
      expect(requests[1]?.toLowerCase()).not.toContain('proxy-authorization')
      await runtime.shutdown()
      await expect(getThroughGateway(hello.gateway.port)).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    } finally {
      await runtime.shutdown()
      for (const socket of sockets) socket.destroy()
      if (proxy.listening) {
        await new Promise<void>((resolve, reject) => proxy.close((error) => { if (error) reject(error); else resolve() }))
      }
    }
  })
})
