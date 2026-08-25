/**
 * Typed ipcMain handlers for the desktop preload bridge.
 */

import { app, ipcMain, type WebContents } from 'electron'
import {
  DesktopIpcChannel,
  type HostHttpRequest,
  type ThemeState,
  type DesktopUpdaterSnapshot,
} from './bridge-types.ts'
import { DesktopServices, parsePickDirectoryOptions } from './desktop/services.ts'
import type { HarnessTransport } from './harness/transport.ts'
import type { PluginLifecycleController } from './plugin-lifecycle.ts'
import { PluginInstallError, type PluginInstallRequest } from './plugin-install-contract.ts'
import type { PluginPackageService } from './plugin-install.ts'

const updaterSubscriptions = new WeakMap<WebContents, () => void>()
const themeSubscriptions = new WeakMap<WebContents, () => void>()

/**
 * Register desktop IPC handlers once after the Harness transport exists.
 * @param transport - Main-process Harness transport.
 * @param desktop - Desktop capability services.
 * @param isTrustedContents - Whether the sender owns the main renderer window.
 * @param getPluginLifecycle - Current Main-process plugin lifecycle controller.
 */
export function installDesktopIpc(
  transport: HarnessTransport,
  desktop: DesktopServices,
  isTrustedContents: (contents: WebContents) => boolean,
  getPluginLifecycle: () => PluginLifecycleController,
  getPluginPackages: () => PluginPackageService,
): void {
  const guard = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedContents(event.sender)) {
      throw new Error('desktop ipc: untrusted sender')
    }
  }

  const guardEvent = (event: Electron.IpcMainEvent): boolean => isTrustedContents(event.sender)

  ipcMain.handle(DesktopIpcChannel.getBootstrap, async (event) => {
    guard(event)
    return await transport.getBootstrap()
  })

  ipcMain.handle(DesktopIpcChannel.request, async (event, init: HostHttpRequest) => {
    guard(event)
    return await transport.request(init)
  })

  ipcMain.handle(DesktopIpcChannel.getVersion, (event) => {
    guard(event)
    return app.getVersion()
  })

  ipcMain.handle(DesktopIpcChannel.getPlatform, (event) => {
    guard(event)
    return process.platform
  })

  ipcMain.handle(DesktopIpcChannel.pickDirectory, async (event, options: unknown) => {
    guard(event)
    return await desktop.pickDirectory(parsePickDirectoryOptions(options))
  })

  ipcMain.handle(DesktopIpcChannel.clipboardReadText, async (event) => {
    guard(event)
    return await desktop.readClipboardText()
  })

  ipcMain.handle(DesktopIpcChannel.clipboardWriteText, async (event, text: unknown) => {
    guard(event)
    await desktop.writeClipboardText(text)
  })

  ipcMain.handle(DesktopIpcChannel.shellOpenExternal, async (event, url: unknown) => {
    guard(event)
    await desktop.openExternal(url)
  })

  ipcMain.handle(DesktopIpcChannel.shellOpenPath, async (event, path: unknown) => {
    guard(event)
    await desktop.openPath(path)
  })

  ipcMain.handle(DesktopIpcChannel.shellShowItemInFolder, async (event, path: unknown) => {
    guard(event)
    await desktop.showItemInFolder(path)
  })

  ipcMain.handle(DesktopIpcChannel.notificationShow, async (event, options: unknown) => {
    guard(event)
    return await desktop.showNotification(options)
  })

  ipcMain.handle(DesktopIpcChannel.updaterCheck, async (event) => {
    guard(event)
    await desktop.updaterCheck()
  })

  ipcMain.handle(DesktopIpcChannel.updaterDownload, async (event) => {
    guard(event)
    await desktop.updaterDownload()
  })

  ipcMain.handle(DesktopIpcChannel.updaterInstall, async (event) => {
    guard(event)
    await desktop.updaterInstall()
  })

  ipcMain.handle(DesktopIpcChannel.updaterGetState, (event) => {
    guard(event)
    return desktop.getUpdaterState()
  })

  ipcMain.handle(DesktopIpcChannel.themeGetState, (event) => {
    guard(event)
    return desktop.getThemeState()
  })

  ipcMain.handle(DesktopIpcChannel.windowMinimize, async (event) => {
    guard(event)
    await desktop.minimizeWindow()
  })

  ipcMain.handle(DesktopIpcChannel.windowMaximize, async (event) => {
    guard(event)
    await desktop.maximizeWindow()
  })

  ipcMain.handle(DesktopIpcChannel.windowClose, async (event) => {
    guard(event)
    await desktop.closeWindow()
  })

  ipcMain.handle(DesktopIpcChannel.windowGetState, (event) => {
    guard(event)
    return desktop.getWindowState()
  })

  ipcMain.handle(DesktopIpcChannel.pluginsList, async (event) => {
    guard(event)
    return await getPluginLifecycle().list()
  })

  ipcMain.handle(DesktopIpcChannel.pluginsInstall, async (event, request: PluginInstallRequest) => {
    guard(event)
    try {
      return { ok: true, result: await getPluginPackages().install(request) }
    } catch (error) {
      const failure = error instanceof PluginInstallError
        ? error
        : new PluginInstallError('package-manager-failed', 'Plugin installation failed.', String(error))
      return {
        ok: false,
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.details === undefined ? {} : { details: failure.details }),
          ...(failure.profileChanged ? { profileChanged: true } : {}),
        },
      }
    }
  })

  ipcMain.handle(DesktopIpcChannel.pluginsEnable, async (event, name: unknown) => {
    guard(event)
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('desktop ipc: plugins.enable requires a package name')
    }
    await getPluginLifecycle().enable(name)
  })

  ipcMain.handle(DesktopIpcChannel.pluginsDisable, async (event, name: unknown) => {
    guard(event)
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('desktop ipc: plugins.disable requires a package name')
    }
    await getPluginLifecycle().disable(name)
  })

  ipcMain.handle(DesktopIpcChannel.pluginsReload, async (event, name: unknown) => {
    guard(event)
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('desktop ipc: plugins.reload requires a package name')
    }
    await getPluginLifecycle().reload(name)
  })

  ipcMain.on(DesktopIpcChannel.openStream, (event, path: string) => {
    if (!guardEvent(event)) return
    const port = event.ports[0]
    if (port === undefined) return
    if (path !== '/api/events.mux' && path !== '/api/events.host') {
      port.postMessage({ type: 'error', message: `desktop ipc: unsupported stream ${path}` })
      port.close()
      return
    }
    transport.openStream(path, port)
  })

  ipcMain.on(DesktopIpcChannel.updaterSubscribe, (event) => {
    if (!guardEvent(event)) return
    const port = event.ports[0]
    if (port === undefined) return
    updaterSubscriptions.get(event.sender)?.()
    const unsubscribe = desktop.subscribeUpdater((state: DesktopUpdaterSnapshot) => {
      try {
        port.postMessage(state)
      } catch {
        // Port closed when the renderer disposed the subscription.
      }
    })
    updaterSubscriptions.set(event.sender, unsubscribe)
    port.on('close', () => {
      unsubscribe()
      updaterSubscriptions.delete(event.sender)
    })
  })

  ipcMain.on(DesktopIpcChannel.themeSubscribe, (event) => {
    if (!guardEvent(event)) return
    const port = event.ports[0]
    if (port === undefined) return
    themeSubscriptions.get(event.sender)?.()
    const unsubscribe = desktop.subscribeTheme((state: ThemeState) => {
      try {
        port.postMessage(state)
      } catch {
        // Port closed when the renderer disposed the subscription.
      }
    })
    themeSubscriptions.set(event.sender, unsubscribe)
    port.on('close', () => {
      unsubscribe()
      themeSubscriptions.delete(event.sender)
    })
  })
}
