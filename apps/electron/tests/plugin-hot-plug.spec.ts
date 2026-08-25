import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { stopHarness } from '../src/harness/process.ts'
import { HttpHarnessTransport } from '../src/harness/transport.ts'
import { PluginLifecycleController } from '../src/plugin-lifecycle.ts'
import { PluginPackageService } from '../src/plugin-install.ts'
import { PluginMutationCoordinator } from '../src/plugin-mutation.ts'
import { RemotePluginInventoryProbe } from '../src/plugin-inventory-probe.ts'
import { DynamicIncludeCompositionBackend, effectivePluginRoster } from '../src/plugin-runtime-config.ts'
import { savePluginState, type PluginState } from '../src/plugin-state.ts'
import { prepareHostRuntimeOverlay } from '../src/runtime-overlay.ts'
import {
  discoverManageablePlugins,
  ensureRuntimePluginsLinked,
  ensureSymlink,
  profileModuleLinkPath,
  pluginRuntimeModuleLinkPath,
  validateRuntimePlugin,
  type ManagedPlugin,
} from '../src/runtime-plugins.ts'
import { harnessArguments, parseHarnessReadyUrl, resolveDshBin } from '../src/runtime.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))
const lifecycleProbeRoot = join(electronRoot, 'tests', 'fixtures', 'plugins', 'lifecycle-probe')

type HarnessProcess = ChildProcessByStdio<null, Readable, Readable>

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    await cleanup.pop()?.()
  }
})

