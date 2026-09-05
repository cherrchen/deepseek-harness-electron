import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')

describe('Git client bundle', () => {
  it('keeps Details Host external in the client artifact', () => {
    const client = readFileSync(join(packageRoot, 'lib/client.js'), 'utf8')
    expect(client).toContain('@dsh-electron/dsh-client-ui-details-host/client')
    expect(client).not.toContain('ShellDetailsService')
    expect(client).not.toContain('class DetailsHostStateSource')
  })

  it('declares Details Host as a module-table request', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dsh?: { client?: { external?: string[] } }
    }
    expect(manifest.dsh?.client?.external).toEqual([
      '@dsh-electron/dsh-client-ui-details-host/client',
    ])
  })
})
