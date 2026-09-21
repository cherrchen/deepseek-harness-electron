import type {
  DesktopNetworkErrorSummary,
} from './errors.ts'
import type {
  DesktopNetworkRuntimeCapabilities,
  RuntimeNetworkConfig,
  SanitizedResolvedRoute,
  SystemProxyBackend,
  SystemProxyPolicySource,
} from './domain.ts'

/** Current JSON Lines protocol spoken by the Desktop Network Runtime. */
export const NETWORK_RUNTIME_PROTOCOL_VERSION = 1 as const

/** Request frame sent over the runtime's stdin. */
export interface RuntimeRequestEnvelope<T = unknown> {
  v: typeof NETWORK_RUNTIME_PROTOCOL_VERSION
  id: string
  type: RuntimeCommand
  payload: T
}

/** Response frame returned over the runtime's stdout. */
export type RuntimeResponseEnvelope<T = unknown> =
  | {
    v: typeof NETWORK_RUNTIME_PROTOCOL_VERSION
    id: string
    ok: true
    result: T
  }
  | {
    v: typeof NETWORK_RUNTIME_PROTOCOL_VERSION
    id: string
    ok: false
    error: RuntimeProtocolError
  }

/** Unsolicited runtime event frame. */
export interface RuntimeEventEnvelope<T = unknown> {
  v: typeof NETWORK_RUNTIME_PROTOCOL_VERSION
  event: RuntimeEventName
  payload: T
}

/** Stable protocol error independent of platform errno text. */
export interface RuntimeProtocolError {
  code: string
  message: string
}

/** Closed command set accepted by protocol version 1. */
export type RuntimeCommand =
  | 'hello'
  | 'configure'
  | 'get_system_snapshot'
  | 'reload_system'
  | 'get_diagnostics'
  | 'test_proxy'
  | 'test_url'
  | 'submit_credential'
  | 'clear_credential'
  | 'shutdown'

/** Closed event set emitted by protocol version 1. */
export type RuntimeEventName =
  | 'ready'
  | 'system_policy_changed'
  | 'network_changed'
  | 'route_selected'
  | 'proxy_failure'
  | 'credential_required'
  | 'credential_rejected'
  | 'runtime_warning'

/** Runtime hello result used to reject incompatible packaged helpers. */
export interface RuntimeHelloResult {
  protocolVersion: typeof NETWORK_RUNTIME_PROTOCOL_VERSION
  gateway: { host: '127.0.0.1'; port: number }
  systemBackend: SystemProxyBackend
  capabilities: DesktopNetworkRuntimeCapabilities
}

/** Configure request payload. */
export interface RuntimeConfigureRequest {
  config: RuntimeNetworkConfig
  limits?: RuntimeLimits
}

/** Sanitized platform policy snapshot. */
export interface RuntimeSystemSnapshot {
  backend: SystemProxyBackend
  policySource: SystemProxyPolicySource
  policyFingerprint: string
  selectedRoute?: SanitizedResolvedRoute
  alternativeRoutes: SanitizedResolvedRoute[]
  error?: DesktopNetworkErrorSummary
}

/** Runtime deadlines and admission limit, validated again in the native process. */
export interface RuntimeLimits {
  connectTimeoutMs: number
  headerTimeoutMs: number
  shutdownTimeoutMs: number
  maxConnections: number
}
