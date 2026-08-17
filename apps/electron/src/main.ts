/**
 * Electron desktop entry. It supervises the upstream dsh Web application,
 * keeps its loopback renderer sandboxed, and owns desktop-only lifecycle UI.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import { showAboutWindow } from './about.ts'
import {
  allowsClipboardWrite,
  contextMenuTemplate,
  DESKTOP_CHROME_CSS,
  desktopChromeScript,
  desktopWindowChrome,
} from './desktop.ts'
import { readDesktopManifest, resolveUpdateRepository } from './manifest.ts'
import { loadUpdateChannel, saveUpdateChannel, type UpdateChannel } from './preferences.ts'
import {
  HARNESS_START_TIMEOUT_MS,
  harnessArguments,
  parseHarnessReadyUrl,
  resolveDshBin,
  resolveHarnessHome,
} from './runtime.ts'
import { trayIconPath, trayIconSize } from './tray.ts'
import { createUpdater, type UpdaterController } from './updater.ts'

type HarnessProcess = ChildProcessByStdio<null, Readable, Readable>

let harness: HarnessProcess | undefined
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let updater: UpdaterController | undefined
let quitting = false
let stopping = false

/** Start dsh and resolve only after its complete Web composition is ready. */
async function startHarness(): Promise<{ child: HarnessProcess; url: string }> {
  const dshBin = resolveDshBin(app.getAppPath())
  const child = spawn(process.execPath, harnessArguments(dshBin), {
    cwd: app.getPath('home'),
    env: {
      ...process.env,
      DSH_HOME: resolveHarnessHome(app.getPath('home')),
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
    child.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk) })
  })
}

/** Open one hardened desktop window for the local Harness origin. */
async function createWindow(url: string): Promise<BrowserWindow> {
  const allowedOrigin = new URL(url).origin
  const window = new BrowserWindow({
    ...desktopWindowChrome(process.platform),
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8f9fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window.hide()
  })
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.webContents.on('will-navigate', (event, nextUrl) => {
    if (safeOrigin(nextUrl) !== allowedOrigin) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    const protocol = safeProtocol(nextUrl)
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(nextUrl)
    return { action: 'deny' }
  })
  window.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate(contextMenuTemplate(params, !app.isPackaged)).popup({ window })
  })

  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    contents === window.webContents
      && allowsClipboardWrite(permission, requestingOrigin, allowedOrigin))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window.webContents
      && allowsClipboardWrite(permission, safeOrigin(details.requestingUrl), allowedOrigin))
  })

  await window.loadURL(url)
  await window.webContents.insertCSS(DESKTOP_CHROME_CSS)
  await window.webContents.executeJavaScript(desktopChromeScript(app.name), true)
  window.show()
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

function showMainWindow(): void {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function requestQuit(): void {
  quitting = true
  app.quit()
}

async function prepareToInstall(): Promise<void> {
  quitting = true
  stopping = true
  const child = harness
  harness = undefined
  if (child !== undefined) await stopHarness(child)
}

function installDesktopMenus(): void {
  const checkForUpdates = (): void => { void updater?.check(true) }
  const installOrCheck = updateMenuItem(checkForUpdates)
  const updateChannel = updateChannelMenu()
  const showAbout = (): void => { void showAboutWindow(mainWindow) }
  const appMenu: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, click: showAbout },
        installOrCheck,
        updateChannel,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${app.name}`, accelerator: 'CommandOrControl+Q', click: requestQuit },
      ],
    }]
    : [{
      label: 'File',
      submenu: [
        { label: `Show ${app.name}`, click: showMainWindow },
        installOrCheck,
        updateChannel,
        { label: `About ${app.name}`, click: showAbout },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CommandOrControl+Q', click: requestQuit },
      ],
    }]
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...appMenu,
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : [])] },
  ]))

  if (tray === undefined) {
    tray = new Tray(createTrayIcon())
    tray.setToolTip(app.name)
    tray.on('click', showMainWindow)
    nativeTheme.on('updated', refreshTrayIcon)
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${app.name}`, click: showMainWindow },
    installOrCheck,
    updateChannel,
    { label: `About ${app.name}`, click: showAbout },
    { type: 'separator' },
    { label: 'Quit', click: requestQuit },
  ]))
}

