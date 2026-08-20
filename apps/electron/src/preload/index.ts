/**
 * Sandboxed preload: expose the typed `deepseekDesktop` bridge only.
 * Built to a single CommonJS file — sandboxed ESM multi-file preloads do not load.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  DesktopIpcChannel,
  type DeepseekDesktopBridge,
  type DesktopUnsubscribe,
  type DesktopUpdaterSnapshot,
  type HostHttpRequest,
  type PickDirectoryOptions,
  type ThemeState,
} from '../bridge-types.ts'

function subscribeChannel<T>(channel: string, callback: (value: T) => void): DesktopUnsubscribe {
  const { port1, port2 } = new MessageChannel()
  const onMessage = (event: MessageEvent): void => {
    callback(event.data as T)
  }
  port2.addEventListener('message', onMessage)
  port2.start()
  ipcRenderer.postMessage(channel, null, [port1])
  return () => {
    port2.removeEventListener('message', onMessage)
    port2.close()
  }
}

const bridge: DeepseekDesktopBridge = {
  host: {
    getBootstrap: () => ipcRenderer.invoke(DesktopIpcChannel.getBootstrap),
    request: (init: HostHttpRequest) => ipcRenderer.invoke(DesktopIpcChannel.request, init),
    openStream: path => new Promise((resolve, reject) => {
      const { port1, port2 } = new MessageChannel()
      try {
        ipcRenderer.postMessage(DesktopIpcChannel.openStream, path, [port1])
        port2.start()
        resolve(port2)
      } catch (error: unknown) {
        reject(error)
      }
    }),
  },
  app: {
    getVersion: () => ipcRenderer.invoke(DesktopIpcChannel.getVersion),
    getPlatform: () => ipcRenderer.invoke(DesktopIpcChannel.getPlatform),
  },
  dialog: {
    pickDirectory: (options?: PickDirectoryOptions) =>
      ipcRenderer.invoke(DesktopIpcChannel.pickDirectory, options),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(DesktopIpcChannel.clipboardReadText),
    writeText: (text: string) => ipcRenderer.invoke(DesktopIpcChannel.clipboardWriteText, text),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(DesktopIpcChannel.shellOpenExternal, url),
    openPath: (path: string) => ipcRenderer.invoke(DesktopIpcChannel.shellOpenPath, path),
    showItemInFolder: (path: string) =>
      ipcRenderer.invoke(DesktopIpcChannel.shellShowItemInFolder, path),
  },
  notification: {
    show: options => ipcRenderer.invoke(DesktopIpcChannel.notificationShow, options),
  },
  updater: {
    check: () => ipcRenderer.invoke(DesktopIpcChannel.updaterCheck),
    download: () => ipcRenderer.invoke(DesktopIpcChannel.updaterDownload),
    install: () => ipcRenderer.invoke(DesktopIpcChannel.updaterInstall),
    getState: () => ipcRenderer.invoke(DesktopIpcChannel.updaterGetState),
    subscribe: (callback: (state: DesktopUpdaterSnapshot) => void) =>
      subscribeChannel(DesktopIpcChannel.updaterSubscribe, callback),
  },
  theme: {
    getState: () => ipcRenderer.invoke(DesktopIpcChannel.themeGetState),
    subscribe: (callback: (state: ThemeState) => void) =>
      subscribeChannel(DesktopIpcChannel.themeSubscribe, callback),
  },
  window: {
    minimize: () => ipcRenderer.invoke(DesktopIpcChannel.windowMinimize),
    maximize: () => ipcRenderer.invoke(DesktopIpcChannel.windowMaximize),
    close: () => ipcRenderer.invoke(DesktopIpcChannel.windowClose),
    getState: () => ipcRenderer.invoke(DesktopIpcChannel.windowGetState),
  },
}

contextBridge.exposeInMainWorld('deepseekDesktop', bridge)
