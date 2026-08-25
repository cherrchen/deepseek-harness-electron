import type { PluginInstallSource, PluginPackageKind } from './plugin-lifecycle-contract.ts'

/** Registry package installation request. */
export interface RegistryPluginInstallRequest {
  source: 'registry'
  packageName: string
  version?: string
}

/** GitHub or Git repository installation request. */
export interface GitPluginInstallRequest {
  source: 'git'
  repository: string
  ref?: string
}

/** Local package installation request. */
export interface LocalPluginInstallRequest {
  source: 'local'
  path: string
  mode: 'file' | 'link'
}

/** Closed Renderer-facing plugin installation request. */
export type PluginInstallRequest =
  | RegistryPluginInstallRequest
  | GitPluginInstallRequest
  | LocalPluginInstallRequest

/** Validated pnpm-compatible package spec owned by Electron Main. */
export interface NormalizedPluginInstallRequest {
  source: Exclude<PluginInstallSource, 'bundled' | 'unknown'>
  spec: string
}

/** Successful profile package installation. */
export interface PluginInstallResult {
  name: string
  version: string
  kind: PluginPackageKind
  activation: 'activated' | 'restart-required' | 'not-applicable'
  source: Exclude<PluginInstallSource, 'bundled' | 'unknown'>
}

/** Stable failure categories rendered by the Plugin Manager. */
export type PluginInstallErrorCode =
  | 'invalid-request'
  | 'package-not-found'
  | 'git-unavailable'
  | 'git-auth-failed'
  | 'local-path-missing'
  | 'invalid-package'
  | 'package-manager-failed'
  | 'build-script-blocked'
  | 'profile-reconcile-failed'
  | 'activation-failed'

/** Install failure with stable UI classification and diagnostic details. */
export class PluginInstallError extends Error {
  constructor(
    readonly code: PluginInstallErrorCode,
    message: string,
    readonly details?: string,
    readonly profileChanged = false,
  ) {
    super(message)
    this.name = 'PluginInstallError'
  }
}

/**
 * Validate a Renderer request and convert it to one pnpm package spec.
 * @param request - Untrusted structured-clone value from the preload bridge.
 * @returns canonical package source and spec.
 */
export function normalizePluginInstallRequest(request: unknown): NormalizedPluginInstallRequest {
  if (typeof request !== 'object' || request === null || Array.isArray(request) || !('source' in request)) {
    throw invalid('Plugin installation requires a source.')
  }
  const value = request as Record<string, unknown>
  if (value.source === 'registry') return normalizeRegistry(value)
  if (value.source === 'git') return normalizeGit(value)
  if (value.source === 'local') return normalizeLocal(value)
  throw invalid('Plugin installation source is unsupported.')
}

function normalizeRegistry(value: Record<string, unknown>): NormalizedPluginInstallRequest {
  const name = requiredTrimmed(value.packageName, 'Registry package name is required.')
  if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i.test(name)) {
    throw invalid('Registry package name is invalid.')
  }
  if (value.version !== undefined && typeof value.version !== 'string') {
    throw invalid('Registry version or tag must be text.')
  }
  const version = typeof value.version === 'string' ? value.version.trim() : ''
  if (/\s|[/\\#]/.test(version)) throw invalid('Registry version or tag is invalid.')
  return { source: 'registry', spec: `${name}@${version.length === 0 ? 'latest' : version}` }
}

function normalizeGit(value: Record<string, unknown>): NormalizedPluginInstallRequest {
  let repository = requiredTrimmed(value.repository, 'Git repository is required.')
  if (value.ref !== undefined && typeof value.ref !== 'string') throw invalid('Git reference must be text.')
  const ref = typeof value.ref === 'string' ? value.ref.trim() : ''
  if (/\s|[#]/.test(ref)) throw invalid('Git reference is invalid.')
  if (repository.includes('#') && ref.length > 0) throw invalid('Specify the Git reference only once.')

  const shorthand = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.+))?$/.exec(repository)
  if (shorthand !== null) repository = `github:${shorthand[1]}/${shorthand[2]}${shorthand[3] === undefined ? '' : `#${shorthand[3]}`}`
  if (/^https:\/\/github\.com\//i.test(repository)) {
    const url = new URL(repository)
    const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
    if (parts.length !== 2 || parts.some(part => part.length === 0)) throw invalid('GitHub repository URL is invalid.')
    repository = `github:${parts[0]}/${parts[1]}${url.hash}`
  }
  if (!/^(?:github:[\w.-]+\/[\w.-]+(?:#[^\s#]+)?|git\+(?:https|ssh):\/\/[^\s]+)$/i.test(repository)) {
    throw invalid('Use a GitHub repository or a git+https/git+ssh URL.')
  }
  return { source: 'git', spec: `${repository}${ref.length === 0 ? '' : `#${ref}`}` }
}

function normalizeLocal(value: Record<string, unknown>): NormalizedPluginInstallRequest {
  const path = requiredTrimmed(value.path, 'Local repository path is required.')
  if (!/^(?:\/|[a-z]:[\\/])/i.test(path)) throw invalid('Local repository path must be absolute.')
  if (value.mode !== 'file' && value.mode !== 'link') throw invalid('Local installation mode is invalid.')
  return { source: 'local', spec: `${value.mode}:${path}` }
}

function requiredTrimmed(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalid(message)
  return value.trim()
}

function invalid(message: string): PluginInstallError {
  return new PluginInstallError('invalid-request', message)
}
