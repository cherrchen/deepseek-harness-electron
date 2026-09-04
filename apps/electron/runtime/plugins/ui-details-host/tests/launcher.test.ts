import { describe, expect, it, vi } from 'vitest'
import { DetailsLauncherRegistry } from '../src/client/launcher.ts'
import type { DetailsLauncherContribution } from '../src/client/contract.ts'

function card(overrides: Partial<DetailsLauncherContribution> = {}): DetailsLauncherContribution {
  return {
    id: 'card.alpha',
    pluginId: 'test.plugin',
    title: 'Alpha',
    open: () => ({ surfaceId: 'test.alpha' }),
    ...overrides,
  }
}

describe('DetailsLauncherRegistry', () => {
  it('registers, disposes, and rejects duplicate contributions', () => {
    const registry = new DetailsLauncherRegistry()
    const dispose = registry.register(card())
    expect(registry.list()).toHaveLength(1)
    expect(() => registry.register(card())).toThrow(/already registered/)
    dispose()
    expect(registry.list()).toHaveLength(0)

    // Re-registering after dispose works (HMR-safe).
    const disposeAgain = registry.register(card({ title: 'Again' }))
    expect(registry.list()[0]!.title).toBe('Again')
    disposeAgain()
  })

  it('sorts by ascending order with registration-order ties', () => {
    const registry = new DetailsLauncherRegistry()
    registry.register(card({ id: 'b', title: 'B', order: 2 }))
    registry.register(card({ id: 'a', title: 'A', order: 1 }))
    registry.register(card({ id: 'a2', title: 'A2', order: 1 }))
    registry.register(card({ id: 'default', title: 'Default' }))
    expect(registry.list().map(entry => entry.title)).toEqual(['Default', 'A', 'A2', 'B'])
  })

  it('applies when() predicates and isolates when() errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const registry = new DetailsLauncherRegistry()
    registry.register(card({ id: 'hidden', title: 'Hidden', when: () => false }))
    registry.register(card({ id: 'broken', title: 'Broken', when: () => { throw new Error('boom') } }))
    registry.register(card({ id: 'visible', title: 'Visible' }))
    expect(registry.list().map(entry => entry.title)).toEqual(['Visible'])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('clears every contribution (host unload)', () => {
    const registry = new DetailsLauncherRegistry()
    registry.register(card())
    registry.register(card({ id: 'b' }))
    registry.clear()
    expect(registry.list()).toHaveLength(0)
  })
})
