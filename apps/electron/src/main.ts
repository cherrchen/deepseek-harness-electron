/**
 * Electron desktop entry. It supervises the upstream dsh Web backend as a
 * Main-only compatibility process, loads the Electron-owned renderer over
 * `dsh-electron://localhost`, and owns desktop OS capabilities.
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  session,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import { showAboutWindow } from './about.ts'
import {
  allowsClipboardWrite,
  contextMenuTemplate,
  desktopWindowChrome,
  isAllowedExternalUrl,
} from './desktop/index.ts'
import { DesktopServices } from './desktop/services.ts'
import { stopHarness } from './harness/process.ts'
import { HttpHarnessTransport } from './harness/transport.ts'
import { installDesktopIpc } from './ipc.ts'
import { readDesktopManifest, resolveUpdateRepository } from './manifest.ts'
import { RENDERER_ENTRY_URL, RENDERER_ORIGIN } from './bridge-types.ts'
import { loadUpdateChannel, saveUpdateChannel, type UpdateChannel } from './preferences.ts'
import {
  installRendererProtocol,
  registerRendererScheme,
  resolveRendererRoot,
} from './protocol.ts'
import { prepareHostRuntimeOverlay } from './runtime-overlay.ts'
import {
  ensureRuntimePluginsLinked,
  discoverManagedPlugins,
  profileModuleLinkPath,
  pluginRuntimeModuleLinkPath,
  ensureSymlink,
} from './runtime-plugins.ts'
import {
  HARNESS_START_TIMEOUT_MS,
  harnessArguments,
  parseHarnessReadyUrl,
  resolveDshBin,
  resolveHarnessHome,
} from './runtime.ts'
import { DynamicIncludeCompositionBackend, effectivePluginRoster } from './plugin-runtime-config.ts'
import { loadPluginState, reconcilePluginState, savePluginState } from './plugin-state.ts'
import { PluginLifecycleController } from './plugin-lifecycle.ts'
import { RemotePluginInventoryProbe } from './plugin-inventory-probe.ts'
import {
  trayIconNeedsLogicalLoad,
  trayIconPath,
  trayIconPixelSize,
  trayIconRasterScale,
  trayIconSize,
} from './tray.ts'
import { createUpdater, type UpdaterController } from './updater.ts'
import * as process from 'node:process'

type HarnessProcess = ChildProcessByStdio<null, Readable, Readable>

let harness: HarnessProcess | undefined
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let updater: UpdaterController | undefined
let pluginLifecycle: PluginLifecycleController | undefined
let inventoryProbe: RemotePluginInventoryProbe | undefined
let quitting = false
let stopping = false
const transport = new HttpHarnessTransport()
const desktop = new DesktopServices({
  getWindow: () => mainWindow,
  getUpdater: () => updater,
  showMainWindow,
})

registerRendererScheme()

/** Start dsh and resolve only after its complete Web composition is ready. */
async function startHarness(dshBin: string, harnessHome: string, hostPatch: string): Promise<{ child: HarnessProcess; url: string }> {
  const child = spawn(process.execPath, harnessArguments(dshBin, hostPatch), {
    cwd: app.getPath('home'),
    env: {
      ...process.env,
      DSH_HOME: harnessHome,
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
      const timeoutError = new Error(
        `DeepSeek Harness did not become ready within ${String(HARNESS_START_TIMEOUT_MS / 1000)} seconds.`,
      )
      void stopHarness(child).then(
        () => { reject(timeoutError) },
        (cleanupError: unknown) => {
          reject(new AggregateError(
            [timeoutError, cleanupError],
            `${timeoutError.message} Harness shutdown also failed.`,
          ))
        },
      )
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

function logPlugins(message: string, ...details: unknown[]): void {
  console.info('[electron:plugins]', message, ...details)
}

/** Open one hardened desktop window for the Electron-owned renderer. */
async function createWindow(): Promise<BrowserWindow> {
  const allowedOrigin = RENDERER_ORIGIN
  const preload = join(app.getAppPath(), 'lib', 'preload', 'index.cjs')
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
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`desktop preload failed (${preloadPath}):`, error)
  })
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
    if (isAllowedExternalUrl(nextUrl)) void desktop.openExternal(nextUrl)
    return { action: 'deny' }
  })
  window.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate(contextMenuTemplate(params, !app.isPackaged)).popup({ window })
  })

  // Clipboard OS access goes through desktop.clipboard; keep a narrow write
  // allowance until the renderer shim is the only writer in packaged builds.
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    contents === window.webContents
      && allowsClipboardWrite(permission, requestingOrigin, allowedOrigin))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window.webContents
      && allowsClipboardWrite(permission, safeOrigin(details.requestingUrl), allowedOrigin))
  })

  await window.loadURL(RENDERER_ENTRY_URL)
  window.show()
  return window
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
  // Drain in-flight plugin mutations before tearing down Host.
  await pluginLifecycle?.list().catch(() => undefined)
  await inventoryProbe?.dispose().catch(() => undefined)
  await transport.stop()
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
    screen.on('display-metrics-changed', refreshTrayIcon)
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${app.name}`, click: showMainWindow },
    installOrCheck,
    updateChannel,
    { label: `About ${app.name}`, click: showAbout },
    { type: 'separator' },
    { label: 'Quit', click: requestQuit },
  ]))
  desktop.emitUpdater()
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
  const trayDir = join(app.getAppPath(), 'build', 'tray')
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(trayDir, 'deepseekTemplate.png'))
    if (icon.isEmpty()) throw new Error('The packaged tray icon could not be loaded.')
    const retina = nativeImage.createFromPath(join(trayDir, 'deepseekTemplate@2x.png'))
    if (!retina.isEmpty()) {
      const { width, height } = retina.getSize()
      icon.addRepresentation({ scaleFactor: 2, width, height, buffer: retina.toPNG() })
    }
    icon.setTemplateImage(true)
    return icon
  }

  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const dip = trayIconSize(process.platform)
  const pixel = trayIconPixelSize(dip, scaleFactor)
  const path = trayIconPath(
    app.getAppPath(),
    process.platform,
    nativeTheme.shouldUseDarkColors,
    scaleFactor,
  )
  const icon = trayIconNeedsLogicalLoad(process.platform, dip, pixel)
    ? nativeImage.createFromBuffer(readFileSync(path), {
      width: dip,
      height: dip,
      scaleFactor: trayIconRasterScale(dip, pixel),
    })
    : nativeImage.createFromPath(path)
  if (icon.isEmpty()) throw new Error('The packaged tray icon could not be loaded.')
  return icon
}

function refreshTrayIcon(): void {
  if (tray === undefined || tray.isDestroyed()) return
  tray.setImage(createTrayIcon())
}

async function refreshRendererForPluginLifecycle(): Promise<void> {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) return
  logPlugins('refreshing renderer after client plugin lifecycle change')
  await window.loadURL(RENDERER_ENTRY_URL)
}

function safeOrigin(value: string): string {
  try { return new URL(value).origin } catch { return '' }
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
  void transport.stop().then(() => stopHarness(child)).finally(() => { app.quit() })
})

const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) {
  app.quit()
} else {
  void app.whenReady().then(async () => {
    installRendererProtocol(resolveRendererRoot(app.getAppPath()), transport.harnessProxy)
    const appPath = app.getAppPath()
    const harnessHome = resolveHarnessHome(app.getPath('home'))
    const managedPlugins = discoverManagedPlugins(appPath)
    ensureRuntimePluginsLinked(appPath, harnessHome)
    const overlay = await prepareHostRuntimeOverlay(appPath, app.getPath('userData'), harnessHome)
    const loadedState = loadPluginState(overlay.pluginStatePath)
    for (const warning of loadedState.warnings) console.warn(warning)
    const reconciled = reconcilePluginState(
      loadedState.state,
      managedPlugins.filter(plugin => plugin.manageable).map(plugin => plugin.name),
    )
    if (reconciled.removed.length > 0) {
      console.warn('[electron:plugins] ignoring stale disabled plugins', reconciled.removed)
    }
    const composition = new DynamicIncludeCompositionBackend(overlay.pluginConfigPath)
    await composition.apply(effectivePluginRoster(managedPlugins, reconciled.state))
    if (!existsSync(overlay.pluginStatePath)) {
      await savePluginState(overlay.pluginStatePath, reconciled.state)
    }
    logPlugins('desired startup roster', effectivePluginRoster(managedPlugins, reconciled.state).map(plugin => plugin.name))
    installDesktopIpc(
      transport,
      desktop,
      contents => mainWindow !== undefined && contents === mainWindow.webContents,
      () => {
        if (pluginLifecycle === undefined) throw new Error('desktop ipc: plugin lifecycle is unavailable')
        return pluginLifecycle
      },
    )

    const started = await startHarness(resolveDshBin(appPath), harnessHome, overlay.patchPath)
    harness = started.child
    await transport.start(started.url)
    inventoryProbe = new RemotePluginInventoryProbe(transport)
    pluginLifecycle = new PluginLifecycleController(
      managedPlugins,
      reconciled.state,
      overlay.pluginStatePath,
      composition,
      inventoryProbe,
      (plugin) => {
        ensureSymlink(profileModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
        ensureSymlink(pluginRuntimeModuleLinkPath(harnessHome, plugin.name), plugin.rootPath)
      },
      refreshRendererForPluginLifecycle,
    )
    harness.once('exit', (code, signal) => {
      if (quitting) return
      dialog.showErrorBox(
        `${app.name} stopped`,
        `The local Harness process exited (code ${String(code)}, signal ${String(signal)}).`,
      )
      requestQuit()
    })
    await createWindow()
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
