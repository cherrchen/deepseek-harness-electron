// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import { bench, contributeSurface, DummyAlpha, DummyBeta, UpstreamDetailsPanel } from './harness.ts'

function winner(slots: Awaited<ReturnType<typeof bench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('details host lifecycle', () => {
  it('prunes tabs when their surface unloads and keeps the dock alive', async () => {
    const b = await bench()
    const stopAlpha = contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    b.shellDetails.open('test.beta')
    stopAlpha()
    await Promise.resolve()
    // The unloaded surface's tab disappears; the other tab stays active.
    expect(b.shellDetails.isOpen('test.beta')).toBe(true)
    expect(b.shellDetails.getSnapshot().tabs.map(tab => tab.surfaceId)).toEqual(['test.beta'])
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('falls back to the launcher when the last surface unloads', async () => {
    const b = await bench()
    const stopAlpha = contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    stopAlpha()
    await Promise.resolve()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    // The dock keeps its takeover; the launcher shows while the dock is open.
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('keeps session state across switch and shows the launcher for an empty session', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.sessions.setCurrent('session-b')
    // The app frame closes the dock on session switch (production behavior).
    b.layout.closeDetails()
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    // v3 keeps the takeover (no upstream restoration while the host lives).
    expect(winner(b.slots)).toBe(DetailsHost)
    b.sessions.setCurrent('session-a')
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('restores the upstream occupant when the host unloads', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    await b.fiber.dispose()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.slots.spec('shell.details.surface')).toBeUndefined()
    expect(b.layout.closeDetails).toHaveBeenCalled()
  })

  it('rematerializes contributions after host reload', async () => {
    const first = await bench()
    const stopAlpha = contributeSurface(first.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    first.shellDetails.open('test.alpha')
    await first.fiber.dispose()
    stopAlpha()

    const { apply, inject } = await import('../src/client/index.ts')
    const fiber = first.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    contributeSurface(first.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    first.ctx.shellDetails.open('test.alpha')
    expect(first.ctx.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(winner(first.slots)).toBe(DetailsHost)
    await fiber.dispose()
  })

  it('recovers the launcher after the active surface reports a render crash', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    const entry = b.slots.entries('shell.details.surface').find(candidate => candidate.options.id === 'test.alpha')
    if (entry === undefined) throw new Error('expected test.alpha contribution')
    b.slots.reportEntryError('shell.details.surface', entry, new Error('boom'), { abdicate: true })
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })
})
