import type { DesktopNetworkMode } from './domain.ts'

/** Loopback Gateway exposed by the native network runtime. */
export interface DesktopGatewayEndpoint {
  host: '127.0.0.1' | '::1'
  port: number
}

/** Inputs that decide one child process environment. */
export interface NetworkEnvironmentPolicy {
  mode: DesktopNetworkMode
  proxyAgentTraffic: boolean
  gateway?: DesktopGatewayEndpoint
}

/** Every ambient variable controlled by Desktop proxy policy. */
export const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
] as const

/** Pass the Agent-only proxy view to the Desktop subprocess provider in the Host. */
export function agentProxyPolicyForHost(
  ambient: NodeJS.ProcessEnv,
  policy: NetworkEnvironmentPolicy,
): string | undefined {
  if (policy.mode === 'default') return undefined
  const selected = environmentForAgent(ambient, policy)
  const values = Object.fromEntries(PROXY_ENV_KEYS.map(key => [key, selected[key] ?? null]))
  return JSON.stringify({ force: policy.mode === 'direct' || policy.proxyAgentTraffic, values })
}

/**
 * Remove standard proxy routing variables without mutating the caller's object.
 * @param base - Source environment.
 * @returns a fresh environment without Desktop-controlled proxy variables.
 */
export function clearProxyEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const proxyKeys: ReadonlySet<string> = new Set(PROXY_ENV_KEYS.map(key => key.toUpperCase()))
  return Object.fromEntries(Object.entries(base).filter(([key]) => !proxyKeys.has(key.toUpperCase())))
}

/**
 * Derive the supervised Harness environment.
 * @param base - Ambient launch environment.
 * @param policy - Effective Desktop network policy.
 * @returns untouched Default, scrubbed Direct, or Gateway-routed Managed environment.
 */
export function environmentForHarness(
  base: NodeJS.ProcessEnv,
  policy: NetworkEnvironmentPolicy,
): NodeJS.ProcessEnv {
  return environmentForOwnedChild(base, policy)
}

/**
 * Keep Direct authoritative when the Harness launcher reads `$DSH_HOME/.env` below process env.
 * Blank process-layer proxy names mask that lower-priority file; the Desktop Agent provider removes
 * these empty names from child processes before spawn.
 */
export function environmentForHarnessLaunch(base: NodeJS.ProcessEnv, policy: NetworkEnvironmentPolicy): NodeJS.ProcessEnv {
  const routed = environmentForHarness(base, policy)
  if (policy.mode !== 'direct') return routed
  for (const key of PROXY_ENV_KEYS) {
    if (key !== 'NODE_USE_ENV_PROXY') routed[key] = ''
  }
  return routed
}

/**
 * Derive a Desktop-owned child environment, including package-manager processes.
 * @param base - Ambient launch environment.
 * @param policy - Effective Desktop network policy.
 * @returns untouched Default, scrubbed Direct, or Gateway-routed Managed environment.
 */
export function environmentForOwnedChild(
  base: NodeJS.ProcessEnv,
  policy: NetworkEnvironmentPolicy,
): NodeJS.ProcessEnv {
  switch (policy.mode) {
    case 'default': return { ...base }
    case 'direct': return clearProxyEnvironment(base)
    case 'system':
    case 'manual': return gatewayEnvironment(base, requireGateway(policy))
    default: return assertNever(policy.mode)
  }
}

/**
 * Derive an Agent child environment without claiming transparent enforcement.
 * @param base - Agent environment that existing DSH policy produced.
 * @param policy - Effective Desktop network policy.
 * @returns Direct always scrubs proxy variables; Managed modes change them only when the user opted in.
 */
export function environmentForAgent(
  base: NodeJS.ProcessEnv,
  policy: NetworkEnvironmentPolicy,
): NodeJS.ProcessEnv {
  switch (policy.mode) {
    case 'default': return { ...base }
    case 'direct': return clearProxyEnvironment(base)
    case 'system':
    case 'manual': return policy.proxyAgentTraffic
      ? gatewayEnvironment(base, requireGateway(policy))
      : { ...base }
    default: return assertNever(policy.mode)
  }
}

function gatewayEnvironment(base: NodeJS.ProcessEnv, gateway: DesktopGatewayEndpoint): NodeJS.ProcessEnv {
  const host = gateway.host === '::1' ? '[::1]' : gateway.host
  const url = `http://${host}:${String(gateway.port)}`
  return {
    ...clearProxyEnvironment(base),
    HTTP_PROXY: url,
    http_proxy: url,
    HTTPS_PROXY: url,
    https_proxy: url,
    ALL_PROXY: url,
    all_proxy: url,
    NO_PROXY: 'localhost,127.0.0.1,::1',
    no_proxy: 'localhost,127.0.0.1,::1',
    NODE_USE_ENV_PROXY: '1',
  }
}

function requireGateway(policy: NetworkEnvironmentPolicy): DesktopGatewayEndpoint {
  if (policy.gateway === undefined) {
    throw new Error(`desktop network: ${policy.mode} mode requires a ready Gateway endpoint`)
  }
  if (!Number.isInteger(policy.gateway.port) || policy.gateway.port < 1 || policy.gateway.port > 65_535) {
    throw new Error('desktop network: Gateway port is invalid')
  }
  return policy.gateway
}

function assertNever(value: never): never {
  throw new Error(`desktop network: unsupported mode ${String(value)}`)
}
