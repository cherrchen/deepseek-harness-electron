import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  const autoUpdater = {
    allowPrerelease: false,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(),
    logger: undefined as unknown,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const eventHandlers = handlers.get(event) ?? []
      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
      return autoUpdater
    }),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
  }
  return {
    app: { isPackaged: true, name: 'DeepSeek Harness', getVersion: () => '1.0.0' },
    autoUpdater,
    dialog: {
      showMessageBox: vi.fn<(options: unknown) => Promise<{ response: number }>>()
        .mockResolvedValue({ response: 1 }),
    },
    handlers,
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  dialog: mocks.dialog,
  Notification: class {
    static isSupported = () => false
    on = vi.fn()
    show = vi.fn()
  },
}))

vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.autoUpdater } }))

import { createUpdater } from '../src/updater.ts'

describe('Electron updater controller', () => {
  beforeEach(() => {
    mocks.app.isPackaged = true
    mocks.autoUpdater.allowPrerelease = false
    mocks.autoUpdater.checkForUpdates.mockReset()
    mocks.autoUpdater.quitAndInstall.mockReset()
    mocks.autoUpdater.setFeedURL.mockReset()
    mocks.dialog.showMessageBox.mockClear()
    mocks.handlers.clear()
  })

  it('shows checking and no-update states during a manual check', async () => {
    let resolveFeed: (value: string) => void = () => {}
    const feed = new Promise<string>((resolve) => { resolveFeed = resolve })
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.0.0' },
    })
    const controller = createController({ resolveFeed: () => feed })
    const check = controller.check(true)
    expect(controller.state).toBe('checking')
    resolveFeed('https://example.test/release')
    await check
    expect(controller.state).toBe('idle')
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'DeepSeek Harness is up to date',
    }))
  })

  it('configures prerelease discovery and reports background download state', async () => {
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.1.0-rc.1' },
      downloadPromise: null,
    })
    const controller = createController({ channel: 'prerelease' })
    await controller.check(true)
    expect(mocks.autoUpdater.allowPrerelease).toBe(true)
    expect(mocks.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://example.test/release',
    })
    expect(controller.state).toBe('downloading')
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Update found',
      detail: 'Version 1.1.0-rc.1 is downloading in the background.',
    }))
  })

  it('keeps the stable channel out of prerelease updates', async () => {
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.0.0' },
    })
    const controller = createController({ channel: 'stable' })
    await controller.check(false)
    expect(mocks.autoUpdater.allowPrerelease).toBe(false)
  })

  it('logs the technical updater error but shows only concise user guidance', async () => {
    const technicalError = new Error('HTTP 503 /Users/person/secret stack and response body')
    mocks.autoUpdater.checkForUpdates.mockRejectedValue(technicalError)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = createController()
    await controller.check(true)
    expect(consoleError).toHaveBeenCalledWith('Update check or download failed', technicalError)
    const dialogOptions: unknown = mocks.dialog.showMessageBox.mock.calls.at(-1)?.[0]
    expect(dialogOptions).toEqual(expect.objectContaining({
      message: 'Unable to check for updates',
      detail: 'GitHub Releases could not be reached. Check your network connection and try again.',
    }))
    expect(JSON.stringify(dialogOptions)).not.toContain('/Users/person/secret')
    consoleError.mockRestore()
  })
})

function createController(overrides: {
  channel?: 'prerelease' | 'stable'
  resolveFeed?: () => Promise<string | undefined>
} = {}) {
  return createUpdater({
    channel: overrides.channel ?? 'prerelease',
    getWindow: () => undefined,
    onChannelChanged: vi.fn(),
    onStateChanged: vi.fn(),
    prepareToInstall: vi.fn().mockResolvedValue(undefined),
    repository: { owner: 'owner', repo: 'desktop' },
    resolveFeed: overrides.resolveFeed ?? vi.fn().mockResolvedValue('https://example.test/release'),
  })
}
