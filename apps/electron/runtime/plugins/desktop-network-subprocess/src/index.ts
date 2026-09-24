import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessSpawnSpec, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

const KEYS = [
  'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy',
  'NO_PROXY', 'no_proxy', 'NODE_USE_ENV_PROXY',
] as const

interface AgentProxyPolicy {
  force: boolean
  values: NodeJS.ProcessEnv
}

/** Desktop Host provider that applies Agent proxy policy at the shared subprocess seam. */
export class DesktopNetworkSubprocessRuntime extends LocalSubprocessRuntime {
  private readonly policy: AgentProxyPolicy | undefined

  constructor(ctx: Context) {
    super(ctx)
    const policy = parsePolicy(process.env.DSH_ELECTRON_AGENT_PROXY_POLICY)
    if (policy !== undefined && !policy.force) {
      // The Host's inherited proxy names point at the Gateway; only Main's original values
      // and the CLI's discovered file layers can supply the Agent's opt-out environment.
      const launch = launchEnvironmentOf(ctx)
      for (const key of KEYS) {
        policy.values[key] ??= launch.getFrom(key, ['project-env', 'user-env'])?.value
      }
    }
    this.policy = policy
  }

  override resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string> {
    // The local provider's childEnv accepts tombstones although these two public signatures omit them.
    return super.resolveExecutable(command, this.childOverrides(env) as Record<string, string>, signal)
  }

  override spawn(spec: SubprocessSpawnSpec) {
    return super.spawn({ ...spec, env: this.childOverrides(spec.env) })
  }

  override spawnTerminal(spec: SubprocessTerminalSpawnSpec) {
    return super.spawnTerminal({ ...spec, env: this.childOverrides(spec.env) as Record<string, string> })
  }

  private childOverrides(explicit?: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv | undefined {
    if (this.policy === undefined) return explicit === undefined ? undefined : { ...explicit }
    return this.policy.force
      ? { ...explicit, ...this.policy.values }
      : { ...this.policy.values, ...explicit }
  }
}

function parsePolicy(serialized: string | undefined): AgentProxyPolicy | undefined {
  if (serialized === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(serialized) } catch { throw new Error('desktop network: invalid Agent proxy policy') }
  if (typeof parsed !== 'object' || parsed === null || !('force' in parsed) || typeof parsed.force !== 'boolean'
    || !('values' in parsed) || typeof parsed.values !== 'object' || parsed.values === null) {
    throw new Error('desktop network: invalid Agent proxy policy')
  }
  const values = parsed.values as Record<string, unknown>
  if (Object.keys(values).length !== KEYS.length || KEYS.some(key => !(key in values) || (values[key] !== null && typeof values[key] !== 'string'))) {
    throw new Error('desktop network: invalid Agent proxy policy')
  }
  const proxyValues: NodeJS.ProcessEnv = {}
  for (const key of KEYS) proxyValues[key] = values[key] === null ? undefined : values[key] as string
  return { force: parsed.force, values: proxyValues }
}

export default DesktopNetworkSubprocessRuntime
