import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { normalizePluginInstallRequest, PluginInstallError } from '../src/plugin-install-contract.ts'
import { preparePluginPackageManager } from '../src/plugin-package-manager.ts'
import { PluginPackageService } from '../src/plugin-install.ts'
import { PluginMutationCoordinator } from '../src/plugin-mutation.ts'
import type { PluginLifecycleController } from '../src/plugin-lifecycle.ts'

describe('plugin install request normalization', () => {
  it.each([
    [{ source: 'registry', packageName: 'dsh-plugin-demo' }, 'dsh-plugin-demo'],
    [{ source: 'registry', packageName: '@scope/dsh-plugin-demo', version: 'beta' }, '@scope/dsh-plugin-demo@beta'],
    [{ source: 'git', repository: 'owner/repository', ref: 'v1.0.0' }, 'github:owner/repository#v1.0.0'],
    [{ source: 'git', repository: 'https://github.com/owner/repository.git' }, 'github:owner/repository'],
    [{ source: 'git', repository: 'git+ssh://git@github.com/owner/repository.git' }, 'git+ssh://git@github.com/owner/repository.git'],
    [{ source: 'local', path: '/path with spaces/plugin', mode: 'file' }, 'file:/path with spaces/plugin'],
    [{ source: 'local', path: 'C:\\Path With Spaces\\plugin', mode: 'link' }, 'link:C:\\Path With Spaces\\plugin'],
  ] as const)('normalizes %j', (request, expected) => {
    expect(normalizePluginInstallRequest(request).spec).toBe(expected)
  })

  it.each([
    { source: 'registry', packageName: '../plugin' },
    { source: 'git', repository: 'https://example.com/plugin' },
    { source: 'local', path: 'relative/plugin', mode: 'file' },
  ])('rejects invalid request %j', (request) => {
    expect(() => normalizePluginInstallRequest(request)).toThrow(PluginInstallError)
  })
})

describe('bundled plugin package manager', () => {
  it('creates POSIX and Windows shims without relying on the ambient pnpm', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-pnpm-'))
    const pnpmBin = join(root, 'app', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    mkdirSync(join(pnpmBin, '..'), { recursive: true })
    writeFileSync(pnpmBin, '', 'utf8')
    try {
      const posix = preparePluginPackageManager(root, '/Applications/DeepSeek Harness', pnpmBin, '/usr/bin', 'darwin')
      expect(posix.envPath.startsWith(posix.binDirectory)).toBe(true)
      expect(readFileSync(join(posix.binDirectory, 'pnpm'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE=1 exec')
      const windows = preparePluginPackageManager(root, 'C:\\Program Files\\DeepSeek Harness.exe', pnpmBin, 'C:\\Windows', 'win32')
      expect(readFileSync(join(windows.binDirectory, 'pnpm.cmd'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE=1')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('plugin package service', () => {
  it('records the real installed package and hot-activates a runtime plugin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-install-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    const activateInstalled = vi.fn(async () => {})
    const lifecycle = { activateInstalled } as unknown as PluginLifecycleController
    const runner = vi.fn(async () => {
      writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { '@fixture/plugin': 'file:../../../fixture' } }), 'utf8')
      const packageRoot = join(profileDir, 'node_modules', '@fixture', 'plugin')
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: '@fixture/plugin', version: '1.2.3', main: 'index.js' }), 'utf8')
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    try {
      const service = new PluginPackageService(profileDir, statePath, runner, lifecycle, new PluginMutationCoordinator())
      await expect(service.install({ source: 'local', path: root, mode: 'file' })).resolves.toEqual({
        name: '@fixture/plugin', version: '1.2.3', kind: 'runtime-plugin', activation: 'activated', source: 'local',
      })
      expect(activateInstalled).toHaveBeenCalledWith('@fixture/plugin')
      expect(JSON.parse(readFileSync(statePath, 'utf8'))).toMatchObject({ profileManaged: ['@fixture/plugin'] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
