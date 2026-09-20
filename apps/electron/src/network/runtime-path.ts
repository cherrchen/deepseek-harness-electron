import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolve the Network Runtime from a fixed application-owned path.
 * The helper is never searched through PATH, which prevents an ambient binary
 * from replacing the packaged network authority.
 * @param options - Electron roots, packaging state, and target platform.
 * @returns absolute helper path.
 * @throws when the prepared or packaged helper is missing.
 */
export function resolveNetworkRuntimePath(options: {
  appPath: string
  resourcesPath: string
  packaged: boolean
  platform?: NodeJS.Platform
  exists?: (path: string) => boolean
}): string {
  const executable = (options.platform ?? process.platform) === 'win32'
    ? 'dsh-electron-network-runtime.exe'
    : 'dsh-electron-network-runtime'
  const path = options.packaged
    ? join(options.resourcesPath, 'network-runtime', executable)
    : join(options.appPath, '.electron-build', 'network-runtime', 'current', executable)
  if (!(options.exists ?? existsSync)(path)) {
    throw new Error(`desktop network: prepared runtime is missing at ${path}`)
  }
  return path
}