function updateMenuItem(checkForUpdates: () => void): MenuItemConstructorOptions {
  if (updater?.state === 'checking') return { label: 'Checking for Updates…', enabled: false }
  if (updater?.state === 'downloading') {
    return {
      label: updater.progress === undefined
        ? 'Downloading Update…'
        : `Downloading Update… ${String(updater.progress)}%`,
      enabled: false,
    }
  }
  if (updater?.state === 'downloaded') {
    return { label: 'Restart to Install Update', click: () => { void updater?.installDownloaded() } }
  }
  return { label: 'Check for Updates…', click: checkForUpdates }
}

function updateChannelMenu(): MenuItemConstructorOptions {
  const enabled = updater?.state !== 'checking'
    && updater?.state !== 'downloading'
    && updater?.state !== 'downloaded'
  const select = (channel: UpdateChannel): void => {
    updater?.setChannel(channel)
    void updater?.check(true)
  }
  return {
    label: 'Update Channel',
    submenu: [
      { label: 'Pre-Release', type: 'radio', checked: updater?.channel === 'prerelease', enabled, click: () => { select('prerelease') } },
      { label: 'Stable / Release', type: 'radio', checked: updater?.channel === 'stable', enabled, click: () => { select('stable') } },
    ],
  }
}

function createTrayIcon(): Electron.NativeImage {
  const source = nativeImage.createFromPath(trayIconPath(app.getAppPath(), process.platform, nativeTheme.shouldUseDarkColors))
  if (source.isEmpty()) throw new Error('The packaged tray icon could not be loaded.')
  const size = trayIconSize(process.platform)
  const icon = source.resize({ width: size, height: size })
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  return icon
}

function refreshTrayIcon(): void {
  if (tray === undefined || tray.isDestroyed()) return
  tray.setImage(createTrayIcon())
}

function safeOrigin(value: string): string {
  try { return new URL(value).origin } catch { return '' }
}

function safeProtocol(value: string): string {
  try { return new URL(value).protocol } catch { return '' }
}

app.on('window-all-closed', () => {})
app.on('activate', showMainWindow)
app.on('second-instance', showMainWindow)
app.on('before-quit', (event) => {
  if (stopping || harness === undefined) return
  event.preventDefault()
  quitting = true
  stopping = true
  const child = harness
  harness = undefined
  void stopHarness(child).finally(() => { app.quit() })
})

const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) {
  app.quit()
} else {
  void app.whenReady().then(async () => {
    const started = await startHarness()
    harness = started.child
    harness.once('exit', (code, signal) => {
      if (quitting) return
      dialog.showErrorBox(
        `${app.name} stopped`,
        `The local Harness process exited (code ${String(code)}, signal ${String(signal)}).`,
      )
      requestQuit()
    })
    await createWindow(started.url)
    const repository = resolveUpdateRepository(readDesktopManifest(app.getAppPath()))
    if (repository === undefined) throw new Error('The packaged GitHub update repository is missing.')
    updater = createUpdater({
      channel: loadUpdateChannel(app.getPath('userData')),
      getWindow: () => mainWindow,
      onChannelChanged: (channel) => {
        try {
          saveUpdateChannel(app.getPath('userData'), channel)
        } catch (error: unknown) {
          console.error('Unable to save desktop preferences', error)
        }
      },
      onStateChanged: installDesktopMenus,
      prepareToInstall,
      repository,
    })
    installDesktopMenus()
    void updater.check(false)
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(`${app.name} failed to start`, message)
    requestQuit()
  })
}
