// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  inject,
  DETAILS_SURFACE_SLOT,
} from '../runtime/plugins/ui-details-host/src/client/index.ts'
import { DetailsHost } from '../runtime/plugins/ui-details-host/src/client/DetailsHost.tsx'

function UpstreamDetailsPanel(): null {
  return null
}

function DummyAlpha(): null {
  return null
}

function DummyBeta(): null {
  return null
}

function fakeLayout() {
  return {
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
  }
}

function fakeSessions(current: string | undefined = 'session-a') {
  let snapshot: {
    current: string | undefined
    ids: string[]
    byId: Record<string, { id: string }>
  } = {
    current,
    ids: current === undefined ? [] : [current],
    byId: {},
  }
  if (current !== undefined) snapshot.byId[current] = { id: current }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    setCurrent(next: string | undefined) {
      if (next !== undefined && !snapshot.ids.includes(next)) {
        snapshot = {
          ...snapshot,
          current: next,
          ids: [...snapshot.ids, next],
          byId: { ...snapshot.byId, [next]: { id: next } },
        }
      } else {
        snapshot = { ...snapshot, current: next }
      }
      notify()
    },
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const layout = fakeLayout()
  const sessions = fakeSessions()
  ctx.provide('layout', layout)
  ctx.provide('locale', { register: vi.fn(() => () => {}) } as never)
  ctx.provide('sessions', sessions as never)
  slots.register({
    name: 'root',
    children: {
      details: { kind: 'single', scope: 'session' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  slots.register({ name: 'details' } as never, UpstreamDetailsPanel)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, layout, sessions, fiber, shellDetails: ctx.shellDetails }
}

function contributeSurface(
  ctx: Context,
  id: string,
  label: string,
  component: () => null = DummyAlpha,
): () => void {
  return ctx.slots.inject(DETAILS_SURFACE_SLOT, () => ctx.slots.register({
    name: DETAILS_SURFACE_SLOT,
    id,
    label,
  }, component))
}

function winner(slots: SlotRegistry): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('Details Host Electron integration', () => {
  it('keeps the upstream details occupant until a surface is opened', async () => {
    const b = await bench()
    expect(b.shellDetails.activeId).toBeNull()
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('keeps DetailsHost and its tabs after closing a tab (v3 dock semantics)', async () => {
    const b = await bench()
    expect(b.shellDetails.apiVersion).toBe(3)
    expect(b.shellDetails.features.has('sessionRestore')).toBe(true)
    expect(b.shellDetails.features.has('tabs')).toBe(true)
    expect(b.shellDetails.features.has('launcher')).toBe(true)
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    contributeSurface(b.ctx, 'test.beta', 'Beta', DummyBeta)

    const opened = b.shellDetails.open({
      surfaceId: 'test.alpha',
      payload: { tab: 'diff' },
    })
    expect(opened.payload).toEqual({ tab: 'diff' })
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.slots.spec(DETAILS_SURFACE_SLOT)).toEqual({ kind: 'list', scope: 'session' })
    expect(b.layout.openDetails).toHaveBeenCalledTimes(1)

    b.shellDetails.open('test.beta')
    expect(b.shellDetails.activeId).toBe('test.beta')
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(2)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.layout.closeDetails).not.toHaveBeenCalled()

    // Closing the active tab falls back to the retained tab; the dock keeps
    // its takeover and the upstream occupant stays shadowed.
    b.shellDetails.close()
    expect(b.shellDetails.activeId).toBe('test.alpha')
    expect(b.shellDetails.getSnapshot().tabs).toHaveLength(1)
    expect(winner(b.slots)).toBe(DetailsHost)
    expect(b.slots.spec(DETAILS_SURFACE_SLOT)).toEqual({ kind: 'list', scope: 'session' })
    await b.fiber.dispose()
  })

  it('restores an open surface across session switch without occupying an empty session', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    const opened = b.shellDetails.open({
      surfaceId: 'test.alpha',
      payload: { tab: 'commit' },
    })
    b.sessions.setCurrent('session-b')
    expect(b.shellDetails.activeInstance).toBeNull()
    expect(b.shellDetails.activeId).toBeNull()
    // v3 keeps the takeover while the host lives; the dock shows the Launcher.
    expect(winner(b.slots)).toBe(DetailsHost)
    b.sessions.setCurrent('session-a')
    expect(b.shellDetails.activeInstance?.instanceId).toBe(opened.instanceId)
    expect(b.shellDetails.activeInstance?.payload).toEqual({ tab: 'commit' })
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('rolls back takeover when the surface is missing', async () => {
    const b = await bench()
    contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    expect(() => { b.shellDetails.open('test.missing') }).toThrow(/surface "test.missing" is not registered/)
    expect(winner(b.slots)).toBe(UpstreamDetailsPanel)
    expect(b.layout.openDetails).not.toHaveBeenCalled()
    await b.fiber.dispose()
  })

  it('restores the upstream occupant on host unload and rematerializes after reload', async () => {
    const first = await bench()
    const stopAlpha = contributeSurface(first.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    first.shellDetails.open('test.alpha')
    expect(winner(first.slots)).toBe(DetailsHost)
    await first.fiber.dispose()
    expect(winner(first.slots)).toBe(UpstreamDetailsPanel)
    stopAlpha()

    const fiber = first.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    contributeSurface(first.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    first.ctx.shellDetails.open('test.alpha')
    expect(winner(first.slots)).toBe(DetailsHost)
    await fiber.dispose()
    expect(winner(first.slots)).toBe(UpstreamDetailsPanel)
  })

  it('rematerializes a surviving surface inject after host reload', async () => {
    const first = await bench()
    contributeSurface(first.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    first.shellDetails.open('test.alpha')
    await first.fiber.dispose()
    expect(winner(first.slots)).toBe(UpstreamDetailsPanel)

    const fiber = first.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    first.ctx.shellDetails.open('test.alpha')
    expect(first.ctx.shellDetails.isOpen('test.alpha')).toBe(true)
    expect(winner(first.slots)).toBe(DetailsHost)
    await fiber.dispose()
    expect(winner(first.slots)).toBe(UpstreamDetailsPanel)
  })

  it('prunes tabs when the active surface unloads and keeps the dock alive', async () => {
    const b = await bench()
    const stopAlpha = contributeSurface(b.ctx, 'test.alpha', 'Alpha', DummyAlpha)
    b.shellDetails.open('test.alpha')
    stopAlpha()
    await Promise.resolve()
    expect(b.shellDetails.isOpen()).toBe(false)
    expect(b.shellDetails.getSnapshot().tabs).toEqual([])
    expect(winner(b.slots)).toBe(DetailsHost)
    await b.fiber.dispose()
  })

  it('registers the header Details Toggle entry', async () => {
    const b = await bench()
    const entries = b.slots.entries('conversation.session.header.utilities')
    expect(entries.some(entry => entry.options.id === 'dsh-electron.details-toggle')).toBe(true)
    await b.fiber.dispose()
  })
})
