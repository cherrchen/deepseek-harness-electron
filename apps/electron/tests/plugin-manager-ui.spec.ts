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

function plugin(overrides: Partial<PluginLifecycleEntry> = {}): PluginLifecycleEntry {
  return {
    name: GIT,
    version: '0.2.0',
    description: 'Git integration for DeepSeek Harness',
    source: 'ecosystem',
    hasClient: true,
    manageable: true,
    required: false,
    desiredEnabled: true,
    runtime: 'active',
    ...overrides,
  }
}

function snapshot(...entries: PluginLifecycleEntry[]): PluginLifecycleSnapshot {
  return { entries }
}

function capabilities(initial: PluginLifecycleSnapshot): DesktopCapabilitiesContract['plugins'] & {
  list: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['list']>>
  enable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['enable']>>
  disable: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['disable']>>
  reload: ReturnType<typeof vi.fn<DesktopCapabilitiesContract['plugins']['reload']>>
} {
  return {
    list: vi.fn<DesktopCapabilitiesContract['plugins']['list']>().mockResolvedValue(initial),
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
  ctx.provide('desktop', { plugins })
  const declare = () => slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const stop = declareSlot ? declare() : undefined
  return { ctx, slots, locale, plugins, declare, stop }
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
      source: 'desktop-runtime',
      manageable: false,
      required: true,
    })
    const plugins = capabilities(snapshot(active, disabled, failed, system))
    const view = render(createElement(PluginManagerTab, { plugins, t }))

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
    render(createElement(PluginManagerTab, { plugins, t }))
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

  it.each([
    ['Enable', 'enable', plugin({ desiredEnabled: false, runtime: 'absent' })],
    ['Disable', 'disable', plugin()],
  ] as const)('forwards the %s action to the desktop lifecycle capability', async (label, kind, current) => {
    const plugins = capabilities(snapshot(current))
    render(createElement(PluginManagerTab, { plugins, t }))
    const button = await screen.findByRole('button', { name: label })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(plugins[kind]).toHaveBeenCalledWith(GIT) })
  })

  it('shows initial load failure and retries without preserving failed local state', async () => {
    const plugins = capabilities(snapshot(plugin()))
    plugins.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot(plugin()))
    render(createElement(PluginManagerTab, { plugins, t }))

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
