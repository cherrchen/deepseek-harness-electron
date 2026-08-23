import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('directory picker feature plugin regression', () => {
  it('injects the desktop capability service instead of reading window.deepseekDesktop directly', () => {
    const source = readFileSync(
      join(electronRoot, 'runtime', 'plugins', 'ui-directory-picker-electron', 'src', 'client', 'index.ts'),
      'utf8',
    )
    expect(source).toContain("'desktop'")
    expect(source).toContain('ctx.desktop.dialog.pickDirectory')
    expect(source).not.toContain('window?.deepseekDesktop')
    expect(source).not.toContain('ipcRenderer')
  })

  it('registers both workspace directory-flow slots', () => {
    const source = readFileSync(
      join(electronRoot, 'runtime', 'plugins', 'ui-directory-picker-electron', 'src', 'client', 'index.ts'),
      'utf8',
    )
    expect(source).toContain('conversation.hero.workspace.directoryFlow')
    expect(source).toContain('sidebar.workspaces.directoryFlow')
  })

  it('declares desktop capabilities as a client dependency', () => {
    const manifest = JSON.parse(
      readFileSync(join(electronRoot, 'runtime', 'plugins', 'ui-directory-picker-electron', 'package.json'), 'utf8'),
    ) as { dsh?: { client?: { inject?: string[] } } }
    expect(manifest.dsh?.client?.inject).toContain('@dsh-electron/dsh-electron-desktop-capabilities')
  })
})

describe('production runtime plugin packaging inventory', () => {
  it('includes built artifacts for every bundled production plugin and excludes test fixtures', () => {
    const pluginsRoot = join(electronRoot, 'runtime', 'plugins')
    const fixtureRoot = join(electronRoot, 'tests', 'fixtures', 'runtime-plugins')
    expect(fixtureRoot.startsWith(join(electronRoot, 'tests'))).toBe(true)

    for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const pluginRoot = join(pluginsRoot, entry.name)
      expect(existsSync(join(pluginRoot, 'package.json'))).toBe(true)
      expect(existsSync(join(pluginRoot, 'lib', 'index.js'))).toBe(true)
      const manifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8')) as { dsh?: { client?: unknown } }
      if (manifest.dsh?.client !== undefined) {
        expect(existsSync(join(pluginRoot, 'lib', 'client.js'))).toBe(true)
      }
    }
    expect(existsSync(join(electronRoot, 'runtime', 'host.patch.yml'))).toBe(true)
  })
})
