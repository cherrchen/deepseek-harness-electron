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
    expect(b.shellDetails.features.has('navigationHistory')).toBe(true)
    expect(b.shellDetails.features.has('dedupe')).toBe(true)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    expect(b.shellDetails.getSnapshot()).toEqual({
      open: false,
      activeId: null,
      activeInstance: null,
      label: null,
      canGoBack: false,
      historyDepth: 0,
    })
    await b.fiber.dispose()
  })

  it('opens a registered surface via legacy string id', async () => {
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

    b.shellDetails.open('test.beta')
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()
    expect(b.layout.openDetails).toHaveBeenCalledTimes(2)

    b.shellDetails.close()
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.activeInstance).toBeNull()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.slots.spec('shell.details.surface')).toBeUndefined()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)

    b.shellDetails.close()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)
    await b.fiber.dispose()
  })

  it('opens via request, creates unique instances, and routes payload', async () => {
    resetInstanceIdCounterForTests()
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)

    const first = b.shellDetails.open({
      surfaceId: 'test.alpha',
      payload: { tab: 'diff', path: 'src/app.tsx' },
    })
    expect(first.instanceId).toBe('details-instance-1')
    expect(first.surfaceId).toBe('test.alpha')
    expect(first.payload).toEqual({ tab: 'diff', path: 'src/app.tsx' })
    expect(first.label).toBe('Alpha')
    expect(first.sessionId).toBe('session-a')
    expect(b.shellDetails.activeInstance).toBe(first)
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.getSnapshot().activeInstance?.payload).toEqual({
      tab: 'diff',
      path: 'src/app.tsx',
    })

    const second = b.shellDetails.open({
      surfaceId: 'test.alpha',
      payload: { tab: 'changes' },
    })
    expect(second.instanceId).toBe('details-instance-2')
    expect(second.instanceId).not.toBe(first.instanceId)
    expect(second.payload).toEqual({ tab: 'changes' })
    expect(b.shellDetails.activeInstance).toBe(second)
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
    expect(listener).toHaveBeenCalledTimes(1)
    expect(b.shellDetails.getSnapshot().open).toBe(false)

    listener.mockClear()
    stop()
    b.shellDetails.open('test.alpha')
    expect(listener).not.toHaveBeenCalled()
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

  it('toggles the same surface closed and open', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.toggle('test.alpha')
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    b.shellDetails.toggle('test.alpha')
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    await b.fiber.dispose()
  })
})
