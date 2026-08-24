// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { vi } from 'vitest'
import { apply as applyDetailsHost, inject as injectDetailsHost } from '@dsh-electron/dsh-client-ui-details-host/client'
import { apply as applyGit, inject as injectGit } from '../../src/client/index.ts'
import { GIT_DETAILS_SURFACE_ID } from '../../src/client/contract.ts'
import { materializeClientBundle } from '../setup/module-loader.ts'

const { SlotRegistry } = materializeClientBundle('@deepseek-ai/dsh-client-runtime') as {
  SlotRegistry: Parameters<Context['plugin']>[0]
}

function UpstreamDetailsPanel(): null {
  return null
}

export function fakeLayout() {
  return {
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
  }
}

export function fakeSessions(current: string | undefined = 'session-a') {
  let snapshot = { current }
  const listeners = new Set<() => void>()
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    setCurrent(next: string | undefined) {
      snapshot = { current: next }
      for (const listener of listeners) listener()
    },
  }
}

/** Bench with Details Host and Git plugins mounted against the real slot registry. */
export async function integrationBench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const layout = fakeLayout()
  const sessions = fakeSessions()
  ctx.provide('layout', layout)
  ctx.provide('sessions', sessions as never)
  ctx.provide('connection', { rpc: { call: vi.fn() } } as never)
  ctx.provide('locale', { register: () => () => {} } as never)
  const disposeRoot = ctx.slots.register({
    name: 'root',
    children: { details: { kind: 'single', scope: 'session' } },
  } as never, () => null)
  const disposeUpstream = ctx.slots.register({ name: 'details' } as never, UpstreamDetailsPanel)
  const detailsFiber = ctx.plugin({ inject: [...injectDetailsHost], apply: applyDetailsHost })
  const gitFiber = ctx.plugin({ inject: [...injectGit], apply: applyGit })
  await detailsFiber.await()
  await gitFiber.await()
  return {
    ctx,
    slots: ctx.slots,
    layout,
    sessions,
    detailsFiber,
    gitFiber,
    shellDetails: ctx.shellDetails,
    disposeRoot,
    disposeUpstream,
  }
}

export { GIT_DETAILS_SURFACE_ID, UpstreamDetailsPanel }
