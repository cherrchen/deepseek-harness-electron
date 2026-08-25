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
  type HostStreamHandlers,
  type HostStreamPortMessage,
  type PickDirectoryOptions,
  type PluginInstallRequest,
  type PluginInstallWireResult,
  type ThemeState,
} from '../bridge-types.ts'

function subscribeChannel<T>(
  channel: string,
  callback: (value: T) => void,
  decode: (value: unknown) => T,
): DesktopUnsubscribe {
  const { port1, port2 } = new MessageChannel()
  const onMessage = (event: MessageEvent): void => {
    callback(decode(event.data))
  }
  port2.addEventListener('message', onMessage)
  port2.start()
  ipcRenderer.postMessage(channel, null, [port1])
  return () => {
    port2.removeEventListener('message', onMessage)
    port2.close()
  }
}

/**
 * Bridge a Host event stream while keeping the MessagePort in preload.
 * Returning MessagePort across contextBridge yields a non-functional clone
 * in the isolated world (`addEventListener` missing), which breaks workspace
 * and session baselines that wait on stream `onConnected`.
 * @param path - Host event path.
 * @param handlers - Renderer callbacks (functions cross contextBridge safely).
 * @returns disposer that aborts the stream.
 */
function openHostStream(
  path: '/api/events.mux' | '/api/events.host',
  handlers: HostStreamHandlers,
): DesktopUnsubscribe {
  const { port1, port2 } = new MessageChannel()
  let closed = false
  const cleanup = (): void => {
    if (closed) return
    closed = true
    port2.removeEventListener('message', onMessage)
    try {
      port2.postMessage({ type: 'abort' } satisfies HostStreamPortMessage)
    } catch {
      // Port already closed by Main.
    }
    try {
      port2.close()
    } catch {
      // Port already closed.
    }
  }
  const onMessage = (event: MessageEvent): void => {
    const message = event.data as HostStreamPortMessage
    switch (message.type) {
      case 'open':
        handlers.onOpen()
        break
      case 'message':
        handlers.onMessage(message.data)
        break
      case 'close':
        handlers.onClose()
        cleanup()
        break
      case 'error':
        handlers.onError(message.message)
        handlers.onClose()
        cleanup()
        break
      case 'abort':
        break
      default: {
        const _exhaustive: never = message
        void _exhaustive
      }
    }
  }
  port2.addEventListener('message', onMessage)
  port2.start()
  ipcRenderer.postMessage(DesktopIpcChannel.openStream, path, [port1])
  return cleanup
}

const bridge: DeepseekDesktopBridge = {
  host: {
    getBootstrap: () => ipcRenderer.invoke(DesktopIpcChannel.getBootstrap),
    request: (init: HostHttpRequest) => ipcRenderer.invoke(DesktopIpcChannel.request, init),
    openStream: openHostStream,
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
      subscribeChannel(
        DesktopIpcChannel.updaterSubscribe,
        callback,
        value => value as DesktopUpdaterSnapshot,
      ),
  },
  theme: {
    getState: () => ipcRenderer.invoke(DesktopIpcChannel.themeGetState),
    subscribe: (callback: (state: ThemeState) => void) =>
      subscribeChannel(
        DesktopIpcChannel.themeSubscribe,
        callback,
        value => value as ThemeState,
      ),
  },
  window: {
    minimize: () => ipcRenderer.invoke(DesktopIpcChannel.windowMinimize),
    maximize: () => ipcRenderer.invoke(DesktopIpcChannel.windowMaximize),
    close: () => ipcRenderer.invoke(DesktopIpcChannel.windowClose),
    getState: () => ipcRenderer.invoke(DesktopIpcChannel.windowGetState),
  },
  plugins: {
    list: () => ipcRenderer.invoke(DesktopIpcChannel.pluginsList),
    install: async (request: PluginInstallRequest) => {
      const response = await ipcRenderer.invoke(DesktopIpcChannel.pluginsInstall, request) as PluginInstallWireResult
      if (response.ok) return response.result
      const error = new Error(response.error.message) as Error & { code: string; details?: string; profileChanged?: boolean }
      error.code = response.error.code
      if (response.error.details !== undefined) error.details = response.error.details
      if (response.error.profileChanged === true) error.profileChanged = true
      throw error
    },
    enable: (name: string) => ipcRenderer.invoke(DesktopIpcChannel.pluginsEnable, name),
    disable: (name: string) => ipcRenderer.invoke(DesktopIpcChannel.pluginsDisable, name),
    reload: (name: string) => ipcRenderer.invoke(DesktopIpcChannel.pluginsReload, name),
  },
}

contextBridge.exposeInMainWorld('deepseekDesktop', bridge)