async function startHarnessForPlugins(
  plugins: readonly ManagedPlugin[],
  state: PluginState,
  env: Record<string, string> = {},
  mutations = new PluginMutationCoordinator(),
): Promise<{
  child: HarnessProcess
  controller: PluginLifecycleController
  probe: RemotePluginInventoryProbe
  logs: { stdout: string; stderr: string }
  harnessHome: string
  pluginStatePath: string
}> {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-electron-hot-plug-'))
  const harnessHome = join(scratch, 'harness-home')
  const userData = join(scratch, 'user-data')
  ensureRuntimePluginsLinked(electronRoot, harnessHome)
  for (const plugin of plugins) {
    validateRuntimePlugin(plugin)
    ensureSymlink(profileModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
    ensureSymlink(pluginRuntimeModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
  }
  const overlay = await prepareHostRuntimeOverlay(electronRoot, userData, harnessHome)
  const backend = new DynamicIncludeCompositionBackend(overlay.pluginConfigPath)
  await backend.apply(effectivePluginRoster(plugins, state))
  await savePluginState(overlay.pluginStatePath, state)
  const child = spawn(process.execPath, harnessArguments(resolveDshBin(electronRoot), overlay.patchPath), {
    cwd: scratch,
    env: {
      ...process.env,
      ...env,
      DSH_HOME: harnessHome,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = { stdout: '', stderr: '' }
  child.stdout.on('data', (chunk: Buffer) => {
    logs.stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk: Buffer) => {
    logs.stderr += chunk.toString('utf8')
  })
  const url = await waitForHarnessUrl(child)
  const transport = new HttpHarnessTransport()
  await transport.start(url)
  const probe = new RemotePluginInventoryProbe(transport)
  const controller = new PluginLifecycleController(
    plugins,
    state,
    overlay.pluginStatePath,
    backend,
    probe,
    (plugin) => {
      ensureSymlink(profileModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
      ensureSymlink(pluginRuntimeModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
    },
    async () => {},
    { timeoutMs: 20_000, pollIntervalMs: 100, hmrQuietMs: 250 },
    mutations,
  )
  cleanup.push(async () => {
    await probe.dispose()
    await transport.stop()
    await stopHarness(child)
    await rm(scratch, { recursive: true, force: true })
  })
  return { child, controller, probe, logs, harnessHome, pluginStatePath: overlay.pluginStatePath }
}

async function waitForHarnessUrl(child: HarnessProcess): Promise<string> {
  return await new Promise((resolve, reject) => {
    let output = ''
    let errorOutput = ''
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(new Error(
        `Harness exited before readiness (code ${String(code)}, signal ${String(signal)})\nstdout:\n${output}\nstderr:\n${errorOutput}`,
      ))
    })
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const url = parseHarnessReadyUrl(output)
      if (url !== undefined) resolve(url)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8')
    })
  })
}

async function waitForProbeLog(path: string, expected: string[]): Promise<void> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean) : []
    if (expected.every((line, index) => current[index] === line)) return
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for lifecycle log ${JSON.stringify(expected)}; got ${JSON.stringify(current)}`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function waitForInventoryState(
  probe: RemotePluginInventoryProbe,
  name: string,
  state: 'active' | 'absent',
): Promise<void> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const snapshot = await probe.list()
    const current = snapshot.entries.find(entry => entry.moduleName === name || entry.entryId.endsWith(`:${name}`))?.fiberPhase ?? 'absent'
    if (current === state) return
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${JSON.stringify(name)} to reach ${state}; got ${current}`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

describe('runtime plugin hot plug', () => {
  it('refreshes and removes a copied local runtime package without changing the Host PID', { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-package-probe-'))
    cleanup.push(async () => { await rm(root, { recursive: true, force: true }) })
    const name = '@dsh-electron/dsh-plugin-lifecycle-probe'
    const logPath = join(root, 'probe.log')
    const writeVersion = (version: string): void => {
      mkdirSync(join(root, 'lib'), { recursive: true })
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version, type: 'module', main: './lib/index.js' }), 'utf8')
      writeFileSync(join(root, 'lib', 'index.js'), `
import { appendFileSync } from 'node:fs'
export function apply(ctx) {
  appendFileSync(process.env.DSH_ELECTRON_LIFECYCLE_PROBE_LOG, 'APPLY_${version}\\n', 'utf8')
  ctx.effect(() => () => appendFileSync(process.env.DSH_ELECTRON_LIFECYCLE_PROBE_LOG, 'DISPOSE_${version}\\n', 'utf8'))
}
`, 'utf8')
    }
    writeVersion('1.0.0')
    const plugin: ManagedPlugin = {
      name,
      version: '1.0.0',
      directoryName: 'lifecycle-probe',
      rootPath: root,
      hasClient: false,
      ownership: 'profile',
      kind: 'runtime-plugin',
      installSource: 'local',
      requestedSpec: `file:${root}`,
      activationMode: 'hot',
      health: 'healthy',
      packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
      manageable: true,
      required: false,
    }
    const mutations = new PluginMutationCoordinator()
    const started = await startHarnessForPlugins(
      [plugin],
      { version: 2, disabled: [], profileManaged: [name] },
      { DSH_ELECTRON_LIFECYCLE_PROBE_LOG: logPath },
      mutations,
    )
    const profileDir = join(started.harnessHome, 'profiles', 'web')
    mkdirSync(profileDir, { recursive: true })
    ensureSymlink(join(profileDir, 'node_modules', ...name.split('/')), root)
    const writeDependencies = (present: boolean): void => {
      writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
        dependencies: present ? { [name]: `file:${root}` } : {},
      }), 'utf8')
    }
    writeDependencies(true)
    const catalog = {
      list: async (): Promise<ManagedPlugin[]> => {
        const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as { dependencies?: object }
        if (!(name in (manifest.dependencies ?? {}))) return []
        const installed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
        return [{ ...plugin, version: installed.version }]
      },
    }
    const service = new PluginPackageService(
      profileDir,
      started.pluginStatePath,
      async (command) => {
        if (command.kind === 'remove') writeDependencies(false)
        else writeVersion('2.0.0')
        return { exitCode: 0, stdout: '', stderr: '' }
      },
      started.controller,
      mutations,
      new Set(),
      catalog,
    )
    await waitForProbeLog(logPath, ['APPLY_1.0.0'])
    const pid = started.child.pid

    try {
      await service.update(name)
    } catch (error) {
      const failure = error as Error & { details?: string }
      const inventory = await started.probe.list()
      const lifecycleLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
      throw new Error(`${failure.message}\n${failure.details ?? ''}\ninventory:\n${JSON.stringify(inventory)}\nlog:\n${lifecycleLog}\nstdout:\n${started.logs.stdout}\nstderr:\n${started.logs.stderr}`)
    }
    await waitForProbeLog(logPath, ['APPLY_1.0.0', 'DISPOSE_1.0.0', 'APPLY_2.0.0'])
    expect(started.child.pid).toBe(pid)

    await service.remove(name)
    await waitForInventoryState(started.probe, name, 'absent')
    expect(started.child.pid).toBe(pid)
  })

  it('hot-disables, hot-enables, and hot-reloads a fixture plugin without changing the Host PID', { timeout: 30_000 }, async () => {
    const plugin: ManagedPlugin = {
      name: '@dsh-electron/dsh-plugin-lifecycle-probe',
      version: '0.0.0',
      description: 'Lifecycle integration probe',
      directoryName: 'lifecycle-probe',
      rootPath: lifecycleProbeRoot,
      hasClient: false,
      ownership: 'bundled', kind: 'runtime-plugin', installSource: 'bundled', activationMode: 'hot', health: 'healthy', packageActions: { checkUpdates: false, update: false, reinstall: false, remove: false },
      manageable: true,
      required: false,
    }
    const logPath = join(await mkdtemp(join(tmpdir(), 'dsh-electron-probe-log-')), 'probe.log')
    cleanup.push(async () => { await rm(join(logPath, '..'), { recursive: true, force: true }) })
    const { child, controller, probe, logs } = await startHarnessForPlugins(
      [plugin],
      { version: 2, disabled: [], profileManaged: [] },
      { DSH_ELECTRON_LIFECYCLE_PROBE_LOG: logPath },
    )
    expect(child.pid).toBeTypeOf('number')
    await waitForInventoryState(probe, plugin.name, 'active')
    await waitForProbeLog(logPath, ['APPLY'])

    const pid = child.pid
    await controller.disable(plugin.name)
    await waitForInventoryState(probe, plugin.name, 'absent')
    await waitForProbeLog(logPath, ['APPLY', 'DISPOSE'])
    expect(child.pid).toBe(pid)

    try {
      await controller.enable(plugin.name)
    } catch (error) {
      throw new Error(`${String(error)}\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`)
    }
    await waitForInventoryState(probe, plugin.name, 'active')
    await waitForProbeLog(logPath, ['APPLY', 'DISPOSE', 'APPLY'])
    expect(child.pid).toBe(pid)

    await controller.reload(plugin.name)
    await waitForInventoryState(probe, plugin.name, 'active')
    await waitForProbeLog(logPath, ['APPLY', 'DISPOSE', 'APPLY', 'DISPOSE', 'APPLY'])
    expect(child.pid).toBe(pid)
  })

  it('hot-disables, hot-enables, and hot-reloads the bundled Git plugin', { timeout: 30_000 }, async () => {
    const plugin = discoverManageablePlugins(electronRoot)
      .find(candidate => candidate.name === '@dsh-electron/dsh-plugin-git')
    if (plugin === undefined) throw new Error('bundled Git plugin is missing from ecosystem inventory')
    const { controller, probe, logs } = await startHarnessForPlugins(
      [plugin],
      { version: 2, disabled: [], profileManaged: [] },
    )

    await waitForInventoryState(probe, plugin.name, 'active')
    await controller.disable(plugin.name)
    await waitForInventoryState(probe, plugin.name, 'absent')
    await controller.enable(plugin.name)
    await waitForInventoryState(probe, plugin.name, 'active')
    try {
      await controller.reload(plugin.name)
    } catch (error) {
      throw new Error(`${String(error)}\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`)
    }
    await waitForInventoryState(probe, plugin.name, 'active')
  })
})
