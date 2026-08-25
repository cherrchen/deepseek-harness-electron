import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DesktopCapabilitiesContract,
  PluginLifecycleEntry,
  PluginLifecycleSnapshot,
} from '../runtime/plugins/desktop-capabilities/src/client/index.ts'
import { PluginManagerController } from '../runtime/plugins/ui-plugin-manager-electron/src/client/plugin-manager-controller.ts'

const PLUGIN = '@dsh-electron/dsh-plugin-git'

function entry(runtime: PluginLifecycleEntry['runtime'], desiredEnabled = true): PluginLifecycleEntry {
  return {
    name: PLUGIN,
    version: '0.2.0',
    description: 'Git integration',
    ownership: 'bundled', kind: 'runtime-plugin', installSource: 'bundled', activationMode: 'hot', health: 'healthy', packageActions: { checkUpdates: false, update: false, reinstall: false, remove: false },
    hasClient: true,
    manageable: true,
    required: false,
    desiredEnabled,
    runtime,
  }
}

function snapshot(runtime: PluginLifecycleEntry['runtime'], desiredEnabled = true): PluginLifecycleSnapshot {
  return { entries: [entry(runtime, desiredEnabled)], pendingRestart: [] }
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function capabilities(): DesktopCapabilitiesContract['plugins'] & {
  list: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['list']>>
  enable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['enable']>>
  disable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['disable']>>
  reload: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['reload']>>
} {
  return {
    list: vi.fn<DesktopCapabilitiesContract['plugins']['list']>(),
    install: vi.fn<DesktopCapabilitiesContract['plugins']['install']>(),
    checkUpdates: vi.fn<DesktopCapabilitiesContract['plugins']['checkUpdates']>(),
    update: vi.fn<DesktopCapabilitiesContract['plugins']['update']>(),
    reinstall: vi.fn<DesktopCapabilitiesContract['plugins']['reinstall']>(),
    remove: vi.fn<DesktopCapabilitiesContract['plugins']['remove']>(),
    enable: vi.fn<DesktopCapabilitiesContract['plugins']['enable']>(),
    disable: vi.fn<DesktopCapabilitiesContract['plugins']['disable']>(),
    reload: vi.fn<DesktopCapabilitiesContract['plugins']['reload']>(),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PluginManagerController', () => {
  it('loads lazily, reports an initial error, and retries', async () => {
    const plugins = capabilities()
    plugins.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot('active'))
    const controller = new PluginManagerController(plugins)

    expect(controller.getState()).toEqual({ status: 'loading' })
    expect(plugins.list).not.toHaveBeenCalled()
    await controller.start()
    expect(controller.getState()).toEqual({ status: 'error' })
    await controller.retryLoad()
    expect(controller.getState()).toEqual({ status: 'ready', snapshot: snapshot('active') })
  })

  it.each([
    ['enable', 'loading', false, 'active', true],
    ['disable', 'unloading', true, 'absent', false],
    ['reload', 'unloading', true, 'active', true],
  ] as const)('polls during %s and reconciles after success', async (
    kind,
    transition,
    initialDesired,
    finalRuntime,
    finalDesired,
  ) => {
    vi.useFakeTimers()
    const plugins = capabilities()
    const mutation = deferred()
    plugins.list
      .mockResolvedValueOnce(snapshot(initialDesired ? 'active' : 'absent', initialDesired))
      .mockResolvedValueOnce(snapshot(transition, initialDesired))
      .mockResolvedValueOnce(snapshot(finalRuntime, finalDesired))
    plugins[kind].mockReturnValueOnce(mutation.promise)
    const controller = new PluginManagerController(plugins, 250)
    await controller.start()

    const running = controller.mutate({ plugin: PLUGIN, kind })
    expect(controller.getState().activeOperation).toEqual({ plugin: PLUGIN, kind })
    await vi.advanceTimersByTimeAsync(250)
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      snapshot: snapshot(transition, initialDesired),
      activeOperation: { plugin: PLUGIN, kind },
    })
    mutation.resolve()
    await running

    expect(plugins[kind]).toHaveBeenCalledWith(PLUGIN)
    expect(controller.getState()).toEqual({
      status: 'ready',
      snapshot: snapshot(finalRuntime, finalDesired),
    })
  })

  it('reconciles rollback truth and exposes a safe operation failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const plugins = capabilities()
    plugins.list
      .mockResolvedValueOnce(snapshot('active'))
      .mockResolvedValueOnce(snapshot('active'))
    plugins.reload.mockRejectedValueOnce(new Error('raw stack detail'))
    const controller = new PluginManagerController(plugins)
    await controller.start()

    await controller.mutate({ plugin: PLUGIN, kind: 'reload' })

    expect(controller.getState()).toEqual({
      status: 'ready',
      snapshot: snapshot('active'),
      operationError: { plugin: PLUGIN, kind: 'reload' },
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reload failed'), expect.any(Error))
  })

  it('rejects overlapping renderer commands and stops polling after disposal', async () => {
    vi.useFakeTimers()
    const plugins = capabilities()
    const mutation = deferred()
    plugins.list.mockResolvedValue(snapshot('active'))
    plugins.reload.mockReturnValueOnce(mutation.promise)
    const controller = new PluginManagerController(plugins, 250)
    await controller.start()

    const running = controller.mutate({ plugin: PLUGIN, kind: 'reload' })
    await controller.mutate({ plugin: PLUGIN, kind: 'disable' })
    expect(plugins.disable).not.toHaveBeenCalled()
    controller.dispose()
    await vi.advanceTimersByTimeAsync(1_000)
    mutation.resolve()
    await running
    expect(plugins.list).toHaveBeenCalledOnce()
  })
})
