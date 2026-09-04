// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import {
  GIT_CHANGES_SURFACE_ID,
  GIT_DIFF_SURFACE_ID,
  GIT_GRAPH_SURFACE_ID,
} from '../src/client/contract.ts'
import type { GitClientController, GitDesktopCapability } from '../src/client/controller.ts'

describe('Git client lifecycle', () => {
  it('registers composer control and details surface without shell.overlay', async () => {
    const ctx = new Context()
    const registrations: Array<{ name?: string; id?: string }> = []
    const shellDetails = {
      activeId: null as string | null,
      activeInstance: null as { surfaceId: string; payload?: unknown } | null,
      open: vi.fn((idOrRequest: string | { surfaceId: string; payload?: unknown; navigation?: string }) => {
        if (typeof idOrRequest === 'string') {
          shellDetails.activeId = idOrRequest
          shellDetails.activeInstance = { surfaceId: idOrRequest }
          return
        }
        shellDetails.activeId = idOrRequest.surfaceId
        shellDetails.activeInstance = { surfaceId: idOrRequest.surfaceId, payload: idOrRequest.payload }
        return shellDetails.activeInstance
      }),
      close: vi.fn(() => {
        shellDetails.activeId = null
        shellDetails.activeInstance = null
      }),
      toggle: vi.fn(),
      isOpen: vi.fn((id?: string) => id === undefined ? shellDetails.activeId !== null : shellDetails.activeId === id),
      getSnapshot: vi.fn(() => ({
        open: shellDetails.activeId !== null,
        activeId: shellDetails.activeId,
        activeInstance: shellDetails.activeInstance,
        label: null,
        canGoBack: false,
        historyDepth: 0,
      })),
      subscribe: vi.fn(() => () => {}),
      registerSurface: vi.fn((_descriptor: {
        id: string
        dedupeKey?: (payload: unknown) => string | undefined
      }) => () => {}),
      registerLauncher: vi.fn(() => () => {}),
    }
    ctx.provide('slots', {
      inject: (_name: string, callback: () => unknown) => ctx.effect(() => callback() as () => void),
      register: (entry: { name?: string; id?: string }) => {
        registrations.push(entry)
        return () => { registrations.splice(registrations.indexOf(entry), 1) }
      },
    } as never)
    ctx.provide('connection', { rpc: { call: vi.fn() } } as never)
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('shellDetails', shellDetails as never)
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(registrations.map(entry => entry.id)).toEqual([
      'git-context',
      GIT_CHANGES_SURFACE_ID, GIT_CHANGES_SURFACE_ID,
      GIT_DIFF_SURFACE_ID, GIT_DIFF_SURFACE_ID,
      GIT_GRAPH_SURFACE_ID, GIT_GRAPH_SURFACE_ID,
    ])
    expect(registrations.map(entry => entry.name)).toEqual([
      'conversation.input.left',
      'shell.details.surface', 'shell.details.header.actions',
      'shell.details.surface', 'shell.details.header.actions',
      'shell.details.surface', 'shell.details.header.actions',
    ])
    expect(shellDetails.registerSurface).toHaveBeenCalledTimes(3)
    const changesDescriptor = shellDetails.registerSurface.mock.calls[0]![0]
    const diffDescriptor = shellDetails.registerSurface.mock.calls[1]![0]
    expect(changesDescriptor.id).toBe(GIT_CHANGES_SURFACE_ID)
    expect(changesDescriptor.dedupeKey).toBeTypeOf('function')
    expect(diffDescriptor.id).toBe(GIT_DIFF_SURFACE_ID)
    expect(shellDetails.registerLauncher).toHaveBeenCalledTimes(2)
    expect(registrations.some(entry => entry.name === 'shell.overlay')).toBe(false)
    expect(registrations.some(entry => entry.id === 'git-drawer')).toBe(false)

    const desktop: GitDesktopCapability = {
      shell: { showItemInFolder: vi.fn(), openPath: vi.fn(() => Promise.resolve('')) },
      notification: { show: vi.fn(() => Promise.resolve({ shown: true })) },
    }
    const provider = ctx.plugin((desktopCtx) => { desktopCtx.provide('desktop', desktop) })
    await provider.await()
    const controller = registrations.find(entry => entry.id === 'git-context') as { inject?: () => { controller: GitClientController } }
    expect(controller.inject?.().controller.getSnapshot().desktopAvailable).toBe(true)
    await provider.dispose()
    expect(controller.inject?.().controller.getSnapshot().desktopAvailable).toBe(false)

    const openDetails = (registrations.find(entry => entry.id === 'git-context') as { inject?: () => { openDetails: () => void; controller: GitClientController } })
      .inject?.().openDetails
    expect(openDetails).toBeTypeOf('function')
    shellDetails.open.mockImplementationOnce(() => {
      throw new Error('host open failed')
    })
    expect(() => { openDetails?.() }).toThrow(/host open failed/)
    expect(shellDetails.open).toHaveBeenCalledWith({ surfaceId: GIT_CHANGES_SURFACE_ID })

    // Diff tabs dedupe per path + comparison side.
    expect(diffDescriptor.dedupeKey?.({ path: 'a.ts', staged: false })).toBe('git:diff:a.ts:worktree')
    expect(diffDescriptor.dedupeKey?.({ path: 'a.ts', staged: true })).toBe('git:diff:a.ts:staged')

    await fiber.dispose()
  })
})
