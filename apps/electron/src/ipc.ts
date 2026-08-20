/**
 * Typed ipcMain handlers for the desktop preload bridge.
 */

import { app, ipcMain, type WebContents } from 'electron'
import {
  DesktopIpcChannel,
  type HostHttpRequest,
} from './bridge-types.ts'
import type { HarnessProxy } from './harness-proxy.ts'

/**
 * Register desktop IPC handlers once after the Harness proxy exists.
 * @param harness - Main-process compatibility proxy.
 * @param isTrustedContents - Whether the sender owns the main renderer window.
 */
export function installDesktopIpc(
  harness: HarnessProxy,
  isTrustedContents: (contents: WebContents) => boolean,
): void {
  const guard = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedContents(event.sender)) {
      throw new Error('desktop ipc: untrusted sender')
    }
  }

  ipcMain.handle(DesktopIpcChannel.getBootstrap, async (event) => {
    guard(event)
    return await harness.getBootstrap()
  })

  ipcMain.handle(DesktopIpcChannel.request, async (event, init: HostHttpRequest) => {
    guard(event)
    return await harness.request(init)
  })

  ipcMain.handle(DesktopIpcChannel.getVersion, async (event) => {
    guard(event)
    return app.getVersion()
  })

  ipcMain.handle(DesktopIpcChannel.getPlatform, async (event) => {
    guard(event)
    return process.platform
  })

  ipcMain.on(DesktopIpcChannel.openStream, (event, path: string) => {
    if (!isTrustedContents(event.sender)) return
    const port = event.ports[0]
    if (port === undefined) return
    if (path !== '/api/events.mux' && path !== '/api/events.host') {
      port.postMessage({ type: 'error', message: `desktop ipc: unsupported stream ${path}` })
      port.close()
      return
    }
    harness.openStream(path, port)
  })
}
