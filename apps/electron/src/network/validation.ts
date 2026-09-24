import { DesktopNetworkConfigError } from './errors.ts'
import type {
  DesktopNetworkConfigInput,
  DesktopNetworkTestSettings,
  ManualProxyInput,
  PasswordChange,
  PersistedManualProxy,
  SecretRef,
} from './domain.ts'

/** Default endpoint used only when a user explicitly runs the Internet diagnostic. */
export const DEFAULT_INTERNET_204_URL = 'https://cp.cloudflare.com/generate_204'

/** Default endpoint used only when a user explicitly runs the GitHub diagnostic. */
export const DEFAULT_GITHUB_TEST_URL = 'https://github.com/'

/** Default diagnostic settings for a new Desktop profile. */
export const DEFAULT_NETWORK_TEST_SETTINGS: DesktopNetworkTestSettings = {
  internet204Url: DEFAULT_INTERNET_204_URL,
  githubUrl: DEFAULT_GITHUB_TEST_URL,
}

/**
 * Validate and normalize one settings submission without retaining its password.
 * @param input - Untrusted structured-clone value from the Renderer.
 * @param retainedManual - Existing Manual draft used when another mode is saved without a visible form.
 * @param retainedTests - Existing diagnostic settings filled where the submission omits fields.
 * @returns normalized non-secret fields plus the submitted password operation.
 */
export function normalizeNetworkConfigInput(
  input: DesktopNetworkConfigInput,
  retainedManual: PersistedManualProxy | undefined,
  retainedTests: DesktopNetworkTestSettings,
): {
  mode: DesktopNetworkConfigInput['mode']
  manual: PersistedManualProxy | undefined
  passwordChange: PasswordChange | undefined
  proxyAgentTraffic: boolean
  tests: DesktopNetworkTestSettings
} {
  if (!isRecord(input) || !isNetworkMode(input.mode)) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Select a supported network mode.')
  }
  const submittedManual = input.manual === undefined ? undefined : normalizeManualProxy(input.manual)
  const manual = submittedManual?.persisted ?? retainedManual
  if (input.mode === 'manual' && manual === undefined) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Manual mode requires one proxy endpoint.')
  }
  return {
    mode: input.mode,
    manual,
    passwordChange: submittedManual?.passwordChange,
    proxyAgentTraffic: input.mode === 'system' || input.mode === 'manual'
      ? input.proxyAgentTraffic === true
      : false,
    tests: normalizeTestSettings(input.tests, retainedTests),
  }
}

/**
 * Validate a password-free Manual proxy loaded from disk.
 * @param value - Parsed JSON value.
 * @returns normalized endpoint or undefined when invalid.
 */
export function parsePersistedManualProxy(value: unknown): PersistedManualProxy | undefined {
  if (!isRecord(value) || !isManualProtocol(value.protocol)) return undefined
  if (typeof value.host !== 'string' || typeof value.port !== 'number') return undefined
  try {
    const host = normalizeHost(value.host)
    const port = normalizePort(value.port)
    if (value.protocol === 'socks5') {
      if ('username' in value || 'credentialRef' in value || 'password' in value) return undefined
      return { protocol: 'socks5', host, port }
    }
    if ('password' in value) return undefined
    const username = optionalTrimmedString(value.username)
    const credentialRef = optionalTrimmedString(value.credentialRef)
    return {
      protocol: value.protocol,
      host,
      port,
      ...(username === undefined ? {} : { username }),
      ...(credentialRef === undefined ? {} : { credentialRef: credentialRef as SecretRef }),
    }
  } catch {
    return undefined
  }
}

/**
 * Validate an absolute HTTP(S) diagnostic URL.
 * @param value - Candidate URL.
 * @param field - Field label used in the validation error.
 * @returns normalized URL string.
 */
export function normalizeHttpUrl(value: string, field: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', `${field} must be an absolute HTTP or HTTPS URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', `${field} must use HTTP or HTTPS.`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', `${field} must not include credentials.`)
  }
  return url.toString()
}

