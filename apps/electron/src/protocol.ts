/**
 * Serve the Electron-owned renderer and proxy Host paths through HarnessProxy.
 */

import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { protocol } from 'electron'
import { RENDERER_SCHEME } from './bridge-types.ts'
import type { HarnessProxy } from './harness-proxy.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Register the privileged custom scheme before `app.ready`.
 * Must run exactly once, before any BrowserWindow is created.
 */
export function registerRendererScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  }])
}

/**
 * Install the `dsh-electron` protocol handler after `app.ready`.
 * @param rendererRoot - Absolute path of the built renderer dist directory.
 * @param harness - Main-process Harness proxy (origin set before first navigation).
 */
export function installRendererProtocol(rendererRoot: string, harness: HarnessProxy): void {
  const root = resolve(rendererRoot)
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'localhost') {
      return new Response('Forbidden', { status: 403 })
    }
    const pathname = decodeURIComponent(url.pathname)
    if (pathname.startsWith('/api/') || pathname.startsWith('/plugins/')) {
      return await harness.proxyRequest(request)
    }
    return await serveRendererFile(root, pathname)
  })
}

/**
 * Resolve the packaged renderer dist directory under the Electron app root.
 * @param appPath - `app.getAppPath()`.
 * @returns Absolute renderer dist path.
 */
export function resolveRendererRoot(appPath: string): string {
  return join(appPath, 'dist', 'renderer')
}

async function serveRendererFile(root: string, pathname: string): Promise<Response> {
  const relative = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\//, '')
  const target = resolve(normalize(join(root, relative)))
  if (target !== root && !target.startsWith(root + sep)) {
    return new Response('Forbidden', { status: 403 })
  }
  try {
    const body = await readFile(target)
    const type = MIME[extname(target)] ?? 'application/octet-stream'
    return new Response(body, {
      status: 200,
      headers: { 'content-type': type },
    })
  } catch {
    if (relative !== 'index.html') {
      try {
        const body = await readFile(join(root, 'index.html'))
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      } catch {
        // Fall through to 404.
      }
    }
    return new Response('Not Found', { status: 404 })
  }
}
