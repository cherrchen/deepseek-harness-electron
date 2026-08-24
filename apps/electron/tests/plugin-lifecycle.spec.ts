import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { PluginLifecycleController } from '../src/plugin-lifecycle.ts'
import type { PluginCompositionBackend } from '../src/plugin-runtime-config.ts'
import type { ManagedPlugin } from '../src/runtime-plugins.ts'
import type { PluginInventoryProbe, PluginInventorySnapshot } from '../src/plugin-inventory-probe.ts'

const lifecycleProbeRoot = fileURLToPath(new URL('./fixtures/plugins/lifecycle-probe', import.meta.url))

const hostOnlyPlugin: ManagedPlugin = {
  name: '@dsh-electron/dsh-plugin-host-only',
  directoryName: 'dsh-plugin-host-only',
  rootPath: lifecycleProbeRoot,
  hasClient: false,
  source: 'ecosystem',
  manageable: true,
  required: false,
}

const clientPlugin: ManagedPlugin = {
  name: '@dsh-electron/dsh-plugin-client',
  directoryName: 'dsh-plugin-client',
  rootPath: lifecycleProbeRoot,
  hasClient: true,
  source: 'ecosystem',
  manageable: true,
  required: false,
}

const requiredPlugin: ManagedPlugin = {
  name: '@dsh-electron/dsh-electron-desktop-capabilities',
  directoryName: 'desktop-capabilities',
  rootPath: lifecycleProbeRoot,
  hasClient: true,
  source: 'desktop-runtime',
  manageable: false,
  required: true,
}

class FakeBackend implements PluginCompositionBackend {
  readonly applied: string[][] = []

  async apply(roster: readonly ManagedPlugin[]): Promise<void> {
    this.applied.push(roster.map(plugin => plugin.name))
  }
}

class FakeInventory implements PluginInventoryProbe {
  constructor(readonly snapshots: PluginInventorySnapshot[]) {}
  private index = 0

  async list(): Promise<PluginInventorySnapshot> {
    const snapshot = this.snapshots[Math.min(this.index, this.snapshots.length - 1)]
    this.index += 1
    if (snapshot === undefined) throw new Error('fake inventory exhausted')
    return snapshot
  }

  async dispose(): Promise<void> {}
}

function active(name: string): PluginInventorySnapshot {
  return { entries: [{ entryId: `${name}-id`, moduleName: name, enabled: true, fiberPhase: 'active' }] }
}

function absent(): PluginInventorySnapshot {
  return { entries: [] }
}

function failed(name: string): PluginInventorySnapshot {
  return { entries: [{ entryId: `${name}-id`, moduleName: name, enabled: true, fiberPhase: 'failed' }] }
}

describe('plugin lifecycle controller', () => {
  it('enables a plugin, persists state after settle, and skips renderer refresh for Host-only plugins', async () => {
    const backend = new FakeBackend()
    const refresh = vi.fn(async () => {})
    const ensureReady = vi.fn(() => {})
    const controller = new PluginLifecycleController(
      [hostOnlyPlugin],
      { version: 1, disabled: [hostOnlyPlugin.name] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([absent(), active(hostOnlyPlugin.name)]),
      ensureReady,
      refresh,
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await controller.enable(hostOnlyPlugin.name)
    expect(backend.applied).toEqual([[hostOnlyPlugin.name]])
    expect(ensureReady).toHaveBeenCalledWith(hostOnlyPlugin)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('disables a client plugin and refreshes the renderer after Host settle', async () => {
    const backend = new FakeBackend()
    const refresh = vi.fn(async () => {})
    const controller = new PluginLifecycleController(
      [clientPlugin],
      { version: 1, disabled: [] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([active(clientPlugin.name), absent()]),
      () => {},
      refresh,
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await controller.disable(clientPlugin.name)
    expect(backend.applied).toEqual([[]])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reloads by removing, waiting absent, restoring, then waiting active', async () => {
    const backend = new FakeBackend()
    const refresh = vi.fn(async () => {})
    const controller = new PluginLifecycleController(
      [clientPlugin],
      { version: 1, disabled: [] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([absent(), active(clientPlugin.name)]),
      () => {},
      refresh,
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await controller.reload(clientPlugin.name)
    expect(backend.applied).toEqual([[], [clientPlugin.name]])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('rejects unknown or unmanageable plugins', async () => {
    const controller = new PluginLifecycleController(
      [requiredPlugin],
      { version: 1, disabled: [] },
      '/tmp/plugin-state.json',
      new FakeBackend(),
      new FakeInventory([active(requiredPlugin.name)]),
      () => {},
      async () => {},
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await expect(controller.enable('@missing/plugin')).rejects.toThrow(/unknown bundled plugin/)
    await expect(controller.disable(requiredPlugin.name)).rejects.toThrow(/cannot be managed/)
  })

  it('fails fast on a failed fiber and rolls back the previous roster', async () => {
    const backend = new FakeBackend()
    const controller = new PluginLifecycleController(
      [clientPlugin],
      { version: 1, disabled: [clientPlugin.name] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([failed(clientPlugin.name), absent()]),
      () => {},
      async () => {},
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await expect(controller.enable(clientPlugin.name)).rejects.toThrow(/entered failed state/)
    expect(backend.applied).toEqual([[clientPlugin.name], []])
  })

  it('rejects a plugin whose packaged artifact is incomplete', async () => {
    const plugin: ManagedPlugin = {
      ...hostOnlyPlugin,
      rootPath: '/tmp/dsh-electron-missing-plugin-artifact',
    }
    const controller = new PluginLifecycleController(
      [plugin],
      { version: 1, disabled: [plugin.name] },
      '/tmp/plugin-state.json',
      new FakeBackend(),
      new FakeInventory([absent()]),
      () => {},
      async () => {},
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await expect(controller.enable(plugin.name)).rejects.toThrow(/missing package.json/)
  })

  it('times out when inventory never reaches the target state and rolls back', async () => {
    const backend = new FakeBackend()
    const controller = new PluginLifecycleController(
      [hostOnlyPlugin],
      { version: 1, disabled: [hostOnlyPlugin.name] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([absent()]),
      () => {},
      async () => {},
      { timeoutMs: 20, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    await expect(controller.enable(hostOnlyPlugin.name)).rejects.toThrow(/timed out/)
    expect(backend.applied).toEqual([[hostOnlyPlugin.name], []])
  })

  it('serializes lifecycle operations on one queue', async () => {
    let release = Promise.resolve()
    const apply = vi.fn(async (roster: readonly ManagedPlugin[]) => {
      if (roster.some(plugin => plugin.name === clientPlugin.name)) await release
    })
    const backend: PluginCompositionBackend = { apply }
    let unblock!: () => void
    release = new Promise<void>((resolve) => { unblock = resolve })
    const controller = new PluginLifecycleController(
      [clientPlugin],
      { version: 1, disabled: [clientPlugin.name] },
      '/tmp/plugin-state.json',
      backend,
      new FakeInventory([active(clientPlugin.name), absent()]),
      () => {},
      async () => {},
      { timeoutMs: 500, pollIntervalMs: 0, hmrQuietMs: 0 },
    )
    const enabling = controller.enable(clientPlugin.name)
    const disabling = controller.disable(clientPlugin.name)
    unblock()
    await enabling
    await disabling
    expect(apply.mock.calls.map(([roster]) => roster.map(plugin => plugin.name)))
      .toEqual([[clientPlugin.name], []])
  })
})
