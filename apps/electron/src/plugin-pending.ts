import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { writeTextFileAtomic } from './text-file.ts'

/** On-disk marker for an in-flight `dsh plugin` mutation. */
export interface PluginPendingMarker {
  /** Opaque id for this mutation attempt. */
  mutationId: string
  /** Package command kind recorded before spawn. */
  command: string
  /** pnpm-compatible spec or package name. */
  spec: string
  /** ISO-8601 timestamp when the marker was written. */
  startedAt: string
}

/**
 * Resolve the pending-marker path under `$DSH_HOME/electron/`.
 * @param harnessHome - Active DSH home.
 * @returns Absolute marker path.
 */
export function packagesPendingPath(harnessHome: string): string {
  return join(harnessHome, 'electron', 'packages-pending')
}

/**
 * Read the pending marker when present and well-formed.
 * @param path - Absolute marker path.
 * @returns Parsed marker, or undefined when absent.
 */
export function readPluginPending(path: string): PluginPendingMarker | undefined {
  if (!existsSync(path)) return undefined
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PluginPendingMarker>
  if (
    typeof parsed.mutationId !== 'string' || parsed.mutationId.length === 0
    || typeof parsed.command !== 'string' || parsed.command.length === 0
    || typeof parsed.spec !== 'string' || parsed.spec.length === 0
    || typeof parsed.startedAt !== 'string' || parsed.startedAt.length === 0
  ) {
    throw new Error(`plugin pending: invalid marker at ${path}`)
  }
  return {
    mutationId: parsed.mutationId,
    command: parsed.command,
    spec: parsed.spec,
    startedAt: parsed.startedAt,
  }
}

/**
 * Write a new pending marker before spawning `dsh plugin`.
 * @param path - Absolute marker path.
 * @param command - Package command kind.
 * @param spec - pnpm-compatible spec or package name.
 * @returns The written marker.
 */
export async function writePluginPending(
  path: string,
  command: string,
  spec: string,
): Promise<PluginPendingMarker> {
  const marker: PluginPendingMarker = {
    mutationId: randomUUID(),
    command,
    spec,
    startedAt: new Date().toISOString(),
  }
  await writeTextFileAtomic(path, `${JSON.stringify(marker, undefined, 2)}\n`)
  return marker
}

/**
 * Remove the pending marker after a mutation settles or startup reconcile succeeds.
 * @param path - Absolute marker path.
 */
export async function clearPluginPending(path: string): Promise<void> {
  if (!existsSync(path)) return
  unlinkSync(path)
}
