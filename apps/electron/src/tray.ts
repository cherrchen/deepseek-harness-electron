import { join } from 'node:path'

/** Pre-rasterized tray PNG widths and heights emitted by `build-tray-icons.mjs`. */
export const TRAY_RASTER_SIZES = [16, 18, 20, 22, 24, 28, 32, 36, 44] as const

export type TrayRasterSize = (typeof TRAY_RASTER_SIZES)[number]

/**
 * Resolve the packaged tray asset for a platform, theme, and display density.
 * @param appPath - Electron application root.
 * @param platform - Runtime operating system.
 * @param dark - Whether Electron reports a dark native theme.
 * @param scaleFactor - Primary display scale factor from Electron `screen`.
 * @returns Local PNG path suitable for `nativeImage.createFromPath`.
 */
export function trayIconPath(
  appPath: string,
  platform: NodeJS.Platform,
  dark: boolean,
  scaleFactor: number,
): string {
  if (platform === 'darwin') {
    // macOS resolves `deepseekTemplate@2x.png` automatically on Retina displays.
    return join(appPath, 'build', 'tray', 'deepseekTemplate.png')
  }
  const dip = trayIconSize(platform)
  const pixel = trayIconPixelSize(dip, scaleFactor)
  const prefix = dark ? 'deepseek-white' : 'deepseek-black'
  return join(appPath, 'build', 'tray', `${prefix}-${pixel}.png`)
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

/**
 * Map a platform tray DIP size and display scale factor to a pre-rasterized PNG size.
 * @param dip - Platform tray size in device-independent pixels.
 * @param scaleFactor - Primary display scale factor.
 * @returns Nearest packaged raster size, preferring the larger size on ties.
 */
export function trayIconPixelSize(dip: number, scaleFactor: number): TrayRasterSize {
  const target = Math.round(dip * scaleFactor)
  let best: TrayRasterSize = TRAY_RASTER_SIZES[0]
  let bestDelta = Math.abs(target - best)
  for (const size of TRAY_RASTER_SIZES) {
    const delta = Math.abs(target - size)
    if (delta < bestDelta || (delta === bestDelta && size > best)) {
      best = size
      bestDelta = delta
    }
  }
  return best
}

/**
 * Ratio between a pre-rasterized PNG edge length and the platform tray DIP size.
 * @param dip - Platform tray size in device-independent pixels.
 * @param pixel - Packaged PNG edge length in pixels.
 * @returns Display scale factor for `nativeImage.createFromBuffer`.
 */
export function trayIconRasterScale(dip: number, pixel: TrayRasterSize): number {
  return pixel / dip
}

/**
 * Whether a tray PNG must be loaded with explicit logical DIP dimensions.
 * Windows ignores `addRepresentation`; passing a HiDPI bitmap via `createFromPath`
 * can render at the wrong logical size or look soft.
 * @param platform - Runtime operating system.
 * @param dip - Platform tray size in device-independent pixels.
 * @param pixel - Packaged PNG edge length in pixels.
 * @returns When true, load the PNG through `createFromBuffer` at `dip` with `trayIconRasterScale`.
 */
export function trayIconNeedsLogicalLoad(
  platform: NodeJS.Platform,
  dip: number,
  pixel: TrayRasterSize,
): boolean {
  return (platform === 'win32' || platform === 'linux') && pixel !== dip
}
