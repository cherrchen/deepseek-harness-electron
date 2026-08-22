// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createDesktopCapabilities,
  requireDesktopBridge,
  type DesktopCapabilitiesContract,
} from '../runtime/plugins/desktop-capabilities/src/client/contract.ts'

describe('desktop capability provider contract', () => {
  it('fails clearly when the preload bridge is unavailable', () => {
    delete (globalThis as { window?: { deepseekDesktop?: unknown } }).window?.deepseekDesktop
    expect(() => requireDesktopBridge()).toThrow(/window\.deepseekDesktop is unavailable/)
  })

  it('exposes only approved capability groups and forwards calls', async () => {
    const calls: string[] = []
    const bridge = {
      app: {
        getVersion: async () => { calls.push('app.getVersion'); return '1.0.0' },
        getPlatform: async () => { calls.push('app.getPlatform'); return 'darwin' },
      },
      dialog: {
        pickDirectory: async () => { calls.push('dialog.pickDirectory'); return { path: '/tmp' } },
      },
      clipboard: {
        readText: async () => { calls.push('clipboard.readText'); return 'hi' },
        writeText: async (text: string) => { calls.push(`clipboard.writeText:${text}`) },
      },
      shell: {
        openExternal: async (url: string) => { calls.push(`shell.openExternal:${url}`) },
        openPath: async (path: string) => { calls.push(`shell.openPath:${path}`) },
        showItemInFolder: async (path: string) => { calls.push(`shell.showItemInFolder:${path}`) },
      },
      notification: {
        show: async () => { calls.push('notification.show'); return { shown: true } },
      },
      updater: {
        check: async () => { calls.push('updater.check') },
        download: async () => { calls.push('updater.download') },
        install: async () => { calls.push('updater.install') },
        getState: async () => { calls.push('updater.getState'); return { state: 'idle' as const, channel: 'stable' as const } },
        subscribe: (callback: (state: { state: 'idle'; channel: 'stable' }) => void) => {
          calls.push('updater.subscribe')
          callback({ state: 'idle', channel: 'stable' })
          return () => { calls.push('updater.unsubscribe') }
        },
      },
      theme: {
        getState: async () => { calls.push('theme.getState'); return { shouldUseDarkColors: false, themeSource: 'system' as const } },
        subscribe: (callback: (state: { shouldUseDarkColors: boolean; themeSource: 'system' }) => void) => {
          calls.push('theme.subscribe')
          callback({ shouldUseDarkColors: false, themeSource: 'system' })
          return () => { calls.push('theme.unsubscribe') }
        },
      },
      window: {
        minimize: async () => { calls.push('window.minimize') },
        maximize: async () => { calls.push('window.maximize') },
        close: async () => { calls.push('window.close') },
        getState: async () => { calls.push('window.getState'); return { isMaximized: false, isFullScreen: false } },
      },
    }
    globalThis.window = { deepseekDesktop: bridge } as Window & typeof globalThis

    const desktop: DesktopCapabilitiesContract = createDesktopCapabilities(requireDesktopBridge())
    expect(Object.keys(desktop).sort()).toEqual([
      'app', 'clipboard', 'dialog', 'notification', 'shell', 'theme', 'updater', 'window',
    ])
    expect(await desktop.dialog.pickDirectory()).toEqual({ path: '/tmp' })
    await desktop.clipboard.writeText('hello')
    desktop.updater.subscribe(() => {})
    expect(calls).toContain('dialog.pickDirectory')
    expect(calls).toContain('clipboard.writeText:hello')
    expect(calls).toContain('updater.subscribe')
    expect(JSON.stringify(desktop)).not.toContain('ipcRenderer')
    expect(JSON.stringify(desktop)).not.toContain('invoke')
  })
})
