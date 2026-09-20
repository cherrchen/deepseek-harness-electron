import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { writeDesktopFileAtomic } from '../atomic-file.ts'

/** One-shot startup override file accepted by v1. */
export interface NetworkStartupOverrideV1 {
  version: 1
  mode: 'default'
  createdAt: string
  nonce: string
}

/** Result of consuming an override; warnings never prevent startup. */
export interface NetworkStartupOverrideResult {
  override?: NetworkStartupOverrideV1
  warning?: string
}

/**
 * Atomically write a one-use Default override before relaunch.
 * @param userDataPath - Electron user-data directory.
 * @param now - Clock used for deterministic tests.
 * @param nonce - Nonce generator used for deterministic tests.
 * @returns the written override.
 */
export async function writeDefaultStartupOverride(
  userDataPath: string,
  now: () => Date = () => new Date(),
  nonce: () => string = randomUUID,
): Promise<NetworkStartupOverrideV1> {
  const override: NetworkStartupOverrideV1 = {
    version: 1,
    mode: 'default',
    createdAt: now().toISOString(),
    nonce: nonce(),
  }
  await writeDesktopFileAtomic(startupOverridePath(userDataPath), `${JSON.stringify(override, undefined, 2)}\n`)
  return override
}

/**
 * Read and delete a one-shot startup override before applying it.
 * A corrupt file is deleted and reported as a sanitized warning so it cannot
 * become a second persistent configuration source.
 * @param userDataPath - Electron user-data directory.
 * @returns consumed override or a non-fatal warning.
 */
export async function consumeNetworkStartupOverride(userDataPath: string): Promise<NetworkStartupOverrideResult> {
  const path = startupOverridePath(userDataPath)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return {}
    return { warning: 'The one-time Network startup override could not be read.' }
  }
  await rm(path, { force: true })
  try {
    const value: unknown = JSON.parse(text)
    if (!isOverride(value)) return { warning: 'The one-time Network startup override was invalid and was ignored.' }
    return { override: value }
  } catch {
    return { warning: 'The one-time Network startup override was invalid and was ignored.' }
  }
}

/** @param userDataPath - Electron user-data directory. @returns override file path. */
export function startupOverridePath(userDataPath: string): string {
  return join(userDataPath, 'network-startup-override.json')
}

function isOverride(value: unknown): value is NetworkStartupOverrideV1 {
  return typeof value === 'object'
    && value !== null
    && 'version' in value
    && value.version === 1
    && 'mode' in value
    && value.mode === 'default'
    && 'createdAt' in value
    && typeof value.createdAt === 'string'
    && !Number.isNaN(Date.parse(value.createdAt))
    && 'nonce' in value
    && typeof value.nonce === 'string'
    && value.nonce.length > 0
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
