import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { prepareHostRuntimeOverlay, renderHostOverlayTemplate } from '../src/runtime-overlay.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))
const hostTemplate = readFileSync(join(electronRoot, 'runtime', 'host.patch.yml'), 'utf8')

describe('runtime overlay plugin seat', () => {
  it('renders the bootstrap overlay with a dynamic include seat and narrow config HMR', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'dsh-electron-user-data-'))
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh home with spaces '))
    try {
      const overlay = await prepareHostRuntimeOverlay(electronRoot, userData, harnessHome)
      const body = readFileSync(overlay.patchPath, 'utf8')
      expect(overlay.pluginRuntimeDirectory.replaceAll('\\', '/')).toBe(join(harnessHome, 'electron').replaceAll('\\', '/'))
      expect(overlay.pluginConfigPath.replaceAll('\\', '/')).toBe(join(harnessHome, 'electron', 'plugins.cordis.yml').replaceAll('\\', '/'))
      expect(overlay.pluginStatePath.replaceAll('\\', '/')).toBe(join(harnessHome, 'electron', 'plugin-state.json').replaceAll('\\', '/'))
      expect(body).toContain('@deepseek-ai/dsh-host-directory-picker-browse')
      expect(body).toContain('@dsh-electron/dsh-electron-desktop-capabilities')
      expect(body).toContain('@dsh-electron/dsh-electron-ui-directory-picker')
      expect(body).toContain('@dsh-electron/dsh-electron-ui-brand')
      expect(body).toContain("name: 'cordis:include'")
      expect(body).toContain('plugins.cordis.yml')
      expect(body).toContain('disabled: false')
      expect(body).toContain(pathToFileURL(overlay.pluginConfigPath).href)
      expect(body).toContain(pathToFileURL(overlay.pluginRuntimeDirectory).href)
      expect(body).not.toContain('@dsh-electron/dsh-plugin-git')
      expect(body).not.toContain('__DSH_ELECTRON_PLUGIN_CONFIG_URL__')
      expect(body).not.toContain('__DSH_ELECTRON_PLUGIN_RUNTIME_BASE_URL__')
    } finally {
      await rm(userData, { recursive: true, force: true })
      await rm(harnessHome, { recursive: true, force: true })
    }
  })

  it('fails loud when placeholders are missing or duplicated', () => {
    expect(() => renderHostOverlayTemplate('missing', 'file:///plugins.cordis.yml', 'file:///runtime/'))
      .toThrow(/expected exactly one/)
    expect(() => renderHostOverlayTemplate(
      `${hostTemplate}\n__DSH_ELECTRON_PLUGIN_CONFIG_URL__\n`,
      'file:///plugins.cordis.yml',
      'file:///runtime/',
    )).toThrow(/expected exactly one/)
  })

  it('preserves file URLs with spaces and Windows drive syntax verbatim', () => {
    const rendered = renderHostOverlayTemplate(
      hostTemplate,
      'file:///C:/Users/Alice/DSH%20Home/electron/plugins.cordis.yml',
      'file:///C:/Users/Alice/DSH%20Home/electron/',
    )
    expect(rendered).toContain('file:///C:/Users/Alice/DSH%20Home/electron/plugins.cordis.yml')
    expect(rendered).toContain('file:///C:/Users/Alice/DSH%20Home/electron/')
    expect(rendered).not.toContain('file://C:\\Users\\Alice')
  })
})
