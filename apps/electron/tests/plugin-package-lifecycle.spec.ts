import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PluginPackageService } from '../src/plugin-install.ts'
import { PluginMutationCoordinator } from '../src/plugin-mutation.ts'
import { PluginPackageError } from '../src/plugin-package-contract.ts'
import type { PluginLifecycleController, PluginQuiesceToken } from '../src/plugin-lifecycle.ts'
import type { ManagedPlugin } from '../src/runtime-plugins.ts'
import type { PluginCatalog } from '../src/plugin-catalog.ts'

const actions = { checkUpdates: true, update: 'registry', reinstall: true, remove: true } as const

function managed(rootPath: string, version: string): ManagedPlugin {
  return {
    name: '@fixture/plugin',
    version,
    directoryName: 'plugin',
    rootPath,
    hasClient: true,
    ownership: 'profile',
    kind: 'runtime-plugin',
    installSource: 'registry',
    requestedSpec: '^1.0.0',
    manageable: true,
    required: false,
    activationMode: 'hot',
    health: 'healthy',
    packageActions: actions,
  }
}

function writeKind(packageRoot: string, kind: ManagedPlugin['kind'], version: string): void {
  const manifest = kind === 'runtime-plugin'
    ? { name: '@fixture/plugin', version, main: 'index.js' }
    : kind === 'bundle'
      ? { name: '@fixture/plugin', version, dsh: { bundle: { patch: './cordis.patch.yml' } } }
      : { name: '@fixture/plugin', version }
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(manifest), 'utf8')
  if (kind === 'runtime-plugin') writeFileSync(join(packageRoot, 'index.js'), '', 'utf8')
  if (kind === 'bundle') writeFileSync(join(packageRoot, 'cordis.patch.yml'), '[]\n', 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-electron-package-lifecycle-'))
  const profileDir = join(root, 'profile')
  const packageRoot = join(profileDir, 'node_modules', '@fixture', 'plugin')
  const statePath = join(root, 'plugin-state.json')
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { '@fixture/plugin': '^1.0.0' } }), 'utf8')
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: '@fixture/plugin', version: '1.0.0', main: 'index.js' }), 'utf8')
  writeFileSync(join(packageRoot, 'index.js'), '', 'utf8')
  writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: ['@fixture/plugin'] }), 'utf8')
  let entries = [managed(packageRoot, '1.0.0')]
  const catalog: PluginCatalog = { list: async () => entries }
  const token: PluginQuiesceToken = { name: '@fixture/plugin', wasActive: true, hasClient: true }
  const lifecycleSpies = {
    quiesce: vi.fn(async () => token),
    restore: vi.fn(async () => {}),
    activate: vi.fn(async () => {}),
    refreshAfterRemoval: vi.fn(async () => {}),
  }
  const lifecycle = {
    quiesceForPackageMutation: lifecycleSpies.quiesce,
    restoreAfterPackageMutation: lifecycleSpies.restore,
    activateAfterPackageMutation: lifecycleSpies.activate,
    refreshAfterPackageRemoval: lifecycleSpies.refreshAfterRemoval,
  } as unknown as PluginLifecycleController
  return {
    root,
    profileDir,
    packageRoot,
    statePath,
    catalog,
    lifecycle,
    lifecycleSpies,
    setVersion(version: string) {
      writeKind(packageRoot, 'runtime-plugin', version)
      entries = [managed(packageRoot, version)]
    },
    setCatalogKind(kind: ManagedPlugin['kind']) {
      const current = managed(packageRoot, '1.0.0')
      current.kind = kind
      current.activationMode = kind === 'runtime-plugin' ? 'hot' : kind === 'bundle' ? 'profile-restart' : 'none'
      current.manageable = kind === 'runtime-plugin'
      entries = [current]
      writeKind(packageRoot, kind, '1.0.0')
    },
    removeDependency() {
      writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
      entries = []
    },
  }
}

