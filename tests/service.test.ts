// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  DETAILS_HOST_ENTRY_ID,
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  SHELL_DETAILS_API_VERSION,
} from '../src/client/contract.ts'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import {
  DetailsSurfaceDuplicateError,
  DetailsSurfaceNotFoundError,
  DetailsTakeoverConflictError,
} from '../src/client/errors.ts'
import { resetInstanceIdCounterForTests } from '../src/client/instance.ts'
import {
  bench,
  contributeSurface,
  DummyAlpha,
  DummyBeta,
  UpstreamDetailsPanel,
} from './harness.ts'

function winner(slots: Awaited<ReturnType<typeof bench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('shellDetails service', () => {
  it('does not occupy details until open', async () => {
    const b = await bench()
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.activeInstance).toBeNull()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.apiVersion).toBe(SHELL_DETAILS_API_VERSION)
    expect(b.shellDetails.features.has('payloadRouting')).toBe(true)
    expect(b.shellDetails.features.has('dedupe')).toBe(true)
    expect(b.shellDetails.features.has('tabs')).toBe(true)
    expect(b.shellDetails.features.has('launcher')).toBe(true)
    expect(b.shellDetails.features.has('tabClose')).toBe(true)
    expect(b.shellDetails.features.has('dockVisibility')).toBe(true)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    expect(b.shellDetails.getSnapshot()).toEqual({
      open: false,
      activeId: null,
      activeInstance: null,
      label: null,
      tabs: [],
      launcherVisible: false,
      dockVisible: false,
      canGoBack: false,
      historyDepth: 0,
    })
    await b.fiber.dispose()
  })

  it('registers the header Details Toggle in the utilities cluster', async () => {
    const b = await bench()
    const entries = b.slots.entries('conversation.session.header.utilities')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options.id).toBe('dsh-electron.details-toggle')
    await b.fiber.dispose()
  })

  it('reveals the launcher when the dock opens with no tabs', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.reportDockVisible(true)
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(true)
    expect(b.shellDetails.getSnapshot().dockVisible).toBe(true)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()

    // Toggling the dock closed preserves the launcher and any tabs.
    b.shellDetails.toggleDock()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)
    b.shellDetails.reportDockVisible(false)
    expect(b.shellDetails.getSnapshot().dockVisible).toBe(false)
    b.shellDetails.toggleDock()
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(true)
    expect(b.layout.openDetails).toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('re-reveals retained tabs without the launcher on dock reopen', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.shellDetails.reportDockVisible(false)
    b.shellDetails.reportDockVisible(true)
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(false)
    await b.fiber.dispose()
  })

  it('opens a registered surface as a tab via legacy string id', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)

    const legacyReturn = b.shellDetails.open('test.alpha')
    expect(legacyReturn).toBeUndefined()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.activeInstance?.surfaceId).toBe('test.alpha')
    expect(b.shellDetails.activeInstance?.label).toBe('Alpha')
    expect(b.shellDetails.activeInstance?.sessionId).toBe('session-a')
    expect(b.shellDetails.isOpen()).toBe(true)
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(b.shellDetails.isOpen('test.beta')).toBe(false)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.slots.entriesOfSlot('details')[0]?.registrant).toBe(DETAILS_HOST_ENTRY_ID)
    expect(b.slots.spec('shell.details.surface')).toEqual({ kind: 'list', scope: 'session' })
    expect(b.layout.openDetails).toHaveBeenCalledTimes(1)

    // A second open becomes a second, active tab; the first is retained.
    b.shellDetails.open('test.beta')
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(b.shellDetails.getSnapshot().tabs.map(tab => tab.surfaceId)).toEqual(['test.alpha', 'test.beta'])
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()
    expect(b.layout.openDetails).toHaveBeenCalledTimes(2)
    await b.fiber.dispose()
  })

  it('reuses a deduped surface instead of creating a duplicate tab', async () => {
    resetInstanceIdCounterForTests()
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.registerSurface({
      id: 'test.alpha',
      dedupeKey: payload => `alpha:${(payload as { repo?: string }).repo ?? ''}`,
    })

    const first = b.shellDetails.open({ surfaceId: 'test.alpha', payload: { repo: 'a' } })
    expect(first.instanceId).toBe('details-instance-1')
    const second = b.shellDetails.open({ surfaceId: 'test.alpha', payload: { repo: 'a' } })
    expect(second.instanceId).toBe('details-instance-1')
    expect(second.payload).toEqual({ repo: 'a' })
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(1)

    // A different dedupe key opens a second tab.
    const third = b.shellDetails.open({ surfaceId: 'test.alpha', payload: { repo: 'b' } })
    expect(third.instanceId).toBe('details-instance-2')
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(2)
    await b.fiber.dispose()
  })

  it('closes the active tab and falls back to the MRU tab', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')

    b.shellDetails.close()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.getSnapshot().tabs.map(tab => tab.surfaceId)).toEqual(['test.alpha'])

    // Closing the last tab reveals the launcher and keeps the takeover.
    b.shellDetails.close()
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('closes an explicit tab by instance id', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    const alpha = b.shellDetails.open({ surfaceId: 'test.alpha' })
    b.shellDetails.open('test.beta')

    b.shellDetails.closeTab(alpha.instanceId)
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(1)
    await b.fiber.dispose()
  })

  it('activates tabs and hides the launcher', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    const alpha = b.shellDetails.open({ surfaceId: 'test.alpha' })
    const beta = b.shellDetails.open({ surfaceId: 'test.beta' })
    b.shellDetails.showLauncher()
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(true)
    expect(b.shellDetails.isOpen()).toBe(true)

    b.shellDetails.activate(alpha.instanceId)
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(false)
    expect(b.shellDetails.getSnapshot().activeInstance).toBe(alpha)

    b.shellDetails.activate(beta.instanceId)
    expect(b.shellDetails.activeId).toBe('test.beta')
    await b.fiber.dispose()
  })

  it('shows the launcher and navigates through launcher open requests', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    const disposeCard = b.shellDetails.registerLauncher({
      id: 'test.card',
      pluginId: 'test.plugin',
      title: 'Alpha card',
      open: () => ({ surfaceId: 'test.alpha', payload: { source: 'launcher' } }),
    })
    expect(disposeCard).toBeTypeOf('function')

    b.shellDetails.showLauncher()
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(true)
    expect(b.layout.openDetails).toHaveBeenCalled()

    b.shellDetails.open({ surfaceId: 'test.alpha', payload: { source: 'launcher' } })
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.getSnapshot().launcherVisible).toBe(false)

    expect(() => b.shellDetails.registerLauncher({
      id: 'test.card',
      pluginId: 'test.plugin',
      title: 'Duplicate',
      open: () => ({ surfaceId: 'test.alpha' }),
    })).toThrow(/already registered/)
    disposeCard()
    await b.fiber.dispose()
  })

  it('preserves tab state across dock hide and re-open', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')

    // Toggle the dock closed and open again (AppFrame toggle semantics).
    b.layout.closeDetails()
    b.layout.openDetails()
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(1)
    await b.fiber.dispose()
  })

  it('notifies public snapshot subscribers', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    const listener = vi.fn()
    const stop = b.shellDetails.subscribe(listener)

    b.shellDetails.open({ surfaceId: 'test.alpha', payload: { tab: 'commit' } })
    expect(listener).toHaveBeenCalled()
    expect(b.shellDetails.getSnapshot()).toMatchObject({
      open: true,
      activeId: 'test.alpha',
      label: 'Alpha',
      canGoBack: false,
      historyDepth: 0,
    })

    listener.mockClear()
    b.shellDetails.close()
    expect(listener).toHaveBeenCalled()
    expect(b.shellDetails.getSnapshot().open).toBe(false)

    listener.mockClear()
    stop()
    b.shellDetails.open('test.alpha')
    expect(listener).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('keeps MRU back navigation across tab activations', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    expect(b.shellDetails.canGoBack()).toBe(true)

    b.shellDetails.back()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.canGoBack()).toBe(true)

    b.shellDetails.back()
    expect(b.shellDetails.activeId).toBe('test.beta')
    await b.fiber.dispose()
  })

  it('evicts the oldest tab beyond the tab limit', async () => {
    resetInstanceIdCounterForTests()
    const b = await bench()
    for (let index = 0; index < 25; index += 1) {
      contributeSurface(b.ctx, `test.surface-${index}`, `Surface ${index}`, DummyAlpha)
    }
    for (let index = 0; index < 25; index += 1) {
      b.shellDetails.open(`test.surface-${index}`)
    }
    const tabs = b.shellDetails.getSnapshot().tabs
    expect(tabs).toHaveLength(20)
    expect(tabs[0]!.surfaceId).toBe('test.surface-5')
    expect(b.shellDetails.activeId).toBe('test.surface-24')
    await b.fiber.dispose()
  })

  it('rolls back takeover when the surface id is missing', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    expect(() => { b.shellDetails.open('test.missing') }).toThrow(DetailsSurfaceNotFoundError)
    try {
      b.shellDetails.open('test.missing')
    } catch (error) {
      expect(error).toBeInstanceOf(DetailsSurfaceNotFoundError)
      expect((error as DetailsSurfaceNotFoundError).surfaceId).toBe('test.missing')
    }
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.activeInstance).toBeNull()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('rejects duplicate surface ids without mutating open state', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    // Same id at a distinct priority coexists on the ledger (same priority would throw at register).
    b.ctx.slots.inject(DETAILS_SURFACE_SLOT, () => b.ctx.slots.register({
      name: DETAILS_SURFACE_SLOT,
      id: 'test.alpha',
      label: 'Alpha Shadow',
      priority: 1,
    }, DummyBeta))

    expect(() => { b.shellDetails.open('test.alpha') }).toThrow(DetailsSurfaceDuplicateError)
    try {
      b.shellDetails.open({ surfaceId: 'test.alpha' })
    } catch (error) {
      expect(error).toBeInstanceOf(DetailsSurfaceDuplicateError)
      expect((error as DetailsSurfaceDuplicateError).surfaceId).toBe('test.alpha')
      expect((error as DetailsSurfaceDuplicateError).matchCount).toBe(2)
    }
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('rolls back when a lower-priority occupant wins details', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    function CompetingPanel(): null {
      return null
    }
    b.ctx.slots.register({
      name: 'details',
      registrant: 'test.competitor',
      priority: DETAILS_HOST_PRIORITY - 1,
    }, CompetingPanel)

    expect(() => { b.shellDetails.open('test.alpha') }).toThrow(DetailsTakeoverConflictError)
    try {
      b.shellDetails.open('test.alpha')
    } catch (error) {
      expect(error).toBeInstanceOf(DetailsTakeoverConflictError)
      expect((error as DetailsTakeoverConflictError).winnerId).toBe('test.competitor')
    }
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.activeInstance).toBeNull()
    expect(winner(b.slots)).toBe(CompetingPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('closes the active tab on toggle of the same surface', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.toggle('test.alpha')
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    b.shellDetails.toggle('test.alpha')
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })
})
