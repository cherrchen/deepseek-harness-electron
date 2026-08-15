import type {
  BrowserWindowConstructorOptions,
  ContextMenuParams,
  MenuItemConstructorOptions,
} from 'electron'

/** Height reserved above the upstream Web UI for draggable desktop chrome. */
export const TITLE_BAR_HEIGHT = 40

/** Product name displayed by desktop-owned chrome and windows. */
export const APPLICATION_NAME = 'DeepSeek Harness'

/** Command-line switch that admits GitHub pre-release versions during update checks. */
export const ALLOW_PRERELEASE_ARGUMENT = '--allow-prerelease-updates'

/** Minimal package metadata consumed by the desktop about window. */
export interface DesktopManifest {
  homepage?: unknown
  repository?: unknown
}

/** Window options shared by the main and about windows. */
export function desktopWindowChrome(platform: NodeJS.Platform): Pick<BrowserWindowConstructorOptions,
  'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition'> {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 13 },
    }
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#747c8c',
      height: TITLE_BAR_HEIGHT,
    },
  }
}

/** Whether a Chromium permission request belongs to the local clipboard writer. */
export function allowsClipboardWrite(
  permission: string,
  requestingOrigin: string,
  allowedOrigin: string,
): boolean {
  if (permission !== 'clipboard-sanitized-write') return false
  try {
    return new URL(requestingOrigin).origin === new URL(allowedOrigin).origin
  } catch {
    return false
  }
}

/** Whether the current process admits GitHub pre-release updates. */
export function allowsPrereleaseUpdates(argv: readonly string[]): boolean {
  return argv.includes(ALLOW_PRERELEASE_ARGUMENT)
}

/** Resolve the public project page, preferring package repository metadata. */
export function resolveProjectUrl(manifest: DesktopManifest): string | undefined {
  const repository = manifest.repository
  const candidate = typeof repository === 'string'
    ? repository
    : isRecord(repository) && typeof repository.url === 'string'
      ? repository.url
      : manifest.homepage
  if (typeof candidate !== 'string') return undefined
  const normalized = candidate.replace(/^git\+/, '').replace(/\.git$/, '')
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.replace(/\/$/, '') : undefined
  } catch {
    return undefined
  }
}

/** Build the native page context menu from Chromium editing capabilities. */
export function contextMenuTemplate(
  params: Pick<ContextMenuParams, 'editFlags' | 'isEditable' | 'selectionText'>,
  development: boolean,
): MenuItemConstructorOptions[] {
  const editing: MenuItemConstructorOptions[] = params.isEditable
    ? [
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]
    : [
      { role: 'copy', enabled: params.selectionText.length > 0 && params.editFlags.canCopy },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]
  return [
    ...editing,
    { type: 'separator' },
    { role: 'reload' },
    ...(development ? [{ role: 'toggleDevTools' as const }] : []),
  ]
}

/** CSS that reserves a calm, theme-aware drag strip above the upstream UI. */
export const DESKTOP_CHROME_CSS = `
#dsh-electron-titlebar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 2147483647;
  height: ${String(TITLE_BAR_HEIGHT)}px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: env(titlebar-area-x, 0px);
  padding-right: calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100%));
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgb(20 32 54 / 8%));
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #f8f9fb) 92%, transparent);
  color: var(--dsw-alias-label-tertiary, #747c8c);
  font: 500 12px/1 var(--dsw-font-family, system-ui, sans-serif);
  letter-spacing: 0.02em;
  user-select: none;
  -webkit-app-region: drag;
  backdrop-filter: blur(18px) saturate(1.15);
}
#root {
  box-sizing: border-box;
  padding-top: ${String(TITLE_BAR_HEIGHT)}px;
}
@media (prefers-reduced-transparency: reduce) {
  #dsh-electron-titlebar { backdrop-filter: none; }
}
`

/** Renderer script that mounts the desktop drag strip before the window is shown. */
export function desktopChromeScript(applicationName: string): string {
  return `(() => {
    if (document.getElementById('dsh-electron-titlebar') !== null) return
    const bar = document.createElement('div')
    bar.id = 'dsh-electron-titlebar'
    bar.setAttribute('role', 'presentation')
    bar.textContent = ${JSON.stringify(applicationName)}
    document.body.prepend(bar)
  })()`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
