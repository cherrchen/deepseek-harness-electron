import type { BrowserWindowConstructorOptions } from 'electron'
import { desktopWindowChrome } from './desktop/index.ts'
import type { DesktopMainMessages } from './locale.ts'
import type { PluginRecoveryAction, PluginRecoveryReason } from './plugin-recovery.ts'

/** Minimal window used by recovery presentation; tests inject a fake. */
export interface RecoveryWindow {
  loadURL(url: string): Promise<void>
  webContents: {
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): void
  }
  once(event: 'closed', listener: () => void): void
  show(): void
  focus(): void
  isDestroyed(): boolean
  close(): void
}

/** Factory used so tests can observe recovery-window creation without Electron GUI. */
export type RecoveryWindowFactory = (options: BrowserWindowConstructorOptions) => RecoveryWindow

const REASON_KEY = {
  'pending-reconcile-failed': 'recoveryPending',
  'lock-timeout': 'recoveryLock',
  'profile-reconcile-failed': 'recoveryProfile',
  'host-timeout': 'recoveryHost',
} as const satisfies Record<PluginRecoveryReason, keyof DesktopMainMessages>

/**
 * Parse a recovery-window navigation URL into a repair action.
 * @param url - Navigation or open-handler URL.
 * @returns Repair action, or undefined when the URL is unrelated.
 */
export function parseRecoveryActionUrl(url: string): PluginRecoveryAction | undefined {
  if (url === 'dsh-recovery:disable-all' || url.endsWith('#disable-all')) return 'disable-all'
  if (url === 'dsh-recovery:reset-management' || url.endsWith('#reset-management')) return 'reset-management'
  return undefined
}

/**
 * Build the Main-owned recovery document. It does not load Host or `dsh-client-web`.
 * @param options - Locale copy, recovery reason, and optional diagnostics.
 * @returns `data:text/html` URL.
 */
export function recoveryDocument(options: {
  messages: DesktopMainMessages
  reason: PluginRecoveryReason
  details?: string
  lang: 'en' | 'zh-CN'
}): string {
  const { messages, reason } = options
  const details = options.details === undefined || options.details.length === 0
    ? ''
    : `<details><summary>${escapeHtml(messages.recoveryDetails)}</summary><pre>${escapeHtml(options.details)}</pre></details>`
  const html = `<!doctype html>
<html lang="${options.lang === 'zh-CN' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(messages.recoveryTitle)}</title>
<style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; min-height: 100vh; color: light-dark(#171a21, #eff2f7); background: light-dark(#f7f8fb, #171a21); }
main { max-width: 520px; margin: 0 auto; padding: 48px 28px; }
h1 { margin: 0 0 16px; font-size: 22px; }
p { margin: 0 0 12px; line-height: 1.55; color: light-dark(#555d6c, #b9bfca); }
.actions { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
a { display: inline-flex; justify-content: center; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; }
.primary { color: white; background: #3964fe; }
.secondary { color: inherit; border: 1px solid light-dark(#d5dae3, #3a4150); }
pre { white-space: pre-wrap; font-size: 12px; }
</style></head><body><main>
<h1>${escapeHtml(messages.recoveryTitle)}</h1>
<p>${escapeHtml(messages[REASON_KEY[reason]])}</p>
<p>${escapeHtml(messages.recoveryInstruction)}</p>
${details}
<div class="actions">
<a class="primary" href="dsh-recovery:disable-all">${escapeHtml(messages.disableAll)}</a>
<a class="secondary" href="dsh-recovery:reset-management">${escapeHtml(messages.resetManagement)}</a>
</div>
</main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * Open the Main-owned recovery window and run the chosen repair action.
 * @param options - Locale, reason, repair callbacks, and optional window factory.
 */
export async function presentPluginRecovery(options: {
  messages: DesktopMainMessages
  lang: 'en' | 'zh-CN'
  reason: PluginRecoveryReason
  details?: string
  disableAll: () => Promise<void>
  resetManagement: () => Promise<void>
  platform?: NodeJS.Platform
  createWindow?: RecoveryWindowFactory
}): Promise<void> {
  const chrome = {
    ...desktopWindowChrome(options.platform ?? process.platform),
    width: 560,
    height: 520,
    show: true,
    title: options.messages.recoveryTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
  const window = options.createWindow === undefined
    ? new (await import('electron')).BrowserWindow(chrome)
    : options.createWindow(chrome)
  const url = recoveryDocument({
    messages: options.messages,
    reason: options.reason,
    ...(options.details === undefined ? {} : { details: options.details }),
    lang: options.lang,
  })
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (!window.isDestroyed()) window.close()
      if (error === undefined) resolve()
      else reject(error)
    }
    const handle = (action: PluginRecoveryAction): void => {
      if (settled) return
      const run = action === 'disable-all' ? options.disableAll : options.resetManagement
      void run().then(
        () => { finish() },
        (error: unknown) => {
          console.error('desktop recovery: repair action failed', error)
        },
      )
    }
    window.webContents.setWindowOpenHandler(({ url: target }) => {
      const action = parseRecoveryActionUrl(target)
      if (action !== undefined) handle(action)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, target) => {
      const action = parseRecoveryActionUrl(target)
      if (action === undefined) return
      event.preventDefault()
      handle(action)
    })
    window.once('closed', () => {
      if (!settled) finish(new Error('desktop recovery: window closed without a repair action'))
    })
    void window.loadURL(url).catch((error: unknown) => { finish(error instanceof Error ? error : new Error(`desktop recovery: window load failed: ${String(error)}`)) })
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
