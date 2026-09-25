import { readFileSync, readlinkSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  discoverEcosystemPlugins,
  discoverRuntimePlugins,
  ensureRuntimePluginsLinked,
  profileModuleLinkPath,
} from '../src/runtime-plugins.ts'

const appPath = fileURLToPath(new URL('..', import.meta.url))

describe('bundled Desktop plugin startup', () => {
  it('links required adapters and the declared ecosystem plugin into profile resolution', async () => {
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    try {
      const runtime = discoverRuntimePlugins(appPath)
      const ecosystem = discoverEcosystemPlugins(appPath)
      expect(runtime.map(plugin => plugin.name)).toContain('@dsh-electron/dsh-electron-desktop-capabilities')
      expect(runtime.map(plugin => plugin.name)).not.toContain('@dsh-electron/dsh-electron-ui-plugin-manager')
      expect(ecosystem.map(plugin => plugin.name)).toEqual(['@dsh-electron/dsh-plugin-git'])
      ensureRuntimePluginsLinked(appPath, harnessHome)
      for (const plugin of [...runtime, ...ecosystem]) {
        expect(readlinkSync(profileModuleLinkPath(harnessHome, plugin.name))).toBe(plugin.rootPath)
      }
      const patch = readFileSync(join(appPath, 'runtime', 'host.patch.yml'), 'utf8')
      expect(patch).toContain("name: '@dsh-electron/dsh-plugin-git'")
      expect(patch).not.toContain('cordis:include')
      expect(patch).not.toContain('ui-plugin-manager-electron')
    } finally {
      await rm(harnessHome, { recursive: true, force: true })
    }
  })

})
