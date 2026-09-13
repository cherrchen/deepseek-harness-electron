import { describe, expect, it, vi } from 'vitest'
import { en, zh } from '../src/locale.ts'
import {
  PluginRecoveryError,
  retryAfterPluginRecovery,
} from '../src/plugin-recovery.ts'
import {
  parseRecoveryActionUrl,
  presentPluginRecovery,
  recoveryDocument,
  type RecoveryWindow,
} from '../src/plugin-recovery-window.ts'

function fakeWindow(): {
  window: RecoveryWindow
  loaded: string[]
  created: boolean
  trigger(url: string): void
  close(): void
} {
  let openHandler: ((details: { url: string }) => { action: 'deny' }) | undefined
  let closed: (() => void) | undefined
  const loaded: string[] = []
  let destroyed = false
  const window: RecoveryWindow = {
    loadURL: async (url) => { loaded.push(url) },
    webContents: {
      setWindowOpenHandler: (handler) => { openHandler = handler },
      on: () => {},
    },
    once: (event, listener) => {
      if (event === 'closed') closed = listener
    },
    show: () => {},
    focus: () => {},
    isDestroyed: () => destroyed,
    close: () => {
      destroyed = true
      closed?.()
    },
  }
  return {
    window,
    loaded,
    created: true,
    trigger: (url) => { openHandler?.({ url }) },
    close: () => { window.close() },
  }
}

describe('plugin recovery window', () => {
  it.each([
    'pending-reconcile-failed',
    'lock-timeout',
    'profile-reconcile-failed',
    'host-timeout',
  ] as const)('loads Main-owned HTML for %s without the renderer origin', (reason) => {
    const url = recoveryDocument({ messages: en, reason, lang: 'en', details: 'diag' })
    expect(url.startsWith('data:text/html')).toBe(true)
    const html = decodeURIComponent(url.replace('data:text/html;charset=utf-8,', ''))
    expect(html).toContain(en.recoveryTitle)
    expect(html).toContain('dsh-recovery:disable-all')
    expect(html).toContain('dsh-recovery:reset-management')
    expect(html).not.toContain('dsh-electron://localhost')
    const zhUrl = recoveryDocument({ messages: zh, reason, lang: 'zh-CN' })
    expect(decodeURIComponent(zhUrl.replace('data:text/html;charset=utf-8,', ''))).toContain(zh.recoveryTitle)
  })

  it('parses recovery action URLs', () => {
    expect(parseRecoveryActionUrl('dsh-recovery:disable-all')).toBe('disable-all')
    expect(parseRecoveryActionUrl('dsh-recovery:reset-management')).toBe('reset-management')
    expect(parseRecoveryActionUrl('https://example.com')).toBeUndefined()
  })

  it.each([
    ['pending-reconcile-failed', 'disable-all'] as const,
    ['host-timeout', 'reset-management'] as const,
    ['profile-reconcile-failed', 'disable-all'] as const,
  ])('creates a recovery window for %s and runs %s without loading the main renderer', async (reason, action) => {
    const fake = fakeWindow()
    const disableAll = vi.fn(async () => {})
    const resetManagement = vi.fn(async () => {})
    const presented = presentPluginRecovery({
      messages: en,
      lang: 'en',
      reason,
      disableAll,
      resetManagement,
      createWindow: () => fake.window,
    })
    await vi.waitFor(() => { expect(fake.loaded).toHaveLength(1) })
    expect(fake.loaded[0]?.startsWith('data:text/html')).toBe(true)
    expect(fake.loaded[0]).not.toContain('dsh-electron://localhost')
    fake.trigger(`dsh-recovery:${action}`)
    await presented
    expect(action === 'disable-all' ? disableAll : resetManagement).toHaveBeenCalledTimes(1)
    expect(action === 'disable-all' ? resetManagement : disableAll).not.toHaveBeenCalled()
  })

  it('retries Host start after a recovery action and skips recovery on the happy path', async () => {
    const starts: string[] = []
    const present = vi.fn(async () => { starts.push('recovery') })
    await retryAfterPluginRecovery(
      async () => {
        starts.push('host')
        if (starts.filter(item => item === 'host').length === 1) {
          throw new PluginRecoveryError('timed out', 'host-timeout')
        }
        return 'ready'
      },
      present,
      async () => { starts.push('repaired') },
    )
    expect(starts).toEqual(['host', 'recovery', 'repaired', 'host'])
    expect(present).toHaveBeenCalledTimes(1)

    const happy: string[] = []
    await retryAfterPluginRecovery(async () => {
      happy.push('host')
      return 'ok'
    }, async () => { happy.push('recovery') })
    expect(happy).toEqual(['host'])
  })
})
