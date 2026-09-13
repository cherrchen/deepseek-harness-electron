import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('standard ecosystem plugin artifact portability', () => {
  it('does not pack Details Host as an ecosystem plugin', () => {
    const manifest = JSON.parse(readFileSync(join(electronRoot, 'package.json'), 'utf8')) as {
      dshElectron?: { ecosystemPlugins?: string[] }
    }
    expect(manifest.dshElectron?.ecosystemPlugins).toContain('@dsh-electron/dsh-plugin-git')
    expect(manifest.dshElectron?.ecosystemPlugins).not.toContain('@dsh-electron/dsh-client-ui-details-host')
  })
})
