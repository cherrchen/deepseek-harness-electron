import { describe, expect, it } from 'vitest'
import {
  agentProxyPolicyForHost,
  environmentForAgent,
  environmentForHarness,
  environmentForHarnessLaunch,
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

  it('clears mixed-case proxy names supplied by a parent process', () => {
    const result = environmentForOwnedChild({ Http_Proxy: 'http://stale.example', no_PrOxY: 'other', KEEP: 'yes' }, {
      mode: 'direct', proxyAgentTraffic: false,
    })
    expect(result).toEqual({ KEEP: 'yes' })
  })

  it('masks Harness-home proxy entries in Direct without forwarding them to Agent children', async () => {
    const { createLaunchEnvironmentSnapshot } = await import('@deepseek-ai/dsh-launch-environment')
    const { resolveProxyPolicy } = await import('@deepseek-ai/dsh-http-proxy/src/policy.ts')
    const launch = environmentForHarnessLaunch(ambient, { mode: 'direct', proxyAgentTraffic: false })
    expect(launch.NODE_USE_ENV_PROXY).toBeUndefined()
    for (const key of PROXY_ENV_KEYS) {
      if (key !== 'NODE_USE_ENV_PROXY') expect(launch[key]).toBe('')
    }
    const snapshot = createLaunchEnvironmentSnapshot([
      { source: 'process', values: launch as Record<string, string> },
      { source: 'user-env', values: { HTTP_PROXY: 'http://home-proxy.example:8080' } },
    ])
    expect(resolveProxyPolicy(snapshot).policy.source).toBe('none')
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

  it('sends only the Agent proxy view to the Host subprocess provider', () => {
    expect(agentProxyPolicyForHost(ambient, { mode: 'default', proxyAgentTraffic: false })).toBeUndefined()
    const off: unknown = JSON.parse(agentProxyPolicyForHost(ambient, { mode: 'manual', proxyAgentTraffic: false, gateway }) ?? '')
    expect(off).toMatchObject({ force: false, values: { HTTP_PROXY: 'A' } })
    const on: unknown = JSON.parse(agentProxyPolicyForHost(ambient, { mode: 'manual', proxyAgentTraffic: true, gateway }) ?? '')
    expect(on).toMatchObject({ force: true, values: { HTTP_PROXY: 'http://127.0.0.1:4123' } })
    const direct: unknown = JSON.parse(agentProxyPolicyForHost(ambient, { mode: 'direct', proxyAgentTraffic: false }) ?? '')
    expect(direct).toEqual({ force: true, values: Object.fromEntries(PROXY_ENV_KEYS.map(key => [key, null])) })
  })
})
