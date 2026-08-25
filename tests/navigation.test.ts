// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { DETAILS_HISTORY_LIMIT } from '../src/client/session-state.ts'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import {
  bench,
  contributeSurface,
  DummyAlpha,
  DummyBeta,
  DummyGamma,
  UpstreamDetailsPanel,
} from './harness.ts'

function winner(slots: Awaited<ReturnType<typeof bench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('shellDetails navigation and session state', () => {
  it('isolates session A/B and restores on switch', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)

    b.shellDetails.open('test.alpha')
    expect(b.shellDetails.activeId).toBe('test.alpha')

    b.sessions.setCurrent('session-b')
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)

    b.shellDetails.open('test.beta')
    expect(b.shellDetails.activeId).toBe('test.beta')

    b.sessions.setCurrent('session-a')
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(winner(b.slots)).toBe(DetailsHost)

    b.sessions.setCurrent('session-b')
    expect(b.shellDetails.activeId).toBe('test.beta')
    await b.fiber.dispose()
  })

  it('restores upstream for an empty session', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.sessions.setCurrent('session-b')
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.closeDetails).toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('pushes history by default and supports back', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    contributeSurface(b.ctx, 'test.gamma', 'Gamma', DummyGamma)

    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    expect(b.shellDetails.getSnapshot()).toMatchObject({
      activeId: 'test.beta',
      canGoBack: true,
      historyDepth: 1,
    })
    b.shellDetails.open('test.gamma')
    expect(b.shellDetails.canGoBack()).toBe(true)
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(2)

    b.shellDetails.back()
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(1)

    b.shellDetails.back()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.canGoBack()).toBe(false)

    b.shellDetails.back()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    await b.fiber.dispose()
  })

  it('replace closes the previous active without history', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    const events: string[] = []
    b.shellDetails.registerSurface({
      id: 'test.alpha',
      onDeactivate: () => { events.push('alpha:deactivate') },
      onClose: (_i, reason) => { events.push(`alpha:close:${reason}`) },
    })
    b.shellDetails.open('test.alpha')
    b.shellDetails.open({ surfaceId: 'test.beta', navigation: 'replace' })
    expect(events).toEqual(['alpha:deactivate', 'alpha:close:replace'])
    expect(b.shellDetails.canGoBack()).toBe(false)
    await b.fiber.dispose()
  })

  it('dedupes active and history while preserving instanceId and latest payload', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.file', 'File', DummyAlpha)
    b.shellDetails.registerSurface({
      id: 'test.file',
      dedupeKey: payload => (payload as { path?: string }).path,
    })
    const first = b.shellDetails.open({
      surfaceId: 'test.file',
      payload: { path: 'src/a.ts', line: 10 },
    })
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyBeta)
    b.shellDetails.open('test.alpha')
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(1)

    const reused = b.shellDetails.open({
      surfaceId: 'test.file',
      payload: { path: 'src/a.ts', line: 80 },
    })
    expect(reused.instanceId).toBe(first.instanceId)
    expect(reused.payload).toEqual({ path: 'src/a.ts', line: 80 })
    expect(b.shellDetails.activeInstance?.payload).toEqual({ path: 'src/a.ts', line: 80 })
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(1)

    const again = b.shellDetails.open({
      surfaceId: 'test.file',
      payload: { path: 'src/a.ts', line: 90 },
    })
    expect(again.instanceId).toBe(first.instanceId)
    expect(again.payload).toEqual({ path: 'src/a.ts', line: 90 })
    await b.fiber.dispose()
  })

  it('bounds history and emits history-evicted lifecycle', async () => {
    const b = await bench()
    const closed: string[] = []
    for (let i = 0; i < DETAILS_HISTORY_LIMIT + 2; i += 1) {
      const id = `test.item-${String(i)}`
      contributeSurface(b.ctx, id, id, DummyAlpha)
      b.shellDetails.registerSurface({
        id,
        onClose: (_instance, reason) => {
          if (reason === 'history-evicted') closed.push(id)
        },
      })
      b.shellDetails.open(id)
    }
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(DETAILS_HISTORY_LIMIT)
    expect(closed[0]).toBe('test.item-0')
    await b.fiber.dispose()
  })

  it('falls back through history after surface unload', async () => {
    const b = await bench()
    const stopAlpha = contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    contributeSurface(b.ctx, 'test.gamma', 'Gamma', DummyGamma)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    b.shellDetails.open('test.gamma')
    stopAlpha()
    await Promise.resolve()
    expect(b.shellDetails.activeId).toBe('test.gamma')
    expect(b.shellDetails.getSnapshot().historyDepth).toBe(1)
    expect(b.shellDetails.getSnapshot().canGoBack).toBe(true)
    await b.fiber.dispose()
  })

  it('falls back after active surface crash without clearing foreign history', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    const entry = b.slots.entries('shell.details.surface').find(candidate => candidate.options.id === 'test.beta')
    if (entry === undefined) throw new Error('expected test.beta')
    b.slots.reportEntryError('shell.details.surface', entry, new Error('boom'), { abdicate: true })
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('purges deleted session state', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.sessions.setCurrent('session-b')
    b.sessions.removeSession('session-a')
    b.sessions.setCurrent('session-a')
    expect(b.shellDetails.isOpen()).toBe(false)
    await b.fiber.dispose()
  })

  it('close clears current navigation', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    b.shellDetails.close()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.canGoBack()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    await b.fiber.dispose()
  })

  it('host unload clears all session navigation', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.sessions.setCurrent('session-b')
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.beta')
    await b.fiber.dispose()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
  })

  it('skips onOpen when dedupe reactivates an instance', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.file', 'File', DummyAlpha)
    const opened = vi.fn()
    const activated = vi.fn()
    b.shellDetails.registerSurface({
      id: 'test.file',
      dedupeKey: payload => (payload as { path?: string }).path,
      onOpen: opened,
      onActivate: activated,
    })
    b.shellDetails.open({ surfaceId: 'test.file', payload: { path: 'a.ts' } })
    expect(opened).toHaveBeenCalledTimes(1)
    expect(activated).toHaveBeenCalledTimes(1)
    b.shellDetails.open({ surfaceId: 'test.file', payload: { path: 'a.ts', line: 2 } })
    expect(opened).toHaveBeenCalledTimes(1)
    expect(activated).toHaveBeenCalledTimes(2)
    await b.fiber.dispose()
  })
})
