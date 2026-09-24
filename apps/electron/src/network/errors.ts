/** Stable failures exposed by the Desktop network domain. */
export type DesktopNetworkErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_HOST'
  | 'INVALID_PORT'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'SECURE_STORAGE_PLAINTEXT_BACKEND'
  | 'NETWORK_RUNTIME_START_FAILED'
  | 'NETWORK_RUNTIME_EXITED'
  | 'NETWORK_RUNTIME_PROTOCOL_MISMATCH'
  | 'SYSTEM_PROXY_BACKEND_UNAVAILABLE'
  | 'SYSTEM_PROXY_RESOLUTION_FAILED'
  | 'PAC_FETCH_FAILED'
  | 'PAC_EVALUATION_FAILED'
  | 'PROXY_DNS_FAILED'
  | 'PROXY_CONNECT_REFUSED'
  | 'PROXY_CONNECT_TIMEOUT'
  | 'PROXY_NETWORK_UNREACHABLE'
  | 'PROXY_TLS_FAILED'
  | 'PROXY_CERT_INVALID'
  | 'PROXY_AUTH_REQUIRED'
  | 'PROXY_AUTH_REJECTED'
  | 'UNSUPPORTED_PROXY_AUTH_SCHEME'
  | 'SOCKS_HANDSHAKE_FAILED'
  | 'TARGET_CONNECT_FAILED'
  | 'TARGET_TLS_FAILED'
  | 'OFFLINE'
  | 'TEST_TIMEOUT'
  | 'NOT_IN_SYSTEM_MODE'
  | 'UNKNOWN'

/** Sanitized failure safe to cross the preload bridge. */
export interface DesktopNetworkErrorSummary {
  code: DesktopNetworkErrorCode
  message: string
  retryable: boolean
  stage?: string
}

/** Typed validation failure raised before network state is persisted. */
export class DesktopNetworkConfigError extends Error {
  /** Stable code consumed by callers and tests. */
  readonly code: 'INVALID_CONFIG' | 'INVALID_HOST' | 'INVALID_PORT'

  /**
   * @param code - Stable validation failure.
   * @param message - Sanitized explanation suitable for a settings form.
   */
  constructor(code: DesktopNetworkConfigError['code'], message: string) {
    super(message)
    this.name = 'DesktopNetworkConfigError'
    this.code = code
  }
}

/** Stable operational failure raised by Main-owned Network services. */
export class DesktopNetworkOperationError extends Error {
  /**
   * @param code - Stable failure code.
   * @param message - Sanitized explanation suitable for presentation.
   */
  constructor(readonly code: DesktopNetworkErrorCode, message: string) {
    super(message)
    this.name = 'DesktopNetworkOperationError'
  }
}
