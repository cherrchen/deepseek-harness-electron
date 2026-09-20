import { describe, expect, it } from 'vitest'
import {
  environmentForAgent,
  environmentForHarness,
  environmentForOwnedChild,
  PROXY_ENV_KEYS,
} from '../src/network/environment.ts'

const ambient = {
  KEEP: 'yes',
  HTTP_PROXY: 'A',
  http_proxy: 'B',
  HTTPS_PROXY: 'C',
  https_proxy: 'D',
  ALL_PROXY: 'E',
  all_proxy: 'F',
  NO_PROXY: 'foo',
  no_proxy: 'bar',
  NODE_USE_ENV_PROXY: '1',
}
const gateway = { host: '127.0.0.1' as const, port: 4123 }

describe('Desktop Network child environment policy', () => {
  it('leaves every ambient value untouched in Default', () => {
    expect(environmentForHarness(ambient, { mode: 'default', proxyAgentTraffic: false })).toEqual(ambient)
  })

  it('clears every proxy spelling in Direct for all child classes', () => {
    for (const derive of [environmentForHarness, environmentForOwnedChild, environmentForAgent]) {
      const result = derive(ambient, { mode: 'direct', proxyAgentTraffic: false })
      expect(result.KEEP).toBe('yes')
      for (const key of PROXY_ENV_KEYS) expect(result[key]).toBeUndefined()
    }
  })

  it('routes Managed owned children through only the loopback Gateway', () => {
    const result = environmentForOwnedChild(ambient, { mode: 'manual', proxyAgentTraffic: false, gateway })
    expect(result).toMatchObject({
      HTTP_PROXY: 'http://127.0.0.1:4123',
      http_proxy: 'http://127.0.0.1:4123',
      HTTPS_PROXY: 'http://127.0.0.1:4123',
      ALL_PROXY: 'http://127.0.0.1:4123',
      NO_PROXY: 'localhost,127.0.0.1,::1',
      no_proxy: 'localhost,127.0.0.1,::1',
    })
  })

  it('changes Managed Agent environments only when opted in', () => {
    expect(environmentForAgent(ambient, { mode: 'system', proxyAgentTraffic: false, gateway })).toEqual(ambient)
    expect(environmentForAgent(ambient, { mode: 'system', proxyAgentTraffic: true, gateway }).HTTP_PROXY)
      .toBe('http://127.0.0.1:4123')
  })

  it('fails closed when Managed policy has no ready Gateway', () => {
    expect(() => environmentForHarness(ambient, { mode: 'system', proxyAgentTraffic: false }))
      .toThrow(/requires a ready Gateway/)
  })
})
