import type { PluginPackageKind } from './plugin-lifecycle-contract.ts'

/** Package command accepted by Electron Main's fixed upstream CLI adapter. */
export type PluginPackageCommand =
  | { kind: 'add'; spec: string; force?: boolean }
  | { kind: 'remove'; name: string }
  | { kind: 'update'; name: string }
  | { kind: 'outdated' }

/** Registry update facts returned by the bundled pnpm version. */
export interface PluginUpdateInfo {
  name: string
  currentVersion?: string
  wantedVersion?: string
  latestVersion?: string
  updateAvailable: boolean
}

/** Successful profile package mutation result. */
export interface PluginPackageMutationResult {
  name: string
  operation: 'update' | 'reinstall' | 'remove'
  previousVersion?: string
  version?: string
  kind?: PluginPackageKind
  restartRequired: boolean
}

/** Recovery state after a package operation fails. */
export type PluginRecoveryState = 'unchanged' | 'restored' | 'profile-changed'

/** Stable failure categories shared by package update, repair, and removal. */
export type PluginPackageErrorCode =
  | 'package-not-manageable'
  | 'update-check-failed'
  | 'update-failed'
  | 'remove-failed'
  | 'reinstall-failed'
  | 'runtime-quiesce-failed'
  | 'runtime-activation-failed'
  | 'runtime-restore-failed'

/** Package failure with a stable Renderer category and explicit recovery outcome. */
export class PluginPackageError extends Error {
  constructor(
    readonly code: PluginPackageErrorCode,
    message: string,
    readonly recovery: PluginRecoveryState,
    readonly details?: string,
  ) {
    super(message)
    this.name = 'PluginPackageError'
  }
}

/** Parse the JSON emitted by pinned pnpm `outdated --format json`. */
export function parsePluginUpdates(output: string): PluginUpdateInfo[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output) as unknown
  } catch (error) {
    throw new PluginPackageError('update-check-failed', 'Plugin update results were invalid.', 'unchanged', String(error))
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PluginPackageError('update-check-failed', 'Plugin update results were invalid.', 'unchanged')
  }
  return Object.entries(parsed).map(([name, value]) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new PluginPackageError('update-check-failed', `Update information for ${name} was invalid.`, 'unchanged')
    }
    const record = value as Record<string, unknown>
    const currentVersion = optionalString(record.current)
    const wantedVersion = optionalString(record.wanted)
    const latestVersion = optionalString(record.latest)
    return {
      name,
      ...(currentVersion === undefined ? {} : { currentVersion }),
      ...(wantedVersion === undefined ? {} : { wantedVersion }),
      ...(latestVersion === undefined ? {} : { latestVersion }),
      updateAvailable: currentVersion !== undefined && wantedVersion !== undefined && currentVersion !== wantedVersion,
    }
  }).sort((left, right) => left.name.localeCompare(right.name))
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
