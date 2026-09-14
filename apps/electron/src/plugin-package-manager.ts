import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { HostRuntime } from './runtime.ts'

/** Runtime paths required to expose the Desktop-bundled pnpm to upstream dsh. */
export interface PluginPackageManagerRuntime {
  /** Directory containing the generated platform shim. */
  binDirectory: string
  /** PATH value with the generated shim directory first. */
  envPath: string
}

/**
 * Resolve pnpm's packaged CommonJS entrypoint.
 * @param appPath - Electron application root.
 * @returns absolute packaged pnpm entrypoint.
 */
export function resolveBundledPnpmBin(appPath: string): string {
  return join(appPath, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
}

/**
 * Create a platform shim named `pnpm` for the upstream CLI and prepend it to PATH.
 * @param harnessHome - Active DSH home.
 * @param runtime - Resolved Host runtime the shim launches.
 * @param pnpmBin - Bundled pnpm entrypoint.
 * @param currentPath - Ambient PATH retained after the controlled shim directory.
 * @param platform - Target process platform.
 * @returns shim directory and PATH value for the dsh subprocess.
 */
export function preparePluginPackageManager(
  harnessHome: string,
  runtime: HostRuntime,
  pnpmBin: string,
  currentPath = process.env.PATH ?? '',
  platform: NodeJS.Platform = process.platform,
): PluginPackageManagerRuntime {
  if (!existsSync(pnpmBin)) throw new Error(`plugin package manager: bundled pnpm missing at ${pnpmBin}`)
  const binDirectory = join(harnessHome, 'electron', 'bin')
  mkdirSync(binDirectory, { recursive: true })
  const nodeMode = runtime.env.ELECTRON_RUN_AS_NODE === undefined ? '' : 'ELECTRON_RUN_AS_NODE=1'
  if (platform === 'win32') {
    const shim = join(binDirectory, 'pnpm.cmd')
    const enableNodeMode = nodeMode === '' ? '' : `set "${nodeMode}"\r\n`
    writeFileSync(shim, `@echo off\r\n${enableNodeMode}"${escapeCmd(runtime.executable)}" "${escapeCmd(pnpmBin)}" %*\r\n`, 'utf8')
  } else {
    const shim = join(binDirectory, 'pnpm')
    const nodeModeAssignment = nodeMode === '' ? '' : `${nodeMode} `
    writeFileSync(shim, `#!/bin/sh\n${nodeModeAssignment}exec '${escapeShell(runtime.executable)}' '${escapeShell(pnpmBin)}' "$@"\n`, { encoding: 'utf8', mode: 0o700 })
    chmodSync(shim, 0o700)
  }
  return { binDirectory, envPath: `${binDirectory}${delimiter}${currentPath}` }
}

function escapeShell(value: string): string {
  return value.replaceAll("'", "'\\''")
}

function escapeCmd(value: string): string {
  if (value.includes('"') || /[\r\n]/.test(value)) throw new Error('plugin package manager: executable path is invalid')
  return value
}
