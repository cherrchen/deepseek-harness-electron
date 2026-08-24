import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { stopHarness } from '../src/harness/process.ts'
import { HttpHarnessTransport } from '../src/harness/transport.ts'
import { PluginLifecycleController } from '../src/plugin-lifecycle.ts'
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
): Promise<{
  child: HarnessProcess
  controller: PluginLifecycleController
  probe: RemotePluginInventoryProbe
  logs: { stdout: string; stderr: string }
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
  )
  cleanup.push(async () => {
    await probe.dispose()
    await transport.stop()
    await stopHarness(child)
    await rm(scratch, { recursive: true, force: true })
  })
  return { child, controller, probe, logs }
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
    const current = snapshot.entries.find(entry => entry.moduleName === name)?.fiberPhase ?? 'absent'
    if (current === state) return
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${JSON.stringify(name)} to reach ${state}; got ${current}`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

describe('runtime plugin hot plug', () => {
  it('hot-disables, hot-enables, and hot-reloads a fixture plugin without changing the Host PID', { timeout: 30_000 }, async () => {
    const plugin: ManagedPlugin = {
      name: '@dsh-electron/dsh-plugin-lifecycle-probe',
      version: '0.0.0',
      description: 'Lifecycle integration probe',
      directoryName: 'lifecycle-probe',
      rootPath: lifecycleProbeRoot,
      hasClient: false,
      source: 'ecosystem',
      manageable: true,
      required: false,
    }
    const logPath = join(await mkdtemp(join(tmpdir(), 'dsh-electron-probe-log-')), 'probe.log')
    cleanup.push(async () => { await rm(join(logPath, '..'), { recursive: true, force: true }) })
    const { child, controller, probe, logs } = await startHarnessForPlugins(
      [plugin],
      { version: 1, disabled: [] },
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
      { version: 1, disabled: [] },
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
