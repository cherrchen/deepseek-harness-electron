import { join } from 'node:path'

/**
 * Resolve the packaged tray asset for a platform and current system theme.
 * @param appPath - Electron application root.
 * @param platform - Runtime operating system.
 * @param dark - Whether Electron reports a dark native theme.
 * @returns Local PNG path suitable for `nativeImage.createFromPath`.
 */
export function trayIconPath(appPath: string, platform: NodeJS.Platform, dark: boolean): string {
  const filename = platform === 'darwin'
    ? 'deepseekTemplate.png'
    : dark ? 'deepseek-white.png' : 'deepseek-black.png'
  return join(appPath, 'build', 'tray', filename)
}

/**
 * Select a tray icon size in device-independent pixels.
 * @param platform - Runtime operating system.
 * @returns Platform-appropriate square icon size.
 */
export function trayIconSize(platform: NodeJS.Platform): number {
  if (platform === 'darwin') return 18
  if (platform === 'win32') return 16
  return 22
}
