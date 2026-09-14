import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The bounded startup window before Electron reports a failed Harness boot. */
export const HARNESS_START_TIMEOUT_MS = 60_000

/**
 * Executable and extra environment for every dsh child the Desktop supervises.
 *
 * Windows needs a console-subsystem image: a GUI image such as `electron.exe` has no console, so
 * every console target it creates receives a new visible Windows Terminal. Launching the packaged
 * Node.js with `windowsHide` gives the whole process tree one hidden console to inherit.
 */
export interface HostRuntime {
  /** Executable that starts a Node.js-compatible dsh process. */
  executable: string
  /** Extra environment required by `executable`, empty for a packaged Node.js. */
  env: Record<string, string>
}

/**
 * Resolve the executable that carries the supervised Host and its plugin commands.
 *
 * Windows packaging ships `node.exe` under `resources/node`; development builds use the copy
 * created by `pnpm --filter @dsh-electron/dsh-electron prepare:node`. Other platforms keep using
 * Electron's own Node-compatible child mode, which has no console-visibility defect there.
 *
 * @param options - Application paths, packaging state, and optional executable override.
 * @param options.appPath - Electron application root.
 * @param options.resourcesPath - Electron `resources` directory beside the packaged application.
 * @param options.packaged - Whether this process runs from a packaged application.
 * @param options.platform - Target platform; defaults to the running platform.
 * @param options.arch - Target architecture; defaults to the running architecture.
 * @param options.override - Explicit executable path that wins over both packaged locations.
 * @param options.exists - Existence probe used for candidate paths.
 * @returns Executable and environment for supervised dsh children.
 * @throws When a Windows target has no prepared Node.js at any candidate path.
 */
export function resolveHostRuntime(options: {
  appPath: string
  resourcesPath: string
  packaged: boolean
  platform?: NodeJS.Platform
  arch?: string
  override?: string | undefined
  exists?: (path: string) => boolean
}): HostRuntime {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return { executable: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
  const arch = options.arch ?? process.arch
  const candidates = [
    options.override,
    options.packaged ? join(options.resourcesPath, 'node', 'node.exe') : undefined,
    join(options.appPath, '.electron-build', 'node', `win-${arch}`, 'node.exe'),
  ].filter((candidate): candidate is string => candidate !== undefined)
  const exists = options.exists ?? existsSync
  const executable = candidates.find(candidate => exists(candidate))
  if (executable === undefined) {
    throw new Error(
      `electron runtime: prepared Node.js is missing (looked for ${candidates[candidates.length - 1] ?? 'no candidate'}); `
      + 'run pnpm --filter @dsh-electron/dsh-electron prepare:node',
    )
  }
  return { executable, env: {} }
}

/**
 * Resolve the shared Harness home below the operating-system user home.
 * @param userHome - Home directory reported by Electron.
 * @returns Cross-platform path used as `DSH_HOME` by the supervised CLI.
 */
export function resolveHarnessHome(userHome: string): string {
  return join(userHome, '.dsh')
}

/**
 * Resolve the packaged dsh executable module below Electron's application root.
 * @param appPath - Electron application root, including an app.asar path in production.
 * @returns Absolute path accepted by Electron's Node-compatible child mode.
 */
export function resolveDshBin(appPath: string): string {
  return join(appPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

/**
 * Build the Node-compatible child arguments required by upstream config HMR.
 * @param dshBin - Absolute path to the packaged dsh executable module.
 * @param patchPath - overlay patch path before Web launch.
 * @returns Electron child-mode arguments for a random-port Web launch.
 */
export function harnessArguments(dshBin: string, patchPath?: string): string[] {
  const args = [
    '--expose-internals',
    dshBin,
    'web',
  ]

  if (patchPath !== undefined) {
    args.push('--patch', patchPath)
  }

  args.push('--port', '0', '--no-open')

  return args
}

/** Bytes of Host stdout retained while waiting for the readiness line. */
export const HARNESS_STARTUP_BUFFER_LIMIT = 256 * 1024

/** Handshake buffer used only until `dsh web` reports a loopback URL. */
export interface HarnessStartupScan {
  output: string
  settled: boolean
}

/**
 * Scan one stdout chunk for the readiness URL, then drop the handshake buffer.
 * Callers must skip this helper after `settled` so Host logs are not retained.
 * @param scan - Mutable handshake state owned by the supervisor.
 * @param text - Decoded stdout chunk.
 * @returns The validated readiness URL when this chunk completes the handshake.
 */
export function scanHarnessStartupChunk(scan: HarnessStartupScan, text: string): string | undefined {
  if (scan.settled) return undefined
  scan.output += text
  const url = parseHarnessReadyUrl(scan.output)
  if (url !== undefined) {
    scan.settled = true
    scan.output = ''
    return url
  }
  if (scan.output.length > HARNESS_STARTUP_BUFFER_LIMIT) {
    scan.output = scan.output.slice(scan.output.length - HARNESS_STARTUP_BUFFER_LIMIT)
  }
  return undefined
}

/**
 * Read the loopback readiness URL emitted by the upstream Web composition.
 * @param output - Accumulated standard output; the readiness line may follow other logs.
 * @returns The validated loopback URL, or undefined until a complete line is present.
 */
export function parseHarnessReadyUrl(output: string): string | undefined {
  const match = /^dsh web: (http:\/\/127\.0\.0\.1:(\d+)(?:\/\?token=[A-Za-z0-9_-]+)?)(?:\s|$)/m.exec(output)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const port = Number(match[2])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined
  return match[1]
}
