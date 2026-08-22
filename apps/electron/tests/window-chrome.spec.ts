import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
    expect(css).toContain('--dsh-macos-sidebar-top-inset')
    expect(css).toContain('--dsh-macos-center-drag-height')
    expect(css).toContain('--dsh-macos-sidebar-seam-width')
    expect(css).toContain('[data-conversation-scroll]')
    expect(css).toContain('-webkit-app-region: drag')
    expect(css).not.toContain('#dsh-electron-titlebar')
    expect(css).toContain('env(titlebar-area-x')
    expect(css).toContain(MARKER_SIDEBAR)
    expect(css).toContain(DESKTOP_PLATFORM_ATTR)
  })

  it('exposes desktopApp.getPlatform in the renderer facade', () => {
    const facade = readFileSync(join(electronRoot, 'src', 'renderer', 'desktop', 'index.ts'), 'utf8')
    expect(facade).toContain('getPlatform')
    expect(facade).toContain('desktopApp')
  })
})
