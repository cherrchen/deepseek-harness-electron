import { join } from 'node:path'

/** The bounded startup window before Electron reports a failed Harness boot. */
export const HARNESS_START_TIMEOUT_MS = 60_000

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

  args.push('--port', '0')

  return args
}

/**
 * Read the loopback readiness URL emitted by the upstream Web composition.
 * @param output - Accumulated standard output; the readiness line may follow other logs.
 * @returns The validated loopback URL, or undefined until a complete line is present.
 */
export function parseHarnessReadyUrl(output: string): string | undefined {
  const match = /^dsh web: (http:\/\/127\.0\.0\.1:(\d+))(?:\s|$)/m.exec(output)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const port = Number(match[2])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined
  return match[1]
}
