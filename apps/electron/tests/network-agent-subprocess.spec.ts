import { Context } from '@deepseek-ai/cordis'
import { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { describe, expect, it } from 'vitest'
import { DesktopNetworkSubprocessRuntime, fillAgentProxyValues } from '../runtime/plugins/desktop-network-subprocess/src/index.ts'
import { agentProxyPolicyForHost, PROXY_ENV_KEYS } from '../src/network/environment.ts'

const gateway = { host: '127.0.0.1' as const, port: 4123 }

describe('Desktop Agent subprocess integration', () => {
  it('applies Default, Direct, Agent OFF, and Agent ON at the actual subprocess provider', async () => {
    const ambient = { HTTP_PROXY: 'http://original.example:8080', HTTPS_PROXY: 'http://original.example:8080' }
    const cases = [
      { mode: 'default' as const, proxyAgentTraffic: false, expected: 'http://explicit.example:8080', explicit: true },
      { mode: 'direct' as const, proxyAgentTraffic: false, expected: undefined, explicit: true },
      { mode: 'manual' as const, proxyAgentTraffic: false, expected: ambient.HTTP_PROXY },
      { mode: 'manual' as const, proxyAgentTraffic: false, expected: 'http://home.example:8080', homeOnly: true },
      { mode: 'manual' as const, proxyAgentTraffic: true, expected: 'http://127.0.0.1:4123', explicit: true },
    ]
    const previous = process.env.DSH_ELECTRON_AGENT_PROXY_POLICY
    try {
      for (const policy of cases) {
        const serialized = agentProxyPolicyForHost(policy.homeOnly ? {} : ambient, { ...policy, gateway })
        if (serialized === undefined) delete process.env.DSH_ELECTRON_AGENT_PROXY_POLICY
        else process.env.DSH_ELECTRON_AGENT_PROXY_POLICY = serialized
        const ctx = new Context()
        ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([
          { source: 'process', values: { HTTP_PROXY: 'http://127.0.0.1:4123' } },
          { source: 'user-env', values: { HTTP_PROXY: 'http://home.example:8080' } },
        ]))
        const fiber = await ctx.plugin(DesktopNetworkSubprocessRuntime)
        try {
          const handle = ctx.subprocess.spawn({
            argv: [process.execPath, '-e', `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(PROXY_ENV_KEYS)}.map(key => [key, process.env[key] ?? null]))))`],
            cwd: process.cwd(),
            env: policy.explicit ? { HTTP_PROXY: 'http://explicit.example:8080' } : undefined,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 4096, spill: { maxBytes: 4096 } }, stderr: { maxBytes: 4096, spill: { maxBytes: 4096 } } },
            graceMs: 1000,
          })
          expect((await handle.done).exitCode).toBe(0)
          const output = handle.collected.stdout?.readFrom(0).text.trim()
          const observed = JSON.parse(output ?? '{}') as Record<string, string | null>
          expect(observed.HTTP_PROXY ?? undefined).toBe(policy.expected)
          if (policy.mode === 'direct') {
            for (const key of PROXY_ENV_KEYS) expect(observed[key]).toBeNull()
          }
        } finally {
          await fiber.dispose()
        }
      }
    } finally {
      if (previous === undefined) delete process.env.DSH_ELECTRON_AGENT_PROXY_POLICY
      else process.env.DSH_ELECTRON_AGENT_PROXY_POLICY = previous
    }
  })
})

describe('Desktop Agent proxy policy fill', () => {
  /** The policy's per-name overrides, as the Host provider reads them off the serialized policy. */
  const policyValues = (ambient: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
    const serialized = agentProxyPolicyForHost(ambient, { mode: 'manual', proxyAgentTraffic: false, gateway })
    const parsed: unknown = JSON.parse(serialized ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || !('values' in parsed)
      || typeof parsed.values !== 'object' || parsed.values === null) {
      throw new Error('manual mode must serialize an Agent proxy policy carrying values')
    }
    return Object.fromEntries(Object.entries(parsed.values))
  }

  it('gives both Windows spellings of one variable the value the policy set', () => {
    const values = policyValues({ HTTP_PROXY: 'http://original.example:8080' })
    fillAgentProxyValues(values, createLaunchEnvironmentSnapshot([
      { source: 'user-env', values: { HTTP_PROXY: 'http://home.example:8080' } },
    ]), 'win32')
    expect(values.HTTP_PROXY).toBe('http://original.example:8080')
    expect(values.http_proxy).toBe('http://original.example:8080')
  })

  it('resolves the two spellings separately elsewhere', () => {
    const values = policyValues({ HTTP_PROXY: 'http://original.example:8080' })
    fillAgentProxyValues(values, createLaunchEnvironmentSnapshot([
      { source: 'user-env', values: { HTTP_PROXY: 'http://home.example:8080', http_proxy: 'http://lower.example:8080' } },
    ]), 'darwin')
    expect(values.HTTP_PROXY).toBe('http://original.example:8080')
    expect(values.http_proxy).toBe('http://lower.example:8080')
  })
})
