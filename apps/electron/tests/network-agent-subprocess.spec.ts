import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DesktopNetworkSubprocessRuntime } from '../runtime/plugins/desktop-network-subprocess/src/index.ts'
import { agentProxyPolicyForHost, PROXY_ENV_KEYS } from '../src/network/environment.ts'

const gateway = { host: '127.0.0.1' as const, port: 4123 }

describe('Desktop Agent subprocess integration', () => {
  it('applies Default, Direct, Agent OFF, and Agent ON at the actual subprocess provider', async () => {
    const ambient = { HTTP_PROXY: 'http://original.example:8080', HTTPS_PROXY: 'http://original.example:8080' }
    const cases = [
      { mode: 'default' as const, proxyAgentTraffic: false, expected: 'http://explicit.example:8080', explicit: true },
      { mode: 'direct' as const, proxyAgentTraffic: false, expected: undefined, explicit: true },
      { mode: 'manual' as const, proxyAgentTraffic: false, expected: ambient.HTTP_PROXY },
      { mode: 'manual' as const, proxyAgentTraffic: true, expected: 'http://127.0.0.1:4123', explicit: true },
    ]
    const previous = process.env.DSH_ELECTRON_AGENT_PROXY_POLICY
    try {
      for (const policy of cases) {
        const serialized = agentProxyPolicyForHost(ambient, { ...policy, gateway })
        if (serialized === undefined) delete process.env.DSH_ELECTRON_AGENT_PROXY_POLICY
        else process.env.DSH_ELECTRON_AGENT_PROXY_POLICY = serialized
        const ctx = new Context()
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
