import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface ElectronManifest {
  dependencies?: Record<string, string>
  dshElectron?: { ecosystemPlugins?: string[] }
  build: {
    extraMetadata: { name: string }
    nsis: { useZip: boolean; differentialPackage: boolean }
  }
}

describe('Electron packaging', () => {
  it('uses checked Windows extraction and an unscoped packaged identity', async () => {
    const manifestPath = join(import.meta.dirname, '..', 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ElectronManifest

    expect(manifest.build.nsis.useZip).toBe(true)
    expect(manifest.build.nsis.differentialPackage).toBe(false)
    expect(manifest.build.extraMetadata.name).toBe('deepseek-harness-desktop')
  })

  it('installs every declared ecosystem plugin as a production workspace dependency', async () => {
    const electronRoot = join(import.meta.dirname, '..')
    const manifest = JSON.parse(await readFile(join(electronRoot, 'package.json'), 'utf8')) as ElectronManifest
    const names = manifest.dshElectron?.ecosystemPlugins ?? []
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(manifest.dependencies?.[name]).toBe('workspace:^')
      expect(existsSync(join(electronRoot, 'node_modules', ...name.split('/'), 'package.json'))).toBe(true)
    }
  })
})
