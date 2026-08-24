import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Git client bundle', () => {
  it('keeps Details Host external in the client artifact', () => {
    const client = readFileSync('lib/client.js', 'utf8')
    expect(client).toContain('@dsh-electron/dsh-client-ui-details-host/client')
    expect(client).not.toContain('ShellDetailsService')
    expect(client).not.toContain('class DetailsHostStateSource')
  })

  it('declares Details Host as a module-table request', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dsh?: { client?: { external?: string[] } }
    }
    expect(manifest.dsh?.client?.external).toEqual([
      '@dsh-electron/dsh-client-ui-details-host/client',
    ])
  })
})
