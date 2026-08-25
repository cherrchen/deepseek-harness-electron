import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfilePluginCatalog } from '../src/plugin-catalog.ts'
import { effectivePluginRoster } from '../src/plugin-runtime-config.ts'
import type { PluginState } from '../src/plugin-state.ts'

function writeManifest(root: string, manifest: object): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest), 'utf8')
}

function writePackageFile(root: string, path: string, contents = ''): void {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, contents, 'utf8')
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
        '@fixture/broken-runtime': 'github:fixture/broken-runtime',
        '@fixture/library': '^1.0.0',
      },
      dsh: { profile: { bundles: ['@fixture/bundle'] } },
    })
    const runtimeRoot = join(profileDir, 'node_modules', '@fixture', 'runtime')
    writeManifest(runtimeRoot, { name: '@fixture/runtime', version: '2.0.0', main: 'index.js', exports: { './client': './client.js' }, dsh: { client: {} } })
    writePackageFile(runtimeRoot, 'index.js')
    writePackageFile(runtimeRoot, 'client.js')
    const bundleRoot = join(profileDir, 'node_modules', '@fixture', 'bundle')
    writeManifest(bundleRoot, { name: '@fixture/bundle', version: '3.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    writePackageFile(bundleRoot, 'cordis.patch.yml', '[]\n')
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'incomplete'), { name: '@fixture/incomplete', version: '4.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'broken-runtime'), {
      name: '@fixture/broken-runtime', version: '5.0.0', main: 'lib/index.js',
      exports: { './client': './lib/client.js' }, dsh: { client: {} },
    })
    writeManifest(join(profileDir, 'node_modules', '@fixture', 'library'), { name: '@fixture/library', version: '1.0.0' })
    const state: PluginState = {
      version: 2,
      disabled: [],
      profileManaged: ['@fixture/runtime', '@fixture/bundle', '@fixture/broken-runtime', '@fixture/library'],
    }
    try {
      const entries = await new ProfilePluginCatalog(appPath, harnessHome, 'web', () => state).list()
      expect(entries.map(entry => [entry.name, entry.ownership, entry.kind, entry.activationMode, entry.health])).toEqual([
        ['@desktop/system', 'system', 'runtime-plugin', 'hot', 'healthy'],
        ['@fixture/runtime', 'profile', 'runtime-plugin', 'hot', 'healthy'],
        ['@fixture/bundle', 'profile', 'bundle', 'profile-restart', 'healthy'],
        ['@fixture/incomplete', 'profile', 'bundle', 'profile-restart', 'reconcile-required'],
        ['@fixture/broken-runtime', 'profile', 'runtime-plugin', 'hot', 'reconcile-required'],
        ['@fixture/library', 'profile', 'dependency', 'none', 'healthy'],
      ])
      expect(entries.find(entry => entry.name === '@fixture/runtime')).toMatchObject({ manageable: true, hasClient: true, installSource: 'local' })
      expect(entries.find(entry => entry.name === '@fixture/broken-runtime')).toMatchObject({ manageable: false, hasClient: true })
      expect(effectivePluginRoster(entries, state).map(entry => entry.name)).not.toContain('@fixture/broken-runtime')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('owns package action policy for Registry, Git, copied local, link, and missing dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-catalog-actions-'))
    const appPath = join(root, 'app')
    const harnessHome = join(root, 'home')
    mkdirSync(join(appPath, 'runtime', 'plugins'), { recursive: true })
    writeManifest(appPath, { dshElectron: { ecosystemPlugins: [] } })
    const profileDir = join(harnessHome, 'profiles', 'web')
    writeManifest(profileDir, {
      dependencies: {
        registry: '^1.0.0',
        git: 'github:fixture/git#main',
        copied: 'file:/fixture/copied',
        linked: 'link:/fixture/linked',
        missing: '^1.0.0',
      },
    })
    for (const name of ['registry', 'git', 'copied', 'linked']) {
      writeManifest(join(profileDir, 'node_modules', name), { name, version: '1.0.0' })
    }
    const state: PluginState = { version: 2, disabled: [], profileManaged: [] }
    try {
      const entries = await new ProfilePluginCatalog(appPath, harnessHome, 'web', () => state).list()
      expect(entries.find(entry => entry.name === 'registry')?.packageActions)
        .toEqual({ checkUpdates: true, update: 'registry', reinstall: true, remove: true })
      expect(entries.find(entry => entry.name === 'git')?.packageActions)
        .toEqual({ checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true })
      expect(entries.find(entry => entry.name === 'copied')?.packageActions)
        .toEqual({ checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true })
      expect(entries.find(entry => entry.name === 'linked')?.packageActions)
        .toEqual({ checkUpdates: false, update: false, reinstall: false, remove: true })
      expect(entries.find(entry => entry.name === 'missing')).toMatchObject({
        health: 'reconcile-required',
        packageActions: { checkUpdates: true, update: 'registry', reinstall: true, remove: true },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
