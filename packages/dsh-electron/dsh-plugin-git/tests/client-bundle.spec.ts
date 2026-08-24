import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Git client bundle', () => {
  it('keeps Details Host external in the client artifact', () => {
    const client = readFileSync('lib/client.js', 'utf8')
    expect(client).toContain('@dsh-electron/dsh-client-ui-details-host/client')
    expect(client).not.toContain('ShellDetailsService')
    expect(client).not.toContain('class DetailsHostStateSource')
  })
})
