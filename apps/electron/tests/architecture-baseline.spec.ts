import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('runtime plugin architecture baselines', () => {
  it('keeps bundled plugins under runtime/plugins', () => {
    expect(existsSync(join(electronRoot, 'runtime', 'plugins'))).toBe(true)
  })

  it('keeps renderer/main.ts as a thin bootstrap without feature plugin imports', () => {
    const source = readFileSync(join(electronRoot, 'src', 'renderer', 'main.ts'), 'utf8')
    expect(source).toContain('installDesktopWebSocket')
    expect(source).toContain('installDesktopClipboardShim')
    expect(source).toContain('installHostBootstrap')
    expect(source).toContain('AppWebEntry')
    expect(source).not.toContain('runtime/plugins')
    expect(source).not.toContain('dsh-electron-ui-directory-picker')
    expect(source).not.toContain('dsh-electron-desktop-capabilities')
  })
})