describe('plugin package lifecycle', () => {
  it('filters update results to Registry profile packages and surfaces registry diagnostics', async () => {
    const f = await fixture()
    const mixedCatalog: PluginCatalog = { list: async () => [
      managed(f.packageRoot, '1.0.0'),
      { ...managed(f.packageRoot, '1.0.0'), name: '@fixture/git', installSource: 'git', requestedSpec: 'github:fixture/git', packageActions: { ...actions, checkUpdates: false, update: 'source-refresh' } },
      { ...managed(f.packageRoot, '1.0.0'), name: '@fixture/local', installSource: 'local', requestedSpec: 'file:/fixture/local', packageActions: { ...actions, checkUpdates: false, update: 'source-refresh' } },
    ] }
    try {
      const service = new PluginPackageService(
        f.profileDir,
        f.statePath,
        async () => ({
          exitCode: 1,
          stdout: JSON.stringify({
            '@fixture/plugin': { current: '1.0.0', wanted: '1.1.0', latest: '2.0.0' },
            '@fixture/git': { current: '1.0.0', wanted: '1.2.0', latest: '1.2.0' },
          }),
          stderr: '',
        }),
        f.lifecycle,
        new PluginMutationCoordinator(),
        new Set(),
        mixedCatalog,
      )
      await expect(service.checkUpdates()).resolves.toEqual([{
        name: '@fixture/plugin', currentVersion: '1.0.0', wantedVersion: '1.1.0', latestVersion: '2.0.0', updateAvailable: true,
      }])

      const failed = new PluginPackageService(
        f.profileDir,
        f.statePath,
        async () => ({ exitCode: 1, stdout: '', stderr: 'ERR_PNPM_FETCH_401 private registry authentication failed' }),
        f.lifecycle,
        new PluginMutationCoordinator(),
        new Set(),
        mixedCatalog,
      )
      const failure = await failed.checkUpdates().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginPackageError)
      expect((failure as PluginPackageError).details).toContain('authentication failed')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('quiesces before update and activates the newly inspected runtime package', async () => {
    const f = await fixture()
    const order: string[] = []
    f.lifecycleSpies.quiesce.mockImplementation(async () => {
      order.push('quiesce')
      return { name: '@fixture/plugin', wasActive: true, hasClient: true }
    })
    const runner = vi.fn(async () => {
      order.push('update')
      f.setVersion('1.1.0')
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    try {
      const service = new PluginPackageService(
        f.profileDir, f.statePath, runner, f.lifecycle, new PluginMutationCoordinator(), new Set(), f.catalog,
      )
      await expect(service.update('@fixture/plugin')).resolves.toMatchObject({
        name: '@fixture/plugin', operation: 'update', previousVersion: '1.0.0', version: '1.1.0', restartRequired: false,
      })
      expect(order).toEqual(['quiesce', 'update'])
      expect(f.lifecycleSpies.activate.mock.calls).toContainEqual(['@fixture/plugin'])
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('restores runtime after an unchanged failure but leaves a partially changed package unloaded', async () => {
    const unchanged = await fixture()
    try {
      const service = new PluginPackageService(
        unchanged.profileDir,
        unchanged.statePath,
        async () => ({ exitCode: 1, stdout: '', stderr: 'offline' }),
        unchanged.lifecycle,
        new PluginMutationCoordinator(),
        new Set(),
        unchanged.catalog,
      )
      const failure = await service.update('@fixture/plugin').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginPackageError)
      expect((failure as PluginPackageError).recovery).toBe('restored')
      expect(unchanged.lifecycleSpies.restore.mock.calls).toHaveLength(1)
    } finally {
      await rm(unchanged.root, { recursive: true, force: true })
    }

    const partial = await fixture()
    try {
      const service = new PluginPackageService(
        partial.profileDir,
        partial.statePath,
        async () => {
          partial.setVersion('1.1.0')
          return { exitCode: 1, stdout: '', stderr: 'prepare failed' }
        },
        partial.lifecycle,
        new PluginMutationCoordinator(),
        new Set(),
        partial.catalog,
      )
      const failure = await service.update('@fixture/plugin').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginPackageError)
      expect((failure as PluginPackageError).recovery).toBe('profile-changed')
      expect(partial.lifecycleSpies.restore.mock.calls).toHaveLength(0)
    } finally {
      await rm(partial.root, { recursive: true, force: true })
    }
  })

  it('removes profile state only after the dependency disappears', async () => {
    const f = await fixture()
    writeFileSync(f.statePath, JSON.stringify({ version: 2, disabled: ['@fixture/plugin'], profileManaged: ['@fixture/plugin'] }), 'utf8')
    try {
      const service = new PluginPackageService(
        f.profileDir,
        f.statePath,
        async () => {
          f.removeDependency()
          return { exitCode: 0, stdout: '', stderr: '' }
        },
        f.lifecycle,
        new PluginMutationCoordinator(),
        new Set(),
        f.catalog,
      )
      await expect(service.remove('@fixture/plugin')).resolves.toMatchObject({ operation: 'remove' })
      expect(JSON.parse(readFileSync(f.statePath, 'utf8'))).toMatchObject({ disabled: [], profileManaged: [] })
      expect(f.lifecycleSpies.refreshAfterRemoval.mock.calls).toContainEqual([true])
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('uses upstream update for Git and force-resolves copied local packages from their requested spec', async () => {
    for (const [requestedSpec, expected] of [
      ['github:fixture/plugin#main', { kind: 'update', name: '@fixture/plugin' }],
      ['file:/fixtures/plugin', { kind: 'add', spec: 'file:/fixtures/plugin', force: true }],
    ] as const) {
      const f = await fixture()
      const entries = await f.catalog.list()
      const current = entries[0]
      if (current === undefined) throw new Error('fixture plugin missing')
      Object.assign(current, {
        installSource: requestedSpec.startsWith('file:') ? 'local' : 'git',
        requestedSpec,
        packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
      })
      const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
      try {
        const service = new PluginPackageService(
          f.profileDir, f.statePath, runner, f.lifecycle, new PluginMutationCoordinator(), new Set(), f.catalog,
        )
        await service.update('@fixture/plugin')
        expect(runner.mock.calls).toContainEqual([expected])
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    }
  })

  it.each([
    ['runtime-plugin', 'runtime-plugin', true],
    ['runtime-plugin', 'bundle', false],
    ['runtime-plugin', 'dependency', false],
    ['bundle', 'bundle', false],
    ['bundle', 'runtime-plugin', false],
    ['bundle', 'dependency', false],
    ['dependency', 'runtime-plugin', true],
    ['dependency', 'bundle', false],
    ['dependency', 'dependency', false],
  ] as const)('applies the %s to %s transition policy', async (beforeKind, afterKind, activates) => {
    const f = await fixture()
    f.setCatalogKind(beforeKind)
    const runner = vi.fn(async () => {
      writeKind(f.packageRoot, afterKind, '2.0.0')
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    try {
      const service = new PluginPackageService(
        f.profileDir, f.statePath, runner, f.lifecycle, new PluginMutationCoordinator(), new Set(), f.catalog,
      )
      await expect(service.update('@fixture/plugin')).resolves.toMatchObject({ kind: afterKind, version: '2.0.0' })
      expect(f.lifecycleSpies.activate.mock.calls.length > 0).toBe(activates)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  it('does not run the package manager when runtime quiescing fails', async () => {
    const f = await fixture()
    f.lifecycleSpies.quiesce.mockRejectedValueOnce(new Error('Host unload timed out'))
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    try {
      const service = new PluginPackageService(
        f.profileDir, f.statePath, runner, f.lifecycle, new PluginMutationCoordinator(), new Set(), f.catalog,
      )
      const failure = await service.remove('@fixture/plugin').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginPackageError)
      expect((failure as PluginPackageError).code).toBe('runtime-quiesce-failed')
      expect(runner.mock.calls).toHaveLength(0)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
