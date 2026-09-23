/** Private bridge for the Main-owned proxy credential prompt. */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('networkCredential', {
  submit: (input: unknown): Promise<void> => ipcRenderer.invoke('deepseek-desktop:network:credential-submit', input),
})
