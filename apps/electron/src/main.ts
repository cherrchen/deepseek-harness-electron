/**
 * Electron desktop entry. It supervises the upstream dsh Web application in
 * Electron's Node-compatible child mode and exposes only its random loopback
 * listener to a sandboxed BrowserWindow.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { app, BrowserWindow, dialog, session, shell } from 'electron'
import {
  HARNESS_START_TIMEOUT_MS,
  harnessArguments,
  parseHarnessReadyUrl,
  resolveDshBin,
} from './runtime.ts'

type HarnessProcess = ChildProcessByStdio<null, Readable, Readable>

let harness: HarnessProcess | undefined
const windows = new Set<BrowserWindow>()
let quitting = false

/** Start dsh and resolve only after its complete Web composition is ready. */
async function startHarness(): Promise<{ child: HarnessProcess; url: string }> {
  const dshBin = resolveDshBin(app.getAppPath())
  const child = spawn(process.execPath, harnessArguments(dshBin), {
    cwd: app.getPath('home'),
    env: {
      ...process.env,
      DSH_HOME: join(app.getPath('userData'), 'dsh-home'),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return await new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`DeepSeek Harness did not become ready within ${String(HARNESS_START_TIMEOUT_MS / 1000)} seconds.`))
    }, HARNESS_START_TIMEOUT_MS)

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }

    child.once('error', fail)
    child.once('exit', (code, signal) => {
      fail(new Error(`DeepSeek Harness exited before startup (code ${String(code)}, signal ${String(signal)}).`))
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      process.stdout.write(text)
      output += text
      const url = parseHarnessReadyUrl(output)
      if (url === undefined || settled) return
      settled = true
      clearTimeout(timer)
      resolve({ child, url })
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
    })
  })
}

/** Open one hardened desktop window for the local Harness origin. */
async function createWindow(url: string): Promise<BrowserWindow> {
  const allowedOrigin = new URL(url).origin
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  windows.add(window)
  window.once('closed', () => { windows.delete(window) })
  window.once('ready-to-show', () => { window.show() })
  window.webContents.on('will-navigate', (event, nextUrl) => {
    if (new URL(nextUrl).origin !== allowedOrigin) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    const protocol = new URL(nextUrl).protocol
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(nextUrl)
    return { action: 'deny' }
  })
  await window.loadURL(url)
  return window
}

/** Stop the supervised process, escalating only after its shutdown window. */
async function stopHarness(child: HarnessProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

app.on('window-all-closed', () => { app.quit() })
app.on('before-quit', (event) => {
  if (quitting || harness === undefined) return
  event.preventDefault()
  quitting = true
  void stopHarness(harness).finally(() => { app.quit() })
})

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  const started = await startHarness()
  harness = started.child
  harness.once('exit', (code, signal) => {
    if (quitting) return
    dialog.showErrorBox(
      'DeepSeek Harness stopped',
      `The local Harness process exited (code ${String(code)}, signal ${String(signal)}).`,
    )
    app.quit()
  })
  await createWindow(started.url)
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('DeepSeek Harness failed to start', message)
  app.quit()
})
