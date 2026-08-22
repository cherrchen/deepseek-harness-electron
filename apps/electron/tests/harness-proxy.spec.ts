import { describe, expect, it } from 'vitest'
import { HarnessProxy } from '../src/harness-proxy.ts'

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
})
