import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
${renderAllowBuilds(WEB_PROFILE_ALLOW_BUILDS)}`

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
  let next = text.endsWith('\n') ? text : `${text}\n`
  if (!/^strictDepBuilds:/m.test(next)) {
    next += 'strictDepBuilds: true\n'
  } else {
    next = next.replace(/^strictDepBuilds:\s*\S.*$/m, 'strictDepBuilds: true')
  }
  if (!/^allowBuilds:/m.test(next)) {
    next += renderAllowBuilds(WEB_PROFILE_ALLOW_BUILDS)
    return next
  }
  return insertMissingAllowBuilds(next, WEB_PROFILE_ALLOW_BUILDS)
}

function renderAllowBuilds(entries: Readonly<Record<string, boolean>>): string {
  const lines = ['allowBuilds:']
  for (const [name, allowed] of Object.entries(entries)) {
    lines.push(`  ${yamlKey(name)}: ${String(allowed)}`)
  }
  return `${lines.join('\n')}\n`
}

function insertMissingAllowBuilds(text: string, seed: Readonly<Record<string, boolean>>): string {
  const present = new Set<string>()
  for (const match of text.matchAll(/^\s+('[^']+'|[A-Za-z0-9@._/-]+):\s*(?:true|false)\s*$/gm)) {
    const raw = match[1]
    if (raw === undefined) continue
    present.add(raw.startsWith("'") ? raw.slice(1, -1) : raw)
  }
  const missing = Object.entries(seed).filter(([name]) => !present.has(name))
  if (missing.length === 0) return text
  const insertion = missing.map(([name, allowed]) => `  ${yamlKey(name)}: ${String(allowed)}`).join('\n')
  return text.replace(/^allowBuilds:\s*$/m, `allowBuilds:\n${insertion}`)
}

function yamlKey(name: string): string {
  return name.startsWith('@') || name.includes('/') ? `'${name.replaceAll("'", "''")}'` : name
}
