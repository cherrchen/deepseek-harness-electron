// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel, type TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DesktopCapabilitiesContract,
  PluginLifecycleEntry,
  PluginLifecycleSnapshot,
} from '../runtime/plugins/desktop-capabilities/src/client/index.ts'
import {
  availableActions,
  matchesPlugin,
  PluginManagerTab,
  pluginDisplayName,
} from '../runtime/plugins/ui-plugin-manager-electron/src/client/PluginManagerTab.tsx'
import { apply, inject, NS } from '../runtime/plugins/ui-plugin-manager-electron/src/client/index.ts'
import { en } from '../runtime/plugins/ui-plugin-manager-electron/src/client/locales.ts'

const GIT = '@dsh-electron/dsh-plugin-git'
const SYSTEM = '@dsh-electron/dsh-electron-desktop-capabilities'
const dialog = { pickDirectory: vi.fn().mockResolvedValue(null) }

function plugin(overrides: Partial<PluginLifecycleEntry> = {}): PluginLifecycleEntry {
  return {
    name: GIT,
    version: '0.2.0',
    description: 'Git integration for DeepSeek Harness',
    ownership: 'bundled', kind: 'runtime-plugin', installSource: 'bundled', activationMode: 'hot', health: 'healthy', packageActions: { checkUpdates: false, update: false, reinstall: false, remove: false },
    hasClient: true,
    manageable: true,
    required: false,
    desiredEnabled: true,
    runtime: 'active',
    ...overrides,
  }
}

function snapshot(...entries: PluginLifecycleEntry[]): PluginLifecycleSnapshot {
  return { entries, pendingRestart: [] }
}

function capabilities(initial: PluginLifecycleSnapshot): DesktopCapabilitiesContract['plugins'] & {
  list: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['list']>>
  enable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['enable']>>
  disable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['disable']>>
  reload: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['reload']>>
  install: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['install']>>
  checkUpdates: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['checkUpdates']>>
  update: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['update']>>
  remove: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['remove']>>
} {
  return {
    list: vi.fn<DesktopCapabilitiesContract['plugins']['list']>().mockResolvedValue(initial),
    install: vi.fn<DesktopCapabilitiesContract['plugins']['install']>().mockResolvedValue({
      name: '@fixture/plugin', version: '1.0.0', kind: 'runtime-plugin', activation: 'activated', source: 'registry',
    }),
    checkUpdates: vi.fn<DesktopCapabilitiesContract['plugins']['checkUpdates']>().mockResolvedValue([]),
    update: vi.fn<DesktopCapabilitiesContract['plugins']['update']>().mockResolvedValue({ name: GIT, operation: 'update', restartRequired: false }),
    reinstall: vi.fn<DesktopCapabilitiesContract['plugins']['reinstall']>().mockResolvedValue({ name: GIT, operation: 'reinstall', restartRequired: false }),
    remove: vi.fn<DesktopCapabilitiesContract['plugins']['remove']>().mockResolvedValue({ name: GIT, operation: 'remove', restartRequired: false }),
    enable: vi.fn<DesktopCapabilitiesContract['plugins']['enable']>().mockResolvedValue(undefined),
    disable: vi.fn<DesktopCapabilitiesContract['plugins']['disable']>().mockResolvedValue(undefined),
    reload: vi.fn<DesktopCapabilitiesContract['plugins']['reload']>().mockResolvedValue(undefined),
  }
}

