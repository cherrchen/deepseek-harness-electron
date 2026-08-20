/**
 * Sandboxed preload: expose the typed `deepseekDesktop` bridge only.
 * Built to a single CommonJS file — sandboxed ESM multi-file preloads do not load.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  DesktopIpcChannel,
  type DeepseekDesktopBridge,
  type HostHttpRequest,
} from '../bridge-types.ts'

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
}

contextBridge.exposeInMainWorld('deepseekDesktop', bridge)
