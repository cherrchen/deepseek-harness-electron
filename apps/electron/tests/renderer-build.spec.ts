import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))
const rendererDist = join(electronRoot, 'dist', 'renderer')
const webDist = join(electronRoot, '..', 'web', 'dist')

describe('Electron renderer build smoke', () => {
  it('emits index.html and hashed assets without reading apps/web/dist', () => {
    expect(existsSync(join(rendererDist, 'index.html')), 'run pnpm --filter @dsh-electron/dsh-electron build:renderer first').toBe(true)
    const html = readFileSync(join(rendererDist, 'index.html'), 'utf8')
    expect(html).toContain('id="root"')
    expect(html).not.toContain('dsh-electron-titlebar')
    expect(html).toMatch(/assets\/index-[^"]+\.js/)

    const assets = join(rendererDist, 'assets')
    expect(existsSync(assets)).toBe(true)
    expect(readdirSync(assets).some(name => name.startsWith('index-') && name.endsWith('.js'))).toBe(true)

    const builtCss = readdirSync(assets).find(name => name.endsWith('.css'))
    expect(builtCss, 'renderer bundle should emit CSS').toBeTruthy()
    const css = readFileSync(join(assets, builtCss!), 'utf8')
    expect(css).toContain('data-dsh-electron-sidebar')
    expect(css).not.toContain('#dsh-electron-titlebar')

    // Criterion C: the Electron renderer artifact must not be copied from apps/web.
    if (existsSync(join(webDist, 'index.html'))) {
      const webHtml = readFileSync(join(webDist, 'index.html'), 'utf8')
      expect(html).not.toBe(webHtml)
    }
  })
})