const t: TranslateNS<'settings.pluginManagerElectron'> = (key, params) => {
  let value = en[key as keyof typeof en]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

async function bench(declareSlot = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const plugins = capabilities(snapshot())
  const dialog = { pickDirectory: vi.fn().mockResolvedValue(null) }
  ctx.provide('desktop', { plugins, dialog })
  const declare = () => slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const stop = declareSlot ? declare() : undefined
  return { ctx, slots, locale, plugins, dialog, declare, stop }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Electron Plugin Manager registration', () => {
  it('registers only the canonical Installed Plugins tab through ctx.desktop', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(inject).toEqual(['slots', 'locale', 'desktop'])
    const entry = b.slots.entries('settings.plugins.tab')[0]
    if (entry === undefined) throw new Error('installed tab registration missing')
    expect(entry.component).toBe(PluginManagerTab)
    expect(entry.options).toMatchObject({ id: 'installed', order: 20 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('Installed')
    expect(b.slots.spec('settings.section')).toBeUndefined()
    expect((entry.inject as unknown as () => { plugins: unknown })().plugins).toBe(b.plugins)
    expect(b.plugins.list).not.toHaveBeenCalled()

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
  })

  it('recovers after late declaration and slot redeclaration', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)

    const stop = b.declare()
    await vi.waitFor(() => { expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1) })
    stop()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    b.declare()
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.plugins.tab')[0]?.component).toBe(PluginManagerTab)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
  })
})

