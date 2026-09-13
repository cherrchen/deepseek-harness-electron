import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')

describe('Git client bundle', () => {
  it('erases the sidebar type-only import from the client artifact', () => {
    const client = readFileSync(join(packageRoot, 'lib/client.js'), 'utf8')
    expect(client).not.toContain('@dsh-electron/dsh-client-ui-details-host')
    expect(client).not.toContain('require("@deepseek-ai/dsh-client-ui-sidebar-right')
    expect(client).not.toContain('ShellDetailsService')
    expect(client).not.toMatch(/\bDetailsHeaderAction\b/)
  })

  it('ships no module-table requests', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dsh?: { client?: { external?: string[] } }
    }
    expect(manifest.dsh?.client?.external).toBeUndefined()
  })
})
