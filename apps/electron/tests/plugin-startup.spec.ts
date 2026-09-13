import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfilePluginCatalog } from '../src/plugin-catalog.ts'
import { writePluginPending } from '../src/plugin-pending.ts'
import { PluginProfileLock } from '../src/plugin-profile-lock.ts'
import { PluginRecoveryError } from '../src/plugin-recovery.ts'
import { loadPluginState } from '../src/plugin-state.ts'
import {
  disableAllManageablePlugins,
  reconcilePendingPackageMutation,
  resetPluginManagement,
} from '../src/plugin-startup.ts'
import { PLUGIN_RUNTIME_CONFIG_FILENAME } from '../src/plugin-runtime-config.ts'

function writeManifest(root: string, manifest: object): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest), 'utf8')
}

describe('plugin startup reconcile and recovery actions', () => {
  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-startup-'))
    const appPath = join(root, 'app')
    const harnessHome = join(root, 'home')
    mkdirSync(join(appPath, 'runtime', 'plugins'), { recursive: true })
    writeManifest(appPath, { dshElectron: { ecosystemPlugins: [] } })
    const profileDir = join(harnessHome, 'profiles', 'web')
    writeManifest(profileDir, { dependencies: { '@fixture/cli-runtime': 'github:fixture/cli-runtime' } })
    const runtimeRoot = join(profileDir, 'node_modules', '@fixture', 'cli-runtime')
    writeManifest(runtimeRoot, { name: '@fixture/cli-runtime', version: '1.0.0', main: 'index.js' })
    writeFileSync(join(runtimeRoot, 'index.js'), '', 'utf8')
    const statePath = join(harnessHome, 'electron', 'plugin-state.json')
    const configPath = join(harnessHome, 'electron', PLUGIN_RUNTIME_CONFIG_FILENAME)
    const pendingPath = join(harnessHome, 'electron', 'packages-pending')
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(statePath, JSON.stringify({
      version: 2,
      disabled: [],
      profileManaged: ['@fixture/cli-runtime'],
    }), 'utf8')
    const catalog = new ProfilePluginCatalog(appPath, harnessHome, 'web', () => loadPluginState(statePath).state)
    return { root, harnessHome, profileDir, statePath, configPath, pendingPath, catalog }
  }

  it('reconciles a leftover pending marker without starting Host', async () => {
    const f = await fixture()
    try {
      await writePluginPending(f.pendingPath, 'add', '@fixture/cli-runtime')
      const hostStarts: string[] = []
      await reconcilePendingPackageMutation({
        harnessHome: f.harnessHome,
        catalog: f.catalog,
        pendingPath: f.pendingPath,
        lock: new PluginProfileLock(join(f.profileDir, 'lock'), 200, 10),
      })
      hostStarts.push('would-start')
      expect(existsSync(f.pendingPath)).toBe(false)
      expect(hostStarts).toEqual(['would-start'])
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('requires recovery when pending reconcile cannot list the catalog', async () => {
    const f = await fixture()
    try {
      await writePluginPending(f.pendingPath, 'add', '@fixture/cli-runtime')
      writeFileSync(join(f.profileDir, 'package.json'), '{', 'utf8')
      const hostStarts: string[] = []
      const failure = await reconcilePendingPackageMutation({
        harnessHome: f.harnessHome,
        catalog: f.catalog,
        pendingPath: f.pendingPath,
        lock: new PluginProfileLock(join(f.profileDir, 'lock'), 200, 10),
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginRecoveryError)
      expect((failure as PluginRecoveryError).reason).toBe('pending-reconcile-failed')
      expect(existsSync(f.pendingPath)).toBe(true)
      expect(hostStarts).toEqual([])
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('disables every manageable plugin and clears pending', async () => {
    const f = await fixture()
    try {
      await writePluginPending(f.pendingPath, 'add', '@fixture/cli-runtime')
      await disableAllManageablePlugins({
        catalog: f.catalog,
        statePath: f.statePath,
        configPath: f.configPath,
        pendingPath: f.pendingPath,
      })
      expect(loadPluginState(f.statePath).state.disabled).toContain('@fixture/cli-runtime')
      expect(existsSync(f.pendingPath)).toBe(false)
      expect(JSON.parse(readFileSync(join(f.profileDir, 'package.json'), 'utf8'))).toMatchObject({
        dependencies: { '@fixture/cli-runtime': 'github:fixture/cli-runtime' },
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('resets Desktop management without deleting profile dependencies', async () => {
    const f = await fixture()
    try {
      await writePluginPending(f.pendingPath, 'remove', '@fixture/cli-runtime')
      await resetPluginManagement({
        harnessHome: f.harnessHome,
        catalog: f.catalog,
        statePath: f.statePath,
        configPath: f.configPath,
        pendingPath: f.pendingPath,
      })
      expect(loadPluginState(f.statePath).state).toEqual({ version: 2, disabled: [], profileManaged: [] })
      expect(existsSync(f.pendingPath)).toBe(false)
      expect(JSON.parse(readFileSync(join(f.profileDir, 'package.json'), 'utf8')).dependencies['@fixture/cli-runtime'])
        .toBe('github:fixture/cli-runtime')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
