/**
 * Desktop renderer entry: install Host stream stand-in and boot globals, then
 * mount the shared AppWebEntry kernel on dsh-electron://localhost.
 */

import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import { installHostBootstrap } from './bootstrap.ts'
import { installDesktopClipboardShim } from './desktop/clipboard-shim.ts'
import { installWindowChrome, reconcileWindowChromeLayout } from './desktop/window-chrome.ts'
import { installDesktopWebSocket } from './transport/websocket-shim.ts'
import './desktop/window-chrome.css'

async function main(): Promise<void> {
  installDesktopWebSocket()
  installDesktopClipboardShim()
  const disposeWindowChrome = await installWindowChrome()
  await installHostBootstrap()
  const el = document.getElementById('root')
  if (el === null) throw new Error('desktop renderer: missing #root')
  await new AppWebEntry(el).run()
  reconcileWindowChromeLayout(document)
  window.addEventListener('beforeunload', () => { disposeWindowChrome() }, { once: true })
}

void main().catch((error: unknown) => {
  console.error(error)
  const root = document.getElementById('root')
  if (root !== null) {
    root.textContent = error instanceof Error ? error.message : String(error)
  }
})