describe('Electron Plugin Manager view', () => {
  it('installs from registry and exposes Git and local repository forms', async () => {
    const plugins = capabilities(snapshot(plugin()))
    const pickDirectory = vi.fn().mockResolvedValue({ path: '/tmp/local plugin' })
    render(createElement(PluginManagerTab, { plugins, dialog: { pickDirectory }, t }))
    await screen.findByText('Git')
    fireEvent.click(screen.getByRole('button', { name: 'Install Plugin' }))
    expect(screen.getByText(/Only install plugins you trust/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'GitHub / Git' }))
    expect(screen.getByLabelText('Repository')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Local' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Folder' }))
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Local repository').value).toBe('/tmp/local plugin')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registry' }))
    fireEvent.change(screen.getByLabelText('Package'), { target: { value: '@fixture/plugin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await screen.findByText('Installation succeeded')
    expect(plugins.install).toHaveBeenCalledWith({ source: 'registry', packageName: '@fixture/plugin' })
  })

  it('renders lifecycle actions, filters locally, and keeps system components read-only', async () => {
    const active = plugin()
    const disabled = plugin({
      name: '@dsh-electron/dsh-plugin-notes',
      description: 'Local note capture',
      desiredEnabled: false,
      runtime: 'absent',
    })
    const failed = plugin({
      name: '@dsh-electron/dsh-plugin-review',
      description: 'Review helper',
      runtime: 'failed',
    })
    const system = plugin({
      name: SYSTEM,
      description: 'Desktop capability provider',
      ownership: 'system', kind: 'runtime-plugin', installSource: 'bundled', activationMode: 'hot', health: 'healthy', packageActions: { checkUpdates: false, update: false, reinstall: false, remove: false },
      manageable: false,
      required: true,
    })
    const plugins = capabilities(snapshot(active, disabled, failed, system))
    const view = render(createElement(PluginManagerTab, { plugins, dialog, t }))

    await screen.findByText('Git')
    expect(screen.getByRole('button', { name: 'Reload' }).disabled).toBe(false)
    expect(screen.getAllByRole('button', { name: 'Disable' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Enable' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Retry' }).disabled).toBe(false)
    expect(screen.queryByText('Desktop Capabilities')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /System Components/ }))
    const systemRow = view.container.querySelector(`[data-plugin="${SYSTEM}"]`)
    if (systemRow === null) throw new Error('system component row missing')
    expect(within(systemRow).getByText('Desktop Capabilities')).toBeTruthy()
    expect(within(systemRow).queryByRole('button')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'note capture' } })
    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.queryByText('Git')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '@dsh-electron/dsh-plugin-review' } })
    expect(screen.getByText('Review')).toBeTruthy()
  })

  it('keeps an incomplete profile dependency visible without lifecycle controls', async () => {
    const incomplete = plugin({
      name: 'dsh-context',
      ownership: 'profile',
      kind: 'runtime-plugin',
      installSource: 'git',
      activationMode: 'hot',
      health: 'reconcile-required',
      packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
      manageable: false,
      desiredEnabled: undefined,
      runtime: undefined,
    })
    const plugins = capabilities(snapshot(incomplete))
    const view = render(createElement(PluginManagerTab, { plugins, dialog, t }))

    expect(await screen.findByText('Installation incomplete')).toBeTruthy()
    const row = view.container.querySelector('[data-plugin="dsh-context"]')
    if (row === null) throw new Error('incomplete dependency row missing')
    expect(within(row).getByRole('button', { name: 'Package actions for DSH Context' })).toBeTruthy()
  })

  it('refreshes the installed list when failed pnpm changed the profile', async () => {
    const incomplete = plugin({
      name: 'dsh-context',
      ownership: 'profile',
      kind: 'bundle',
      installSource: 'git',
      activationMode: 'profile-restart',
      health: 'reconcile-required',
      packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
      manageable: false,
      desiredEnabled: undefined,
      runtime: undefined,
    })
    const plugins = capabilities(snapshot())
    plugins.list.mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot(incomplete))
    const error = Object.assign(new Error('Profile dependencies changed before pnpm stopped.'), {
      code: 'build-script-blocked',
      profileChanged: true,
    })
    plugins.install.mockRejectedValueOnce(error)
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    await screen.findByText('Installed plugins')
    fireEvent.click(screen.getByRole('button', { name: 'Install Plugin' }))
    fireEvent.change(screen.getByLabelText('Package'), { target: { value: 'dsh-context' } })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    expect(await screen.findByText('Installation incomplete')).toBeTruthy()
    expect(screen.getByText('Profile dependencies changed before pnpm stopped.')).toBeTruthy()
    expect(plugins.list).toHaveBeenCalledTimes(2)
  })

  it('shows operation intent, globally locks commands, and reconciles failure', async () => {
    let rejectReload!: (error: Error) => void
    const reload = new Promise<void>((_resolve, reject) => { rejectReload = reject })
    const current = snapshot(
      plugin(),
      plugin({ name: '@dsh-electron/dsh-plugin-notes', desiredEnabled: false, runtime: 'absent' }),
    )
    const plugins = capabilities(current)
    plugins.reload.mockReturnValueOnce(reload)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    await screen.findByText('Git')

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(await screen.findByText('Reloading…')).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: /Reload|Disable|Enable/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    await act(async () => { rejectReload(new Error('raw failure detail')) })

    expect(await screen.findByText('Could not reload Git.')).toBeTruthy()
    expect(screen.getByText('The previous plugin state was restored.')).toBeTruthy()
    expect(screen.queryByText('raw failure detail')).toBeNull()
    expect(log).toHaveBeenCalled()
  })

  it('checks Registry updates explicitly and promotes the wanted version to a primary action', async () => {
    const registry = plugin({
      name: '@fixture/plugin',
      ownership: 'profile',
      installSource: 'registry',
      requestedSpec: '^1.0.0',
      packageActions: { checkUpdates: true, update: 'registry', reinstall: true, remove: true },
    })
    const plugins = capabilities(snapshot(registry))
    plugins.checkUpdates.mockResolvedValueOnce([{
      name: '@fixture/plugin', currentVersion: '1.0.0', wantedVersion: '1.4.0', latestVersion: '2.0.0', updateAvailable: true,
    }])
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    await screen.findByText('Plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }))
    expect(await screen.findByText('Update available: 1.4.0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await vi.waitFor(() => { expect(plugins.update.mock.calls).toContainEqual(['@fixture/plugin']) })
  })

  it('confirms profile removal and keeps removed Bundle restart tombstones visible', async () => {
    const bundle = plugin({
      name: '@fixture/bundle',
      ownership: 'profile',
      kind: 'bundle',
      installSource: 'git',
      requestedSpec: 'github:fixture/bundle#main',
      activationMode: 'profile-restart',
      packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
      manageable: false,
      desiredEnabled: undefined,
      runtime: undefined,
    })
    const plugins = capabilities(snapshot(bundle))
    plugins.list.mockResolvedValueOnce(snapshot(bundle)).mockResolvedValue({
      entries: [],
      pendingRestart: [{ name: '@fixture/bundle', operation: 'remove', previousVersion: '0.2.0' }],
    })
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    await screen.findByText('Bundle')

    fireEvent.click(screen.getByRole('button', { name: 'Package actions for Bundle' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    expect(screen.getByText('Remove Bundle?')).toBeTruthy()
    expect(screen.getByText('Restart DeepSeek Harness to fully apply this change.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => { expect(plugins.remove.mock.calls).toContainEqual(['@fixture/bundle']) })
    expect(await screen.findByText('Plugin changes require restart')).toBeTruthy()
    expect(screen.getByText('@fixture/bundle was removed')).toBeTruthy()
  })

  it.each([
    ['Git', 'git', 'github:fixture/plugin#main'],
    ['Local', 'local', 'file:/fixtures/plugin'],
  ] as const)('offers %s source refresh through the package menu', async (_label, installSource, requestedSpec) => {
    const source = plugin({
      name: `@fixture/${installSource}`,
      ownership: 'profile',
      installSource,
      requestedSpec,
      packageActions: { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true },
    })
    const plugins = capabilities(snapshot(source))
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    await screen.findByText(pluginDisplayName(source))

    fireEvent.click(screen.getByRole('button', { name: `Package actions for ${pluginDisplayName(source)}` }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Refresh from Source' }))
    await vi.waitFor(() => { expect(plugins.update.mock.calls).toContainEqual([source.name]) })
  })

  it('keeps Development Link update out of the package menu', async () => {
    const linked = plugin({
      name: '@fixture/linked',
      ownership: 'profile',
      installSource: 'local',
      requestedSpec: 'link:/fixtures/plugin',
      packageActions: { checkUpdates: false, update: false, reinstall: false, remove: true },
    })
    const plugins = capabilities(snapshot(linked))
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    const title = pluginDisplayName(linked)
    await screen.findByText(title)

    fireEvent.click(screen.getByRole('button', { name: `Package actions for ${title}` }))
    expect(screen.queryByRole('menuitem', { name: 'Refresh from Source' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it.each([
    ['Enable', 'enable', plugin({ desiredEnabled: false, runtime: 'absent' })],
    ['Disable', 'disable', plugin()],
  ] as const)('forwards the %s action to the desktop lifecycle capability', async (label, kind, current) => {
    const plugins = capabilities(snapshot(current))
    render(createElement(PluginManagerTab, { plugins, dialog, t }))
    const button = await screen.findByRole('button', { name: label })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(plugins[kind]).toHaveBeenCalledWith(GIT) })
  })

  it('shows initial load failure and retries without preserving failed local state', async () => {
    const plugins = capabilities(snapshot(plugin()))
    plugins.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot(plugin()))
    render(createElement(PluginManagerTab, { plugins, dialog, t }))

    expect((await screen.findByRole('alert')).textContent).toContain('Installed plugins are temporarily unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Git')).toBeTruthy()
  })

  it('maps static runtime states and actions without desired-state shortcuts', () => {
    expect(availableActions(plugin({ runtime: 'loading', desiredEnabled: false }))).toEqual([])
    expect(availableActions(plugin({ runtime: 'unloading' }))).toEqual([])
    expect(availableActions(plugin({ runtime: 'failed' }))).toEqual(['reload', 'disable'])
    expect(availableActions(plugin({ runtime: 'absent', desiredEnabled: false }))).toEqual(['enable'])
    expect(pluginDisplayName(plugin())).toBe('Git')
    expect(pluginDisplayName(plugin({ name: '@dsh-electron/dsh-client-ui-details-host' }))).toBe('Details Host')
    expect(matchesPlugin(plugin(), 'integration')).toBe(true)
  })
})
