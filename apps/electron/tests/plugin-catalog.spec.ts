import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfilePluginCatalog } from '../src/plugin-catalog.ts'
import type { PluginState } from '../src/plugin-state.ts'

function writeManifest(root: string, manifest: object): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest), 'utf8')
}

describe('profile plugin catalog', () => {
  it('merges distribution and profile packages with ownership precedence and package classification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-catalog-'))
    const appPath = join(root, 'app')
    const harnessHome = join(root, 'home')
    writeManifest(join(appPath, 'runtime', 'plugins', 'system'), { name: '@desktop/system', version: '1.0.0', main: 'lib/index.js' })
    writeManifest(appPath, { dshElectron: { ecosystemPlugins: [] } })
    const profileDir = join(harnessHome, 'profiles', 'web')
    writeManifest(profileDir, {
      dependencies: {
        '@fixture/runtime': 'file:runtime',
        '@fixture/bundle': 'github:fixture/bundle',
        '@fixture/incomplete': 'github:fixture/incomplete',
        '@fixture/library': '^1.0.0',
      },
      dsh: { profile: { bundles: ['@fixture/bundle'] } },
    })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'runtime'), { name: '@fixture/runtime', version: '2.0.0', main: 'index.js', dsh: { client: {} } })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'bundle'), { name: '@fixture/bundle', version: '3.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'incomplete'), { name: '@fixture/incomplete', version: '4.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'library'), { name: '@fixture/library', version: '1.0.0' })
    const state: PluginState = { version: 2, disabled: [], profileManaged: ['@fixture/runtime', '@fixture/bundle', '@fixture/library'] }
    try {
      const entries = await new ProfilePluginCatalog(appPath, harnessHome, 'web', () => state).list()
      expect(entries.map(entry => [entry.name, entry.ownership, entry.kind, entry.activation])).toEqual([
        ['@desktop/system', 'system', 'runtime-plugin', 'hot'],
        ['@fixture/runtime', 'profile', 'runtime-plugin', 'hot'],
        ['@fixture/bundle', 'profile', 'bundle', 'profile-restart'],
        ['@fixture/incomplete', 'profile', 'bundle', 'reconcile-required'],
        ['@fixture/library', 'profile', 'dependency', 'none'],
      ])
      expect(entries.find(entry => entry.name === '@fixture/runtime')).toMatchObject({ manageable: true, hasClient: true, installSource: 'local' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
