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

describe('desktop brand feature plugin regression', () => {
  it('always registers brand slots without gating on DSH_CLIENT_BUILD_PROFILE', () => {
    const source = readFileSync(
      join(electronRoot, 'runtime', 'plugins', 'ui-brand-electron', 'src', 'client', 'index.ts'),
      'utf8',
    )
    expect(source).toContain('sidebar.brand.mark')
    expect(source).toContain('sidebar.brand.name')
    expect(source).toContain('conversation.hero.brand.mark')
    expect(source).not.toContain('DSH_CLIENT_BUILD_PROFILE')
  })

  it('declares ui-primitives as a client external and brand declarers as inject edges', () => {
    const manifest = JSON.parse(
      readFileSync(join(electronRoot, 'runtime', 'plugins', 'ui-brand-electron', 'package.json'), 'utf8'),
    ) as { name?: string; dsh?: { client?: { inject?: string[]; external?: string[] } } }
    expect(manifest.name).toBe('@dsh-electron/dsh-electron-ui-brand')
    expect(manifest.dsh?.client?.inject).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ]))
    expect(manifest.dsh?.client?.external).toContain('@deepseek-ai/dsh-client-ui-primitives')
  })
})

describe('desktop plugin manager feature plugin regression', () => {
  it('depends on canonical Settings contracts and keeps primitives external', () => {
    const manifest = JSON.parse(
      readFileSync(join(electronRoot, 'runtime', 'plugins', 'ui-plugin-manager-electron', 'package.json'), 'utf8'),
    ) as { name?: string; dsh?: { client?: { inject?: string[]; external?: string[] } } }
    expect(manifest.name).toBe('@dsh-electron/dsh-electron-ui-plugin-manager')
    expect(manifest.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-locale',
      '@dsh-electron/dsh-electron-desktop-capabilities',
    ])
    expect(manifest.dsh?.client?.inject).not.toContain('@deepseek-ai/dsh-client-ui-settings-plugins')
    expect(manifest.dsh?.client?.external).toEqual(['@deepseek-ai/dsh-client-ui-primitives'])
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