function normalizeManualProxy(input: ManualProxyInput): {
  persisted: PersistedManualProxy
  passwordChange: PasswordChange | undefined
} {
  if (!isRecord(input) || !isManualProtocol(input.protocol)) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Select HTTP, HTTPS, or SOCKS5.')
  }
  if (typeof input.host !== 'string' || typeof input.port !== 'number') {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Enter a proxy host and numeric port.')
  }
  const host = normalizeHost(input.host)
  const port = normalizePort(input.port)
  if (input.protocol === 'socks5') {
    if ('username' in input || 'password' in input || 'passwordChange' in input || 'credentialRef' in input) {
      throw new DesktopNetworkConfigError('INVALID_CONFIG', 'SOCKS5 credentials are not supported.')
    }
    return { persisted: { protocol: 'socks5', host, port }, passwordChange: undefined }
  }
  if ('password' in input || 'credentialRef' in input) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Submit password changes through passwordChange.')
  }
  const username = optionalTrimmedString(input.username)
  return {
    persisted: {
      protocol: input.protocol,
      host,
      port,
      ...(username === undefined ? {} : { username }),
    },
    passwordChange: normalizePasswordChange(input.passwordChange),
  }
}

function normalizePasswordChange(value: unknown): PasswordChange | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Select a supported password change.')
  if (value.action === 'keep' || value.action === 'remove') return { action: value.action }
  if (value.action === 'replace' && typeof value.value === 'string') {
    return { action: 'replace', value: value.value }
  }
  throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Select a supported password change.')
}

function normalizeHost(value: string): string {
  const host = value.trim()
  if (host === '') throw new DesktopNetworkConfigError('INVALID_HOST', 'Enter a proxy host name or IP address.')
  if (host.includes('://') || /[/@?#]/u.test(host)) {
    throw new DesktopNetworkConfigError('INVALID_HOST', 'Enter only the proxy host name or IP address.')
  }
  if (/\s/u.test(host)) throw new DesktopNetworkConfigError('INVALID_HOST', 'The proxy host must not contain whitespace.')
  return host.toLowerCase()
}

function normalizePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new DesktopNetworkConfigError('INVALID_PORT', 'Enter a proxy port from 1 through 65535.')
  }
  return value
}

function normalizeTestSettings(
  value: Partial<DesktopNetworkTestSettings> | undefined,
  retained: DesktopNetworkTestSettings,
): DesktopNetworkTestSettings {
  if (value !== undefined && !isRecord(value)) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'Network test settings are invalid.')
  }
  const internet204Url = normalizeHttpUrl(value?.internet204Url ?? retained.internet204Url, 'Internet test URL')
  const githubUrl = normalizeHttpUrl(value?.githubUrl ?? retained.githubUrl, 'GitHub test URL')
  const llm = value?.llm ?? retained.llm
  if (llm !== undefined && !isRecord(llm)) {
    throw new DesktopNetworkConfigError('INVALID_CONFIG', 'LLM test settings are invalid.')
  }
  const providerId = optionalTrimmedString(llm?.providerId)
  const healthUrl = llm?.healthUrl === undefined || llm.healthUrl.trim() === ''
    ? undefined
    : normalizeHttpUrl(llm.healthUrl, 'LLM health URL')
  return {
    internet204Url,
    githubUrl,
    ...(llm === undefined
      ? {}
      : {
        llm: {
          ...(providerId === undefined ? {} : { providerId }),
          ...(healthUrl === undefined ? {} : { healthUrl }),
        },
      }),
  }
}

function isNetworkMode(value: unknown): value is DesktopNetworkConfigInput['mode'] {
  return value === 'default' || value === 'direct' || value === 'system' || value === 'manual'
}

function isManualProtocol(value: unknown): value is ManualProxyInput['protocol'] {
  return value === 'http' || value === 'https' || value === 'socks5'
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
