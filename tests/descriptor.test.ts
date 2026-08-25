// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
} from '../src/client/contract.ts'
import { bench, contributeSurface, DummyAlpha, DummyBeta } from './harness.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shellDetails descriptors and lifecycle', () => {
  it('registers, disposes, and rejects duplicate descriptors', async () => {
    const b = await bench()
    const stop = b.shellDetails.registerSurface({ id: 'test.alpha' })
    expect(() => { b.shellDetails.registerSurface({ id: 'test.alpha' }) }).toThrow(/already registered/)
    stop()
    const stopAgain = b.shellDetails.registerSurface({ id: 'test.alpha' })
    stopAgain()
    await b.fiber.dispose()
  })

  it('opens a legacy surface without a descriptor', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    await b.fiber.dispose()
  })

  it('fails open when a descriptor exists but the surface contribution is missing', async () => {
    const b = await bench()
    b.shellDetails.registerSurface({ id: 'test.missing' })
    expect(() => { b.shellDetails.open('test.missing') }).toThrow(/not registered/)
    expect(b.shellDetails.isOpen()).toBe(false)
    await b.fiber.dispose()
  })

  it('invokes open/activate/deactivate/close lifecycle in order', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)
    const events: string[] = []
    b.shellDetails.registerSurface({
      id: 'test.alpha',
      onOpen: () => { events.push('alpha:open') },
      onActivate: () => { events.push('alpha:activate') },
      onDeactivate: () => { events.push('alpha:deactivate') },
      onClose: (_instance, reason) => { events.push(`alpha:close:${reason}`) },
    })
    b.shellDetails.registerSurface({
      id: 'test.beta',
      onOpen: () => { events.push('beta:open') },
      onActivate: () => { events.push('beta:activate') },
      onDeactivate: () => { events.push('beta:deactivate') },
      onClose: (_instance, reason) => { events.push(`beta:close:${reason}`) },
    })

    b.shellDetails.open('test.alpha')
    expect(events).toEqual(['alpha:open', 'alpha:activate'])

    b.shellDetails.open({ surfaceId: 'test.beta', navigation: 'replace' })
    expect(events).toEqual([
      'alpha:open',
      'alpha:activate',
      'alpha:deactivate',
      'alpha:close:replace',
      'beta:open',
      'beta:activate',
    ])

    b.shellDetails.close()
    expect(events.at(-2)).toBe('beta:deactivate')
    expect(events.at(-1)).toBe('beta:close:user')
    await b.fiber.dispose()
  })

  it('isolates lifecycle callback errors and continues the transition', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const activated = vi.fn()
    b.shellDetails.registerSurface({
      id: 'test.alpha',
      onOpen: () => { throw new Error('open boom') },
      onActivate: activated,
    })
    b.shellDetails.open('test.alpha')
    expect(activated).toHaveBeenCalledTimes(1)
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(error).toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('rematerializes descriptors after dispose (HMR)', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    const first = vi.fn()
    const stop = b.shellDetails.registerSurface({ id: 'test.alpha', onActivate: first })
    stop()
    const second = vi.fn()
    b.shellDetails.registerSurface({ id: 'test.alpha', onActivate: second })
    b.shellDetails.open('test.alpha')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    await b.fiber.dispose()
  })

  it('declares the header actions slot while takeover is active', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    expect(b.slots.spec(DETAILS_HEADER_ACTIONS_SLOT)).toEqual({ kind: 'list', scope: 'session' })
    expect(b.slots.spec(DETAILS_SURFACE_SLOT)).toEqual({ kind: 'list', scope: 'session' })
    expect(b.shellDetails.features.has('headerActions')).toBe(true)
    expect(b.shellDetails.features.has('surfaceDescriptors')).toBe(true)
    await b.fiber.dispose()
  })

  it('keeps details open when a header action entry crashes', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    b.ctx.slots.inject(DETAILS_HEADER_ACTIONS_SLOT, () => b.ctx.slots.register({
      name: DETAILS_HEADER_ACTIONS_SLOT,
      id: 'test.alpha',
      label: 'Refresh',
    }, () => null))
    const entry = b.slots.entries(DETAILS_HEADER_ACTIONS_SLOT).find(candidate => candidate.options.id === 'test.alpha')
    if (entry === undefined) throw new Error('expected header action contribution')
    b.slots.reportEntryError(DETAILS_HEADER_ACTIONS_SLOT, entry, new Error('action boom'), { abdicate: true })
    expect(b.shellDetails.isOpen('test.alpha')).toBe(true)
    await b.fiber.dispose()
  })
})
