import { describe, expect, it } from 'vitest'
import { trayIconPath, trayIconSize } from '../src/tray.ts'

describe('Electron tray icons', () => {
  it('uses contrasting local assets for Windows and Linux themes', () => {
    expect(trayIconPath('/app', 'win32', false).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-black.png')
    expect(trayIconPath('/app', 'win32', true).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-white.png')
    expect(trayIconPath('/app', 'linux', true).replaceAll('\\', '/')).toBe('/app/build/tray/deepseek-white.png')
  })

  it('uses the macOS template image independent of system theme', () => {
    expect(trayIconPath('/app', 'darwin', false).replaceAll('\\', '/')).toBe('/app/build/tray/deepseekTemplate.png')
    expect(trayIconPath('/app', 'darwin', true).replaceAll('\\', '/')).toBe('/app/build/tray/deepseekTemplate.png')
  })

  it('uses platform-appropriate display sizes', () => {
    expect(trayIconSize('darwin')).toBe(18)
    expect(trayIconSize('win32')).toBe(16)
    expect(trayIconSize('linux')).toBe(22)
  })
})
