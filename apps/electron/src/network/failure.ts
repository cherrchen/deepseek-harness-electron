import type { DesktopNetworkFailure, NetworkFailureStage } from './domain.ts'
import type { DesktopNetworkErrorCode } from './errors.ts'

const PROXY_FAILURE_STAGES = {
  SYSTEM_PROXY_BACKEND_UNAVAILABLE: 'system-resolution',
  SYSTEM_PROXY_RESOLUTION_FAILED: 'system-resolution',
  PAC_FETCH_FAILED: 'pac-fetch',
  PAC_EVALUATION_FAILED: 'pac-evaluation',
  PROXY_DNS_FAILED: 'proxy-dns',
  PROXY_CONNECT_REFUSED: 'proxy-connect',
  PROXY_CONNECT_TIMEOUT: 'proxy-connect',
  PROXY_NETWORK_UNREACHABLE: 'proxy-connect',
  PROXY_TLS_FAILED: 'proxy-tls',
  PROXY_CERT_INVALID: 'proxy-tls',
  PROXY_AUTH_REQUIRED: 'proxy-auth',
  PROXY_AUTH_REJECTED: 'proxy-auth',
  UNSUPPORTED_PROXY_AUTH_SCHEME: 'proxy-auth',
  SOCKS_HANDSHAKE_FAILED: 'socks-handshake',
  NETWORK_RUNTIME_EXITED: 'unknown',
} as const satisfies Partial<Record<DesktopNetworkErrorCode, NetworkFailureStage>>

const NON_PROXY_STAGES = {
  TARGET_CONNECT_FAILED: 'target-connect',
  TARGET_TLS_FAILED: 'target-tls',
  OFFLINE: 'offline',
} as const satisfies Partial<Record<DesktopNetworkErrorCode, NetworkFailureStage>>

const KNOWN_CODES = new Set<DesktopNetworkErrorCode>([
  'INVALID_CONFIG', 'INVALID_HOST', 'INVALID_PORT', 'SECURE_STORAGE_UNAVAILABLE',
  'SECURE_STORAGE_PLAINTEXT_BACKEND', 'NETWORK_RUNTIME_START_FAILED',
  'NETWORK_RUNTIME_EXITED', 'NETWORK_RUNTIME_PROTOCOL_MISMATCH',
  'SYSTEM_PROXY_BACKEND_UNAVAILABLE', 'SYSTEM_PROXY_RESOLUTION_FAILED',
  'PAC_FETCH_FAILED', 'PAC_EVALUATION_FAILED', 'PROXY_DNS_FAILED',
  'PROXY_CONNECT_REFUSED', 'PROXY_CONNECT_TIMEOUT', 'PROXY_NETWORK_UNREACHABLE',
  'PROXY_TLS_FAILED', 'PROXY_CERT_INVALID', 'PROXY_AUTH_REQUIRED',
  'PROXY_AUTH_REJECTED', 'UNSUPPORTED_PROXY_AUTH_SCHEME', 'SOCKS_HANDSHAKE_FAILED',
  'TARGET_CONNECT_FAILED', 'TARGET_TLS_FAILED', 'OFFLINE', 'TEST_TIMEOUT',
  'NOT_IN_SYSTEM_MODE', 'UNKNOWN',
])

/** Classify a native symbolic code without forwarding native error text or secrets. */
export function classifyNetworkFailure(input: unknown): DesktopNetworkFailure {
  const code = typeof input === 'object' && input !== null && 'code' in input
    && typeof input.code === 'string' && KNOWN_CODES.has(input.code as DesktopNetworkErrorCode)
    ? input.code as DesktopNetworkErrorCode : 'UNKNOWN'
  const proxyStage = (PROXY_FAILURE_STAGES as Partial<Record<DesktopNetworkErrorCode, NetworkFailureStage>>)[code]
  const stage = proxyStage ?? (NON_PROXY_STAGES as Partial<Record<DesktopNetworkErrorCode, NetworkFailureStage>>)[code] ?? 'unknown'
  return {
    code, stage, proxyFailure: proxyStage !== undefined,
    retryable: code !== 'UNSUPPORTED_PROXY_AUTH_SCHEME' && code !== 'PROXY_CERT_INVALID',
    message: code,
  }
}
