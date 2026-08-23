import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NATIVE_CONTROL_ROW_HEIGHT } from '../src/desktop/chrome.ts'
import {
  DESKTOP_PLATFORM_ATTR,
  MARKER_CENTER,
  MARKER_MAIN_HEADER,
  MARKER_SIDEBAR,
} from '../src/renderer/desktop/window-chrome.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('Electron renderer source structure', () => {
  it('does not ship the legacy full-width desktop title bar', () => {
    const html = readFileSync(join(electronRoot, 'src', 'renderer', 'index.html'), 'utf8')
    expect(html).toContain('id="root"')
    expect(html).not.toContain('dsh-electron-titlebar')
    expect(html).not.toContain('DeepSeek Harness</div>')
  })

  it('loads integrated window chrome styles from the renderer entry', () => {
    const main = readFileSync(join(electronRoot, 'src', 'renderer', 'main.ts'), 'utf8')
    expect(main).toContain('./desktop/window-chrome.css')
    expect(main).not.toContain('titlebar.css')
    const css = readFileSync(join(electronRoot, 'src', 'renderer', 'desktop', 'window-chrome.css'), 'utf8')
    const height = css.match(/--dsh-native-control-row-height:\s*(\d+)px/)
    expect(Number(height?.[1])).toBe(NATIVE_CONTROL_ROW_HEIGHT)
    expect(css).toContain('--dsh-sidebar-top-inset: 0px')
    expect(css).toContain('--dsh-macos-sidebar-top-inset')
    expect(css).toContain('--dsh-macos-sidebar-seam-width')
    expect(css).not.toContain("[data-dsh-desktop-platform='win32'] [data-dsh-electron-sidebar]")
    expect(css).not.toContain("[data-dsh-desktop-platform='linux'] [data-dsh-electron-sidebar]")
    expect(css).not.toContain('#root::before')
    expect(css).not.toContain('#root {\n  position: relative')
    expect(css.match(/-webkit-app-region:\s*drag/g)).toHaveLength(3)
    expect(css).not.toContain('[data-conversation-scroll]')
    expect(css).not.toContain('data-dsh-electron-drag-region')
    expect(css.match(/-webkit-app-region:\s*no-drag/g)).toHaveLength(2)
    expect(css).toContain("[role='tab']")
    expect(css).toContain("[role='presentation'] > [aria-hidden='true']:has(")
    expect(css).toContain("[role='presentation'] > [role='dialog'][aria-modal='true']")
    expect(css).toContain("[role='presentation'] > [role='dialog'][aria-modal='true'] *")
    expect(css).not.toContain(":not([aria-hidden='true']) *")
    expect(css).not.toContain('#dsh-electron-titlebar')
    expect(css).toContain(MARKER_SIDEBAR)
    expect(css).toContain(MARKER_CENTER)
    expect(css).toContain(MARKER_MAIN_HEADER)
    expect(css).toContain(DESKTOP_PLATFORM_ATTR)
  })

  it('exposes desktopApp.getPlatform in the renderer facade', () => {
    const facade = readFileSync(join(electronRoot, 'src', 'renderer', 'desktop', 'index.ts'), 'utf8')
    expect(facade).toContain('getPlatform')
    expect(facade).toContain('desktopApp')
  })
})
