import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NATIVE_CONTROL_ROW_HEIGHT } from '../src/desktop/chrome.ts'
import {
  DESKTOP_PLATFORM_ATTR,
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
    expect(css).toContain('--dsh-macos-sidebar-seam-width')
    expect(css).toContain('#root::before')
    expect(css).toContain('padding-top: var(--dsh-native-control-row-height)')
    expect(css.match(/-webkit-app-region:\s*drag/g)).toHaveLength(1)
    expect(css).not.toContain('[data-conversation-scroll]')
    expect(css).not.toContain('data-dsh-electron-drag-region')
    expect(css).not.toContain('-webkit-app-region: no-drag')
    expect(css).not.toContain('#dsh-electron-titlebar')
    expect(css).toContain(MARKER_SIDEBAR)
    expect(css).toContain(DESKTOP_PLATFORM_ATTR)
  })

  it('exposes desktopApp.getPlatform in the renderer facade', () => {
    const facade = readFileSync(join(electronRoot, 'src', 'renderer', 'desktop', 'index.ts'), 'utf8')
    expect(facade).toContain('getPlatform')
    expect(facade).toContain('desktopApp')
  })
})
