import { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { DETAILS_SURFACE_SLOT } from '../src/client/contract.ts'

export function UpstreamDetailsPanel(): null {
  return null
}

export function DummyAlpha(): null {
  return null
}

export function DummyBeta(): null {
  return null
}

export function DummyGamma(): null {
  return null
}

export function fakeLayout() {
  return {
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
  }
}

export function fakeSessions(current: string | undefined = 'session-a') {
  let snapshot = {
    current,
    ids: current === undefined ? [] as string[] : [current],
    byId: {} as Record<string, { id: string }>,
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
    removeSession(id: string) {
      const ids = snapshot.ids.filter(entry => entry !== id)
      const byId = { ...snapshot.byId }
      delete byId[id]
      snapshot = {
        current: snapshot.current === id ? ids[0] : snapshot.current,
        ids,
        byId,
      }
      notify()
    },
  }
}

function provideSlots(ctx: Context): SlotCore {
  const core = new SlotCore()
  ctx.provide('slots', {
    register(options: object, component: unknown) {
      const dispose = core.register(options as never, component as never)
      const stop = ctx.effect(() => dispose, 'slots.register')
      return () => { void stop() }
    },
    inject(key: string, callback: () => (() => void) | Iterable<() => void>) {
      const stop = ctx.effect(() => {
        let active: (() => void) | undefined
        let epoch: number | undefined
        const reconcile = (): void => {
          const spec = core.specDynamic(key)
          const nextEpoch = core.declarationEpoch(key)
          if (active !== undefined && epoch === nextEpoch) return
          const previous = active
          active = undefined
          epoch = undefined
          previous?.()
          if (spec === undefined) return
          const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`)
          active = () => { void disposeEffect() }
          epoch = nextEpoch
        }
        const unsubscribe = core.subscribeDeclaration(key, reconcile)
        reconcile()
        return () => {
          unsubscribe()
          active?.()
        }
      }, `slots.inject(${JSON.stringify(key)})`)
      return () => { void stop() }
    },
    entries: (key: string) => core.entries(key),
    entriesOfSlot: (key: string) => core.entriesOfSlot(key),
    spec: (key: string) => core.spec(key as never),
    subscribe: (key: string, fn: () => void) => core.subscribe(key, fn),
    onEntryError: (fn: (key: string, entry: ReturnType<SlotCore['entries']>[number], error: unknown, info: { abdicated: boolean }) => void) => core.onEntryError(fn),
    reportEntryError: (key: string, entry: ReturnType<SlotCore['entries']>[number], error: unknown, info: { abdicate: boolean }) => {
      core.reportEntryError(key, entry, error, info)
    },
  } as never)
  return core
}

export async function bench() {
  const ctx = new Context()
  const core = provideSlots(ctx)
  const slots = ctx.get('slots') as {
    register: SlotCore['register']
    inject: (key: string, callback: () => (() => void) | Iterable<() => void>) => () => void
    entries: SlotCore['entries']
    entriesOfSlot: SlotCore['entriesOfSlot']
    spec: SlotCore['spec']
    subscribe: SlotCore['subscribe']
    onEntryError: SlotCore['onEntryError']
    reportEntryError: SlotCore['reportEntryError']
  }
  const layout = fakeLayout()
  const sessions = fakeSessions()
  ctx.provide('layout', layout)
  ctx.provide('sessions', sessions as never)
  const disposeRoot = slots.register({
    name: 'root',
    children: {
      details: { kind: 'single', scope: 'session' },
    },
  }, () => null)
  const disposeUpstream = slots.register({ name: 'details' }, UpstreamDetailsPanel)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const shellDetails = ctx.shellDetails
  return { ctx, slots, core, layout, sessions, fiber, disposeRoot, disposeUpstream, shellDetails }
}

export function contributeSurface(
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
