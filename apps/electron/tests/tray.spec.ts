import { describe, expect, it } from 'vitest'
import {
  trayIconNeedsLogicalLoad,
  trayIconPath,
  trayIconPixelSize,
  trayIconRasterScale,
  trayIconSize,
  TRAY_RASTER_SIZES,
} from '../src/tray.ts'

describe('Electron tray icons', () => {
  it('uses contrasting local assets for Windows and Linux themes', () => {
    expect(trayIconPath('/app', 'win32', false, 1).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-black-16.png')
    expect(trayIconPath('/app', 'win32', true, 1).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-white-16.png')
    expect(trayIconPath('/app', 'win32', false, 2).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-black-32.png')
    expect(trayIconPath('/app', 'linux', true, 1).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-white-22.png')
    expect(trayIconPath('/app', 'linux', true, 2).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-white-44.png')
  })

  it('uses the macOS template image independent of system theme and scale factor', () => {
    expect(trayIconPath('/app', 'darwin', false, 1).replaceAll('\\', '/')).toBe('/app/build/tray/deepseekTemplate.png')
    expect(trayIconPath('/app', 'darwin', true, 1).replaceAll('\\', '/')).toBe('/app/build/tray/deepseekTemplate.png')
    expect(trayIconPath('/app', 'darwin', false, 2).replaceAll('\\', '/')).toBe('/app/build/tray/deepseekTemplate.png')
  })

  it('uses platform-appropriate display sizes', () => {
    expect(trayIconSize('darwin')).toBe(18)
    expect(trayIconSize('win32')).toBe(16)
    expect(trayIconSize('linux')).toBe(22)
  })

  it('maps display scale factors to pre-rasterized PNG sizes', () => {
    expect(trayIconPixelSize(16, 1)).toBe(16)
    expect(trayIconPixelSize(16, 1.25)).toBe(20)
    expect(trayIconPixelSize(16, 1.5)).toBe(24)
    expect(trayIconPixelSize(16, 2)).toBe(32)
    expect(trayIconPixelSize(22, 1.5)).toBe(32)
    expect(TRAY_RASTER_SIZES).toEqual([16, 18, 20, 22, 24, 28, 32, 36, 44])
  })

  it('loads HiDPI Windows and Linux tray PNGs at logical DIP size', () => {
    expect(trayIconRasterScale(16, 32)).toBe(2)
    expect(trayIconRasterScale(16, 20)).toBe(1.25)
    expect(trayIconRasterScale(22, 44)).toBe(2)
    expect(trayIconNeedsLogicalLoad('win32', 16, 16)).toBe(false)
    expect(trayIconNeedsLogicalLoad('win32', 16, 32)).toBe(true)
    expect(trayIconNeedsLogicalLoad('linux', 22, 22)).toBe(false)
    expect(trayIconNeedsLogicalLoad('linux', 22, 44)).toBe(true)
    expect(trayIconNeedsLogicalLoad('darwin', 18, 36)).toBe(false)
  })
})
