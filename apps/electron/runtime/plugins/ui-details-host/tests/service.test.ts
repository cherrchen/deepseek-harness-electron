// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import { bench, contributeSurface, DummyAlpha, DummyBeta, UpstreamDetailsPanel } from './harness.ts'

function winner(slots: Awaited<ReturnType<typeof bench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('shellDetails service', () => {
  it('does not occupy details until open', async () => {
    const b = await bench()
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('opens a registered surface, switches without remounting, and restores the upstream occupant', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)

    b.shellDetails.open('test.alpha')
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.isOpen()).toBe(true)
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(b.shellDetails.isOpen('test.beta')).toBe(false)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.slots.spec('shell.details.surface')).toEqual({ kind: 'list', scope: 'session' })
    expect(b.layout.openDetails).toHaveBeenCalledTimes(1)

    b.shellDetails.open('test.beta')
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()
    expect(b.layout.openDetails).toHaveBeenCalledTimes(2)

    b.shellDetails.close()
    expect(b.shellDetails.activeId).toBeNull()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.slots.spec('shell.details.surface')).toBeUndefined()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)

    b.shellDetails.close()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)
    await b.fiber.dispose()
  })

  it('rolls back takeover when the surface id is missing', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    expect(() => { b.shellDetails.open('test.missing') }).toThrow(/surface "test.missing" is not registered/)
    expect(b.shellDetails.activeId).toBeNull()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
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
