import { describe, expect, it } from 'vitest'
import {
  allowsClipboardWrite,
  contextMenuTemplate,
  desktopChromeScript,
  desktopWindowChrome,
  resolveProjectUrl,
  TITLE_BAR_HEIGHT,
} from '../src/desktop.ts'
import { resolveUpdateRepository } from '../src/manifest.ts'

const editFlags = {
  canUndo: false,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
}

describe('Electron desktop integration', () => {
  it('keeps macOS traffic lights in a hidden title bar', () => {
    expect(desktopWindowChrome('darwin')).toEqual({
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 13 },
    })
  })

  it.each(['win32', 'linux'] as const)('provides %s native controls in a frameless overlay', (platform) => {
    expect(desktopWindowChrome(platform)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#747c8c',
        height: TITLE_BAR_HEIGHT,
      },
    })
  })

  it('allows only sanitized clipboard writes from the Harness origin', () => {
    expect(allowsClipboardWrite('clipboard-sanitized-write', 'http://127.0.0.1:3000/', 'http://127.0.0.1:3000')).toBe(true)
    expect(allowsClipboardWrite('clipboard-read', 'http://127.0.0.1:3000', 'http://127.0.0.1:3000')).toBe(false)
    expect(allowsClipboardWrite('clipboard-sanitized-write', 'https://example.com', 'http://127.0.0.1:3000')).toBe(false)
  })

  it('builds editing and development context-menu actions from renderer capabilities', () => {
    const template = contextMenuTemplate({ editFlags, isEditable: true, selectionText: 'text' }, true)
    expect(template.map(item => item.role ?? item.type)).toEqual([
      'cut', 'copy', 'paste', 'separator', 'selectAll', 'separator', 'reload', 'toggleDevTools',
    ])
  })

  it('omits developer tools and disables copy without a page selection', () => {
    const template = contextMenuTemplate({ editFlags, isEditable: false, selectionText: '' }, false)
    expect(template.map(item => item.role ?? item.type)).toEqual(['copy', 'selectAll', 'separator', 'reload'])
    expect(template[0]?.enabled).toBe(false)
  })

  it('prefers a normalized repository URL over the homepage', () => {
    expect(resolveProjectUrl({
      homepage: 'https://example.com/home',
      repository: { url: 'git+https://github.com/cherrchen/deepseek-harness-electron.git' },
    })).toBe('https://github.com/cherrchen/deepseek-harness-electron')
    expect(resolveProjectUrl({ repository: 'file:///tmp/project' })).toBeUndefined()
  })

  it('reads the updater repository from electron-builder metadata', () => {
    expect(resolveUpdateRepository({
      build: { publish: { provider: 'github', owner: 'deepseek-ai', repo: 'harness' } },
    })).toEqual({ owner: 'deepseek-ai', repo: 'harness' })
    expect(resolveUpdateRepository({ build: { publish: { provider: 'generic' } } })).toBeUndefined()
  })

  it('reads the updater repository from metadata preserved in packaged applications', () => {
    expect(resolveUpdateRepository({
      repository: { url: 'https://github.com/cherrchen/deepseek-harness-electron.git' },
    })).toEqual({ owner: 'cherrchen', repo: 'deepseek-harness-electron' })
    expect(resolveUpdateRepository({ repository: 'https://example.com/owner/repo' })).toBeUndefined()
  })

  it('escapes the application name in the titlebar injection script', () => {
    const script = desktopChromeScript('</script><script>bad()</script>')
    expect(script).toContain('bar.textContent = "</script><script>bad()</script>"')
    expect(script).not.toContain('innerHTML')
  })
})
