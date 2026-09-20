import { describe, expect, it } from 'vitest'
import { DEFAULT_NETWORK_TEST_SETTINGS, normalizeNetworkConfigInput, parsePersistedManualProxy } from '../src/network/validation.ts'

describe('Desktop Network validation', () => {
  it('requires one valid endpoint in Manual mode', () => {
    expect(() => normalizeNetworkConfigInput({ mode: 'manual' }, undefined, DEFAULT_NETWORK_TEST_SETTINGS))
      .toThrow(/requires one proxy endpoint/)
    expect(() => normalizeNetworkConfigInput({
      mode: 'manual',
      manual: { protocol: 'http', host: 'https://proxy.example', port: 8080 },
    }, undefined, DEFAULT_NETWORK_TEST_SETTINGS)).toThrow(/only the proxy host/)
  })

  it.each([0, 65_536, 1.5, Number.NaN])('rejects invalid port %s', (port) => {
    expect(() => normalizeNetworkConfigInput({
      mode: 'manual',
      manual: { protocol: 'http', host: 'proxy.example', port },
    }, undefined, DEFAULT_NETWORK_TEST_SETTINGS)).toThrow(/port from 1 through 65535/)
  })

  it('accepts boundary ports and normalizes host names', () => {
    expect(normalizeNetworkConfigInput({
      mode: 'manual',
      manual: { protocol: 'https', host: ' Proxy.EXAMPLE ', port: 65_535 },
    }, undefined, DEFAULT_NETWORK_TEST_SETTINGS).manual).toEqual({
      protocol: 'https', host: 'proxy.example', port: 65_535,
    })
  })

  it('rejects credential fields in persisted SOCKS5 data', () => {
    expect(parsePersistedManualProxy({ protocol: 'socks5', host: 'localhost', port: 1080, password: 'secret' }))
      .toBeUndefined()
  })

  it('revalidates structured-clone input instead of trusting TypeScript types', () => {
    expect(() => normalizeNetworkConfigInput(null as never, undefined, DEFAULT_NETWORK_TEST_SETTINGS))
      .toThrow(/supported network mode/)
    expect(() => normalizeNetworkConfigInput({
      mode: 'manual',
      manual: {
        protocol: 'http', host: 'proxy.example', port: 8080, passwordChange: { action: 'replace' },
      },
    } as never, undefined, DEFAULT_NETWORK_TEST_SETTINGS)).toThrow(/supported password change/)
    expect(() => normalizeNetworkConfigInput({
      mode: 'manual',
      manual: { protocol: 'socks5', host: 'proxy.example', port: 1080, username: 'not-supported' },
    } as never, undefined, DEFAULT_NETWORK_TEST_SETTINGS)).toThrow(/SOCKS5 credentials/)
  })
})
