import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  allowsClipboardWrite,
  contextMenuTemplate,
  desktopChromeScript,
  desktopWindowChrome,
  directoryOpenDialogOptions,
  isAllowedExternalUrl,
  normalizeShellPath,
  pickDirectoryResult,
  requireClipboardText,
  requireNotificationOptions,
  themeState,
  updaterSnapshot,
} from '../src/desktop/index.ts'
import {
  ensureRuntimePluginsLinked,
  profileModuleLinkPath,
} from '../src/runtime-plugins.ts'
import { resolveHostPatchPath } from '../src/runtime-overlay.ts'
import { HttpHarnessTransport } from '../src/harness/transport.ts'

describe('Electron desktop integration', () => {
  it('keeps macOS traffic lights inside the reserved title strip', () => {
    expect(desktopWindowChrome('darwin')).toEqual({
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 13 },
    })
  })

  it('uses Window Controls Overlay outside macOS', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(desktopWindowChrome(platform)).toEqual({
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#00000000',
          symbolColor: '#747c8c',
          height: 40,
        },
      })
    }
  })

  it('allows only sanitized clipboard writes from the Harness origin', () => {
    expect(allowsClipboardWrite('clipboard-sanitized-write', 'dsh-electron://localhost/', 'dsh-electron://localhost')).toBe(true)
    expect(allowsClipboardWrite('clipboard-read', 'dsh-electron://localhost', 'dsh-electron://localhost')).toBe(false)
    expect(allowsClipboardWrite('clipboard-sanitized-write', 'https://example.com', 'dsh-electron://localhost')).toBe(false)
  })

  it('builds a context menu from Chromium editing capabilities', () => {
    expect(contextMenuTemplate({
      isEditable: true,
      selectionText: 'selected',
      editFlags: {
        canCut: true,
        canCopy: true,
        canPaste: false,
        canSelectAll: true,
      },
    }, true)).toEqual([
      { role: 'cut', enabled: true },
      { role: 'copy', enabled: true },
      { role: 'paste', enabled: false },
      { type: 'separator' },
      { role: 'selectAll', enabled: true },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ])
  })

  it('escapes the application name before injecting the title bar script', () => {
    const script = desktopChromeScript('</script><script>bad()</script>')
    expect(script).toContain(JSON.stringify('</script><script>bad()</script>'))
    expect(script).toMatch(/textContent = "/)
  })

  it('maps directory picker options and results', () => {
    expect(directoryOpenDialogOptions({ title: 'Pick', defaultPath: '/tmp' })).toEqual({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Pick',
      defaultPath: '/tmp',
    })
    expect(pickDirectoryResult(true, ['/tmp'])).toBeNull()
    expect(pickDirectoryResult(false, [])).toBeNull()
    expect(pickDirectoryResult(false, ['/work'])).toEqual({ path: '/work' })
  })

  it('allowlists external URL protocols and rejects bad shell paths', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:a@b.c')).toBe(true)
    expect(isAllowedExternalUrl('file:///tmp')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(normalizeShellPath('  /tmp/a  ')).toBe('/tmp/a')
    expect(normalizeShellPath('')).toBeUndefined()
    expect(normalizeShellPath('a\0b')).toBeUndefined()
  })

  it('validates clipboard and notification payloads', () => {
    expect(requireClipboardText('hi')).toBe('hi')
    expect(() => requireClipboardText(1)).toThrow(/string/)
    expect(requireNotificationOptions({ title: 'Done', body: 'ok', payload: 's1' })).toEqual({
      title: 'Done',
      body: 'ok',
      payload: 's1',
    })
    expect(() => requireNotificationOptions({ title: '' })).toThrow(/title/)
  })

  it('maps theme and updater snapshots', () => {
    expect(themeState(true, 'dark')).toEqual({ shouldUseDarkColors: true, themeSource: 'dark' })
    expect(updaterSnapshot('downloading', 40, 'prerelease')).toEqual({
      state: 'downloading',
      progress: 40,
      channel: 'prerelease',
    })
    expect(updaterSnapshot('idle', undefined, 'stable').state).toBe('idle')
  })
})

describe('Electron host runtime overlay', () => {
  it('writes the Host patch that keeps browse Host and Electron client', async () => {
    const appPath = join(import.meta.dirname, '..')
    const userData = await mkdtemp(join(tmpdir(), 'dsh-electron-patch-'))
    try {
      const patchPath = resolveHostPatchPath(appPath, userData)
      const body = await readFile(patchPath, 'utf8')
      expect(body).toContain('directory-picker')
      expect(body).toContain('disabled: true')
      expect(body).toContain('@deepseek-ai/dsh-host-directory-picker-browse')
      expect(body).toContain('@deepseek-ai/dsh-electron-ui-directory-picker')
      expect(body).toContain('@deepseek-ai/dsh-electron-desktop-capabilities')
      expect(body).not.toContain('directory-picker-browse-client')
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('links bundled runtime plugins into the profile module fallback', async () => {
    const appPath = join(import.meta.dirname, '..')
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    try {
      ensureRuntimePluginsLinked(appPath, harnessHome)
      const link = profileModuleLinkPath(harnessHome, '@deepseek-ai/dsh-electron-ui-directory-picker')
      const { readlink } = await import('node:fs/promises')
      const target = await readlink(link)
      expect(target.replaceAll('\\', '/')).toBe(
        join(appPath, 'runtime', 'plugins', 'ui-directory-picker-electron').replaceAll('\\', '/'),
      )
    } finally {
      await rm(harnessHome, { recursive: true, force: true })
    }
  })
})

describe('HarnessTransport', () => {
  it('exposes the HTTP compatibility carrier', async () => {
    const transport = new HttpHarnessTransport()
    expect(() => transport.requireOrigin()).toThrow(/not ready/)
    await transport.start('http://127.0.0.1:3456')
    expect(transport.requireOrigin()).toBe('http://127.0.0.1:3456')
    await transport.stop()
  })
})
