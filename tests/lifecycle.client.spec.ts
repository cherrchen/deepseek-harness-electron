// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { GIT_DETAILS_SURFACE_ID } from '../src/client/contract.ts'
import type { GitClientController, GitDesktopCapability } from '../src/client/controller.ts'

describe('Git client lifecycle', () => {
  it('registers composer control and details surface without shell.overlay', async () => {
    const ctx = new Context()
    const registrations: Array<{ name?: string; id?: string }> = []
    const shellDetails = {
      activeId: null as string | null,
      open: vi.fn((id: string) => { shellDetails.activeId = id }),
      close: vi.fn(() => { shellDetails.activeId = null }),
      toggle: vi.fn(),
      isOpen: vi.fn((id?: string) => id === undefined ? shellDetails.activeId !== null : shellDetails.activeId === id),
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
    expect(registrations.map(entry => entry.id)).toEqual(['git-context', GIT_DETAILS_SURFACE_ID])
    expect(registrations.map(entry => entry.name)).toEqual(['conversation.input.left', 'shell.details.surface'])
    expect(registrations.some(entry => entry.name === 'shell.overlay')).toBe(false)
    expect(registrations.some(entry => entry.id === 'git-drawer')).toBe(false)

    const desktop: GitDesktopCapability = {
      shell: { showItemInFolder: vi.fn(), openPath: vi.fn(() => Promise.resolve('')) },
      notification: { show: vi.fn(() => Promise.resolve({ shown: true })) },
    }
    const provider = ctx.plugin((desktopCtx) => { desktopCtx.provide('desktop', desktop) })
    await provider.await()
    const controller = registrations[0] as { inject?: () => { controller: GitClientController } }
    expect(controller.inject?.().controller.getSnapshot().desktopAvailable).toBe(true)
    await provider.dispose()
    expect(controller.inject?.().controller.getSnapshot().desktopAvailable).toBe(false)

    await fiber.dispose()
  })
})
