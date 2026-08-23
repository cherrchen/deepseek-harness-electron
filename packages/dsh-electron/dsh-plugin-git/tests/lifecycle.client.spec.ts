// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { GitClientController, GitDesktopCapability } from '../src/client/controller.ts'

describe('Git client lifecycle', () => {
  it('registers composer control and drawer without sidebar action', async () => {
    const ctx = new Context()
    const registrations: Array<{ name?: string; id?: string; inject?: () => { controller: GitClientController } }> = []
    ctx.provide('slots', {
      inject: (_name: string, callback: () => unknown) => ctx.effect(() => callback() as () => void),
      register: (entry: { name?: string; id?: string; inject?: () => { controller: GitClientController } }) => {
        registrations.push(entry)
        return () => { registrations.splice(registrations.indexOf(entry), 1) }
      },
    } as never)
    ctx.provide('connection', { rpc: { call: vi.fn() } } as never)
    ctx.provide('locale', { register: () => () => {} } as never)
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(registrations.map(entry => entry.id)).toEqual(['git-context', 'git-drawer'])
    expect(registrations.map(entry => entry.name)).toEqual(['conversation.input.left', 'shell.overlay'])
    expect(registrations.some(entry => entry.name === 'sidebar.footer.action')).toBe(false)
    const controller = registrations[0]?.inject?.().controller
    if (controller === undefined) throw new Error('Git controller was not injected into the portable slot')
    expect(controller.getSnapshot().desktopAvailable).toBe(false)

    const desktop: GitDesktopCapability = {
      shell: { showItemInFolder: vi.fn(), openPath: vi.fn(() => Promise.resolve('')) },
      notification: { show: vi.fn(() => Promise.resolve({ shown: true })) },
    }
    const provider = ctx.plugin((desktopCtx) => { desktopCtx.provide('desktop', desktop) })
    await provider.await()
    expect(controller.getSnapshot().desktopAvailable).toBe(true)
    await provider.dispose()
    expect(controller.getSnapshot().desktopAvailable).toBe(false)
    expect(registrations.map(entry => entry.id)).toEqual(['git-context', 'git-drawer'])

    await fiber.dispose()
  })
})
