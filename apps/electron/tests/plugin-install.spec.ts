import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { normalizePluginInstallRequest, PluginInstallError } from '../src/plugin-install-contract.ts'
import { preparePluginPackageManager, resolveBundledPnpmBin } from '../src/plugin-package-manager.ts'
import { PluginPackageService } from '../src/plugin-install.ts'
import { PluginMutationCoordinator } from '../src/plugin-mutation.ts'
import type { PluginLifecycleController } from '../src/plugin-lifecycle.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('plugin install request normalization', () => {
  it.each([
    [{ source: 'registry', packageName: 'dsh-plugin-demo' }, 'dsh-plugin-demo@latest'],
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
      const windowsShim = readFileSync(join(windows.binDirectory, 'pnpm.cmd'), 'utf8')
      expect(windowsShim).toContain('ELECTRON_RUN_AS_NODE=1')
      expect(windowsShim).toContain('"C:\\Program Files\\DeepSeek Harness.exe"')
      expect(windowsShim).toContain(' %*')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refreshes a copied local package with the pinned pnpm and paths containing spaces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh electron local refresh-'))
    const source = join(root, 'source plugin')
    const profile = join(root, 'web profile')
    mkdirSync(source, { recursive: true })
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ private: true }), 'utf8')
    const writeSource = (version: string): void => {
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@fixture/local-refresh', version, main: 'index.js' }), 'utf8')
      writeFileSync(join(source, 'index.js'), `export const version = '${version}'\n`, 'utf8')
    }
    const pnpmBin = resolveBundledPnpmBin(electronRoot)
    const refresh = (): ReturnType<typeof spawnSync> => spawnSync(
      process.execPath,
      [pnpmBin, 'add', `file:${source}`, '--force', '--ignore-scripts'],
      { cwd: profile, encoding: 'utf8', env: { ...process.env, CI: 'true' } },
    )
    try {
      writeSource('1.0.0')
      const initial = refresh()
      if (initial.status !== 0) throw new Error(`pinned pnpm local install failed:\n${initial.stderr}${initial.stdout}`)
      writeSource('2.0.0')
      const result = refresh()
      expect(result.stderr).not.toContain('ERR_')
      expect(result.status).toBe(0)
      expect(JSON.parse(readFileSync(join(profile, 'node_modules', '@fixture', 'local-refresh', 'package.json'), 'utf8')))
        .toMatchObject({ version: '2.0.0' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})

describe('plugin package service', () => {
  it('rejects a reserved Registry package before running pnpm', async () => {
    const packageName = '@dsh-electron/dsh-client-ui-details-host'
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    const service = new PluginPackageService(
      '/unused/profile',
      '/unused/state.json',
      runner,
      {} as PluginLifecycleController,
      new PluginMutationCoordinator(),
      new Set([packageName]),
    )
    const failure = await service.install({ source: 'registry', packageName }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginInstallError)
    if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
    expect(failure.code).toBe('package-conflict')
    expect(runner).not.toHaveBeenCalled()
  })

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
      writeFileSync(join(packageRoot, 'index.js'), '', 'utf8')
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

  it('names the blocked dependency and reports a profile change left by failed pnpm', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-partial-install-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    mkdirSync(profileDir, { recursive: true })
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    const runner = vi.fn(async () => {
      writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-context': 'github:owner/context' } }), 'utf8')
      return {
        exitCode: 1,
        stdout: '',
        stderr: '[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: node-pty@1.1.0\nRun "pnpm approve-builds"',
      }
    })
    const lifecycle = {} as PluginLifecycleController
    try {
      const service = new PluginPackageService(profileDir, statePath, runner, lifecycle, new PluginMutationCoordinator())
      const failure = await service.install({ source: 'git', repository: 'owner/context' }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginInstallError)
      if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
      expect(failure.code).toBe('build-script-blocked')
      expect(failure.profileChanged).toBe(true)
      expect(failure.message).toContain('node-pty@1.1.0')
      expect(failure.message).toContain('dsh-context')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not attribute an ordinary prepare failure to pnpm build approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-prepare-failure-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    try {
      const service = new PluginPackageService(
        profileDir,
        statePath,
        async () => ({ exitCode: 1, stdout: '', stderr: 'prepare script failed: TypeScript compilation error' }),
        {} as PluginLifecycleController,
        new PluginMutationCoordinator(),
      )
      const failure = await service.install({ source: 'git', repository: 'owner/context' }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginInstallError)
      if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
      expect(failure.code).toBe('package-manager-failed')
      expect(failure.profileChanged).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('identifies an unchanged Git dependency when retrying the same source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-git-retry-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    const packageRoot = join(profileDir, 'node_modules', 'dsh-context')
    mkdirSync(packageRoot, { recursive: true })
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-context': 'github:owner/context' } }), 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      name: 'dsh-context', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }), 'utf8')
    writeFileSync(join(packageRoot, 'cordis.patch.yml'), '[]\n', 'utf8')
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    const lifecycle = {} as PluginLifecycleController
    try {
      const service = new PluginPackageService(
        profileDir,
        statePath,
        async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        lifecycle,
        new PluginMutationCoordinator(),
      )
      await expect(service.install({ source: 'git', repository: 'owner/context' })).resolves.toMatchObject({
        name: 'dsh-context', kind: 'bundle', activation: 'restart-required',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a bundle whose declared Host entry is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-invalid-bundle-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    const packageRoot = join(profileDir, 'node_modules', 'dsh-context')
    mkdirSync(packageRoot, { recursive: true })
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      name: 'dsh-context', version: '1.0.0', main: 'lib/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }), 'utf8')
    writeFileSync(join(packageRoot, 'cordis.patch.yml'), '[]\n', 'utf8')
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    const lifecycle = {} as PluginLifecycleController
    try {
      const service = new PluginPackageService(
        profileDir,
        statePath,
        async () => {
          writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-context': 'github:owner/context' } }), 'utf8')
          return { exitCode: 0, stdout: '', stderr: '' }
        },
        lifecycle,
        new PluginMutationCoordinator(),
      )
      const failure = await service.install({ source: 'git', repository: 'owner/context' }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginInstallError)
      if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
      expect(failure.code).toBe('invalid-package')
      expect(failure.details).toContain('lib/index.js')
      expect(failure.profileChanged).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a runtime plugin whose Git installation omitted its declared build output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-invalid-runtime-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    const packageRoot = join(profileDir, 'node_modules', '@fixture', 'broken-runtime')
    mkdirSync(packageRoot, { recursive: true })
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      name: '@fixture/broken-runtime',
      version: '0.1.0',
      main: 'lib/index.js',
      exports: { '.': './lib/index.js', './client': './lib/client.js' },
      dsh: { client: { platform: 'web' } },
    }), 'utf8')
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    try {
      const service = new PluginPackageService(
        profileDir,
        statePath,
        async () => {
          writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
            dependencies: { '@fixture/broken-runtime': 'github:fixture/broken-runtime' },
          }), 'utf8')
          return { exitCode: 0, stdout: '', stderr: '' }
        },
        {} as PluginLifecycleController,
        new PluginMutationCoordinator(),
      )
      const failure = await service.install({
        source: 'git', repository: 'fixture/broken-runtime',
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginInstallError)
      if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
      expect(failure.code).toBe('invalid-package')
      expect(failure.details).toBe('declared Host entry does not exist: ./lib/index.js')
      expect(failure.profileChanged).toBe(true)
      expect(JSON.parse(readFileSync(statePath, 'utf8'))).toMatchObject({ profileManaged: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes a newly installed Git package that would shadow a Desktop-owned plugin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-package-conflict-'))
    const profileDir = join(root, 'profiles', 'web')
    const statePath = join(root, 'electron', 'plugin-state.json')
    const packageName = '@dsh-electron/dsh-client-ui-details-host'
    const packageRoot = join(profileDir, 'node_modules', '@dsh-electron', 'dsh-client-ui-details-host')
    mkdirSync(profileDir, { recursive: true })
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
    writeFileSync(statePath, JSON.stringify({ version: 2, disabled: [], profileManaged: [] }), 'utf8')
    const runner = vi.fn(async (command: { kind: string }) => {
      if (command.kind === 'add') {
        mkdirSync(join(packageRoot, 'lib'), { recursive: true })
        writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
          dependencies: { [packageName]: 'github:cherrchen/dsh-client-ui-details-host' },
        }), 'utf8')
        writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
          name: packageName, version: '0.1.0', main: 'lib/index.js',
        }), 'utf8')
        writeFileSync(join(packageRoot, 'lib', 'index.js'), '', 'utf8')
      } else {
        writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }), 'utf8')
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    try {
      const service = new PluginPackageService(
        profileDir,
        statePath,
        runner,
        {} as PluginLifecycleController,
        new PluginMutationCoordinator(),
        new Set([packageName]),
      )
      const failure = await service.install({
        source: 'git', repository: 'cherrchen/dsh-client-ui-details-host',
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginInstallError)
      if (!(failure instanceof PluginInstallError)) throw new Error('expected PluginInstallError')
      expect(failure.code).toBe('package-conflict')
      expect(failure.profileChanged).toBe(false)
      expect(runner.mock.calls).toEqual([
        [{ kind: 'add', spec: 'github:cherrchen/dsh-client-ui-details-host' }],
        [{ kind: 'remove', name: packageName }],
      ])
      expect(JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))).toEqual({ dependencies: {} })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
