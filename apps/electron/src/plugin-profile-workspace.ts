import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { load, dump } from 'js-yaml'

/** Reviewed install-script policy merged into the shared web profile. */
export const WEB_PROFILE_ALLOW_BUILDS: Readonly<Record<string, boolean>> = {
  esbuild: true,
  '@google/genai': false,
  protobufjs: false,
  'node-addon-require-builtin': false,
}

const DEFAULT_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
strictDepBuilds: true
`

/**
 * Ensure the web profile workspace file enables strict dependency builds
 * and carries Desktop's reviewed allowBuilds seed without dropping user keys.
 * @param profileDir - Absolute `$DSH_HOME/profiles/web` directory.
 */
export function ensureWebProfileWorkspace(profileDir: string): void {
  const path = join(profileDir, 'pnpm-workspace.yaml')
  mkdirSync(profileDir, { recursive: true })
  if (!existsSync(path)) {
    writeFileSync(path, mergeWorkspacePolicy(DEFAULT_WORKSPACE), { encoding: 'utf8', mode: 0o600 })
    return
  }
  const current = readFileSync(path, 'utf8')
  const next = mergeWorkspacePolicy(current)
  if (next !== current) writeFileSync(path, next, { encoding: 'utf8', mode: 0o600 })
}

/**
 * Merge Desktop's reviewed pnpm workspace policy into an existing file.
 * @param text - Current `pnpm-workspace.yaml` contents.
 * @returns Policy with `strictDepBuilds` and merged `allowBuilds`.
 */
export function mergeWorkspacePolicy(text: string): string {
  const workspace: unknown = load(text) ?? {}
  if (!isMapping(workspace)) throw new Error('Web profile workspace must be a YAML mapping.')
  const builds = workspace['allowBuilds'] ?? {}
  if (!isMapping(builds)) throw new Error('Web profile allowBuilds must be a YAML mapping.')
  workspace['strictDepBuilds'] = true
  workspace['allowBuilds'] = { ...WEB_PROFILE_ALLOW_BUILDS, ...builds }
  return dump(workspace, { lineWidth: -1, noRefs: true })
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
