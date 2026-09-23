import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { desktopWindowChrome } from '../desktop/index.ts'
import type { DesktopMainLocale } from '../locale.ts'
import type { ProxyCredentialChallenge, ProxyCredentialSubmission } from './domain.ts'

const CHANNEL = 'deepseek-desktop:network:credential-submit'

/** Parse the only private prompt submission accepted by Main. */
export function parseCredentialSubmission(value: unknown, canPersist: boolean): ProxyCredentialSubmission | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('action' in value)) return undefined
  if (value.action === 'cancel') return { action: 'cancel' }
  if (value.action !== 'use-once' && value.action !== 'save-securely') return undefined
  if (value.action === 'save-securely' && !canPersist) return undefined
  if (!('username' in value) || typeof value.username !== 'string' || value.username.length > 1024
    || !('password' in value) || typeof value.password !== 'string' || value.password.length > 8192
    || value.username.includes(':') || /[\r\n\0]/u.test(value.username)) return undefined
  return { action: value.action, username: value.username, password: value.password }
}

/** Render the credential form without embedding a password or executable remote content. */
export function credentialDocument(challenge: ProxyCredentialChallenge, locale: DesktopMainLocale, nonce: string): string {
  const m = locale.messages
  const save = challenge.canPersist
    ? `<button type="button" data-action="save-securely">${escapeHtml(m.networkCredentialSave)}</button>` : ''
  const html = `<!doctype html><html lang="${locale.id}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'">
<title>${escapeHtml(m.networkCredentialTitle)}</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}
body{margin:0;padding:26px;color:light-dark(#171a21,#eff2f7);background:light-dark(#f7f8fb,#171a21)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 16px}label{display:block;margin:14px 0 6px}
input{box-sizing:border-box;width:100%;font:inherit;padding:10px;border:1px solid #8b93a3;border-radius:6px}
.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:26px}button{font:inherit;padding:9px 12px;cursor:pointer}
</style></head><body><main><h1>${escapeHtml(m.networkCredentialTitle)}</h1>
<p>${escapeHtml(challenge.rejected ? m.networkCredentialRejected : m.networkCredentialRequired)}</p>
<p>${escapeHtml(challenge.proxy.kind.toUpperCase())} ${escapeHtml(challenge.proxy.host)}:${String(challenge.proxy.port)}</p>
<form id="credential-form" autocomplete="off"><label for="username">${escapeHtml(m.networkCredentialUsername)}</label>
<input id="username" name="username" autocomplete="username" maxlength="1024">
<label for="password">${escapeHtml(m.networkCredentialPassword)}</label>
<input id="password" name="password" type="password" autocomplete="new-password" maxlength="8192">
<p role="status" id="error"></p><div class="actions"><button type="button" data-action="cancel">${escapeHtml(m.networkCredentialCancel)}</button>
<button type="submit" data-action="use-once">${escapeHtml(m.networkCredentialUseOnce)}</button>${save}</div></form></main>
<script nonce="${nonce}">
const form=document.getElementById('credential-form');
let busy=false;
async function submit(action){if(busy)return;busy=true;
  const input=action==='cancel'?{action}:{action,username:form.elements.username.value,password:form.elements.password.value};
  try{await window.networkCredential.submit(input)}catch{document.getElementById('error').textContent=${safeJsString(m.networkCredentialFailed)}}
  finally{form.elements.password.value='';busy=false}
}
form.addEventListener('submit',event=>{event.preventDefault();void submit('use-once')});
for(const button of form.querySelectorAll('button[type=button]'))button.addEventListener('click',()=>{void submit(button.dataset.action)});
</script></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/** Show one sandboxed modal; Main validates both its sender and its input. */
export async function presentCredentialChallenge(options: {
  challenge: ProxyCredentialChallenge
  locale: DesktopMainLocale
  appPath: string
  parent?: BrowserWindow
}): Promise<ProxyCredentialSubmission> {
  const window = new BrowserWindow({
    ...desktopWindowChrome(process.platform),
    width: 480, height: 440, minWidth: 420, minHeight: 400,
    show: false, modal: options.parent !== undefined,
    ...(options.parent === undefined ? {} : { parent: options.parent }),
    title: options.locale.messages.networkCredentialTitle,
    webPreferences: {
      preload: join(options.appPath, 'lib', 'preload', 'network-credential.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  const nonce = randomBytes(16).toString('base64')
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (value: ProxyCredentialSubmission): void => {
      if (settled) return
      settled = true
      ipcMain.removeHandler(CHANNEL)
      if (!window.isDestroyed()) window.close()
      resolve(value)
    }
    ipcMain.handle(CHANNEL, (event, input: unknown) => {
      if (event.sender !== window.webContents) throw new Error('desktop network: untrusted credential sender')
      const parsed = parseCredentialSubmission(input, options.challenge.canPersist)
      if (parsed === undefined) throw new Error('desktop network: invalid credential response')
      finish(parsed)
    })
    window.once('closed', () => { finish({ action: 'cancel' }) })
    void window.loadURL(credentialDocument(options.challenge, options.locale, nonce)).then(
      () => { if (!settled) window.show() },
      (error: unknown) => {
        ipcMain.removeHandler(CHANNEL)
        if (!window.isDestroyed()) window.close()
        reject(error instanceof Error ? error : new Error('desktop network: credential window failed to load'))
      },
    )
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function safeJsString(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
