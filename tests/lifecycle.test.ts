// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import { bench, contributeSurface, DummyAlpha, DummyBeta, UpstreamDetailsPanel } from './harness.ts'

function winner(slots: Awaited<ReturnType<typeof bench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('details host lifecycle', () => {
  it('closes when the active surface unloads', async () => {
    const b = await bench()
    const stopAlpha = contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    b.shellDetails.open('test.alpha')
    stopAlpha()
    await Promise.resolve()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    await b.fiber.dispose()
  })

  it('closes on session switch and restores the upstream occupant', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.sessions.setCurrent('session-b')
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.closeDetails).toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('restores the upstream occupant when the host unloads', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    await b.fiber.dispose()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.slots.spec('shell.details.surface')).toBeUndefined()
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

  it('closes after the active surface reports a render crash', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    const entry = b.slots.entries('shell.details.surface').find(candidate => candidate.options.id === 'test.alpha')
    if (entry === undefined) throw new Error('expected test.alpha contribution')
    b.slots.reportEntryError('shell.details.surface', entry, new Error('boom'), { abdicate: true })
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    await b.fiber.dispose()
  })
})
