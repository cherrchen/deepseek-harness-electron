import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Update streams exposed by the desktop application. */
export type UpdateChannel = 'prerelease' | 'stable'

/** Default update stream for new and unreadable desktop preferences. */
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'prerelease'

interface DesktopPreferences {
  updateChannel: UpdateChannel
}

/**
 * Load the desktop-owned update preference without affecting Harness state.
 * @param userDataPath - Electron user-data directory.
 * @returns Stored channel, or the prerelease default when absent or invalid.
 */
export function loadUpdateChannel(userDataPath: string): UpdateChannel {
  try {
    const value: unknown = JSON.parse(readFileSync(preferencesPath(userDataPath), 'utf8'))
    if (isRecord(value) && isUpdateChannel(value.updateChannel)) return value.updateChannel
  } catch (error: unknown) {
    if (!isMissingFileError(error)) console.error('Unable to read desktop preferences', error)
  }
  return DEFAULT_UPDATE_CHANNEL
}

/**
 * Persist the desktop-owned update preference below Electron user data.
 * @param userDataPath - Electron user-data directory.
 * @param updateChannel - Selected update stream.
 */
export function saveUpdateChannel(userDataPath: string, updateChannel: UpdateChannel): void {
  const preferences: DesktopPreferences = { updateChannel }
  writeFileSync(preferencesPath(userDataPath), `${JSON.stringify(preferences, undefined, 2)}\n`, 'utf8')
}

function preferencesPath(userDataPath: string): string {
  return join(userDataPath, 'desktop-preferences.json')
}

function isUpdateChannel(value: unknown): value is UpdateChannel {
  return value === 'prerelease' || value === 'stable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}
