import type { BrowserWindow, MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import { app, dialog, Notification } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

export interface UpdaterController {
  check(manual: boolean): Promise<void>
  installDownloaded(): Promise<void>
  readonly updateDownloaded: boolean
}

interface UpdaterOptions {
  allowPrerelease: boolean
  getWindow: () => BrowserWindow | undefined
  onStateChanged: () => void
  prepareToInstall: () => Promise<void>
}

/** Configure silent GitHub update downloads and the manual update entry point. */
export function createUpdater(options: UpdaterOptions): UpdaterController {
  let downloaded = false
  let downloadedVersion: string | undefined
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = options.allowPrerelease
  autoUpdater.logger = console

  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    downloadedVersion = info.version
    options.onStateChanged()
    notifyDownloaded(info.version, () => { void controller.installDownloaded() })
  })

  const controller: UpdaterController = {
    get updateDownloaded() { return downloaded },
    async check(manual) {
      const parent = options.getWindow()
      if (!app.isPackaged) {
        if (manual) await showMessage(parent, {
          type: 'info',
          message: 'Updates are checked in packaged builds',
          detail: 'Build and install a release package to test the GitHub update channel.',
        })
        return
      }
      if (downloaded) {
        if (manual) await promptToInstall(parent, downloadedVersion, () => controller.installDownloaded())
        return
      }
      try {
        const result = await autoUpdater.checkForUpdates()
        if (!manual || result?.isUpdateAvailable === true) return
        await showMessage(parent, {
          type: 'info',
          message: 'DeepSeek Harness is up to date',
          detail: `Version ${app.getVersion()} is the newest available version for this update channel.`,
        })
      } catch (error: unknown) {
        console.error('Update check failed', error)
        if (!manual) return
        await showMessage(parent, {
          type: 'error',
          message: 'Unable to check for updates',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    },
    async installDownloaded() {
      if (!downloaded) return
      await options.prepareToInstall()
      autoUpdater.quitAndInstall(false, true)
    },
  }
  return controller
}

function notifyDownloaded(version: string, install: () => void): void {
  const title = 'DeepSeek Harness update ready'
  const body = `Version ${version} was downloaded. Click to restart and install it.`
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body })
    notification.on('click', install)
    notification.show()
    return
  }
  void promptToInstall(undefined, version, () => {
    install()
    return Promise.resolve()
  })
}

async function promptToInstall(
  parent: BrowserWindow | undefined,
  version: string | undefined,
  install: () => Promise<void>,
): Promise<void> {
  const result = await showMessage(parent, {
    type: 'info',
    buttons: ['Restart and install', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: 'Update ready to install',
    detail: version === undefined
      ? 'Restart DeepSeek Harness to finish installing the downloaded update.'
      : `Version ${version} is ready. Restart DeepSeek Harness to finish installing it.`,
  })
  if (result.response === 0) await install()
}

function showMessage(
  parent: BrowserWindow | undefined,
  options: MessageBoxOptions,
): Promise<MessageBoxReturnValue> {
  return parent === undefined ? dialog.showMessageBox(options) : dialog.showMessageBox(parent, options)
}
