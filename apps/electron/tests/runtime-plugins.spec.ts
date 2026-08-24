import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  discoverRuntimePlugins,
  discoverEcosystemPlugins,
  discoverManagedPlugins,
  ensureRuntimePluginsLinked,
  ensureSymlink,
  profileModuleLinkPath,
  RUNTIME_PLUGINS_RELATIVE,
  runtimePluginsRoot,
  validateRuntimePlugin,
} from '../src/runtime-plugins.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))
const fixtureRoot = join(electronRoot, 'tests', 'fixtures', 'runtime-plugins', 'example-plugin')
const buildScript = join(electronRoot, 'scripts', 'build-runtime-plugins.mjs')

/** Build one fixture plugin by copying it into a temporary inventory root. */
async function buildFixtureInInventory(appPath: string): Promise<string> {
  const pluginRoot = join(appPath, RUNTIME_PLUGINS_RELATIVE, 'example-plugin')
  cpSync(fixtureRoot, pluginRoot, { recursive: true })
  const envRoot = join(appPath, RUNTIME_PLUGINS_RELATIVE)
  const script = `
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const repoRoot = ${JSON.stringify(join(electronRoot, '..', '..'))}
const pluginsRoot = ${JSON.stringify(envRoot)}
function resolveEsbuild() {
  for (const base of [${JSON.stringify(electronRoot)}, repoRoot]) {
    try { return require.resolve('esbuild', { paths: [base] }) } catch {}
  }
  throw new Error('esbuild missing')
}
const { build } = require(resolveEsbuild())
const pluginRoot = join(pluginsRoot, 'example-plugin')
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'))
mkdirSync(join(pluginRoot, 'lib'), { recursive: true })
await build({ entryPoints: [join(pluginRoot, 'src', 'index.ts')], outfile: join(pluginRoot, 'lib', 'index.js'), bundle: true, platform: 'node', packages: 'external', format: 'esm', target: 'node22', logLevel: 'silent' })
const result = await build({ entryPoints: [join(pluginRoot, 'src', 'client', 'index.ts')], bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', write: false, jsx: 'automatic', external: ['react','react/jsx-runtime','react-dom','@deepseek-ai/cordis','@deepseek-ai/dsh-client-runtime/client'], logLevel: 'silent' })
const code = result.outputFiles[0].text
writeFileSync(join(pluginRoot, 'lib', 'client.js'), 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(manifest.name) + ', factory: (require) => { var module = { exports: {} }; var exports = module.exports; ' + code + ' return module.exports; } });')
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'fixture build failed')
  return pluginRoot
}

describe('runtime plugin discovery', () => {
  it('discovers production bundled plugins with scoped package names', () => {
    const plugins = discoverRuntimePlugins(electronRoot)
    expect(plugins.length).toBeGreaterThanOrEqual(2)
    const names = plugins.map(plugin => plugin.name)
    expect(names).toContain('@dsh-electron/dsh-electron-desktop-capabilities')
    expect(names).toContain('@dsh-electron/dsh-client-ui-details-host')
    expect(names).toContain('@dsh-electron/dsh-electron-ui-directory-picker')
    expect(names).toContain('@dsh-electron/dsh-electron-ui-brand')
    expect(names).toContain('@dsh-electron/dsh-electron-ui-plugin-manager')
    expect(plugins.every(plugin => plugin.version.length > 0)).toBe(true)
    expect(plugins.find(plugin => plugin.name === '@dsh-electron/dsh-electron-desktop-capabilities')?.description)
      .toBe('Desktop capability provider for Electron feature plugins')
  })

  it('discovers prebuilt ecosystem plugins without routing them through the Desktop builder', () => {
    const plugins = discoverEcosystemPlugins(electronRoot)
    expect(plugins.map(plugin => plugin.name)).toContain('@dsh-electron/dsh-plugin-git')
    expect(readFileSync(buildScript, 'utf8')).not.toContain('packages/dsh-electron')
  })

  it('classifies runtime adapters and ecosystem plugins for lifecycle management', () => {
    const plugins = discoverManagedPlugins(electronRoot)
    expect(plugins.some(plugin =>
      plugin.name === '@dsh-electron/dsh-electron-desktop-capabilities'
      && plugin.source === 'desktop-runtime'
      && plugin.required
      && !plugin.manageable)).toBe(true)
    expect(plugins.some(plugin =>
      plugin.name === '@dsh-electron/dsh-client-ui-details-host'
      && plugin.source === 'desktop-runtime'
      && plugin.required
      && !plugin.manageable)).toBe(true)
    expect(plugins.some(plugin =>
      plugin.name === '@dsh-electron/dsh-plugin-git'
      && plugin.source === 'ecosystem'
      && !plugin.required
      && plugin.manageable)).toBe(true)
    const appManifest = JSON.parse(readFileSync(join(electronRoot, 'package.json'), 'utf8')) as {
      dshElectron?: { ecosystemPlugins?: string[] }
    }
    expect(appManifest.dshElectron?.ecosystemPlugins).toContain('@dsh-electron/dsh-plugin-git')
    expect(appManifest.dshElectron?.ecosystemPlugins).not.toContain('@dsh-electron/dsh-client-ui-details-host')
  })

  it('ignores non-plugin files under runtime/plugins', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    try {
      const root = join(appPath, RUNTIME_PLUGINS_RELATIVE)
      const { mkdirSync } = await import('node:fs')
      mkdirSync(root, { recursive: true })
      writeFileSync(join(root, 'README.txt'), 'not a plugin', 'utf8')
      await buildFixtureInInventory(appPath)
      const plugins = discoverRuntimePlugins(appPath)
      expect(plugins).toHaveLength(1)
      expect(plugins[0]?.name).toBe('@dsh-electron/dsh-electron-fixture-example')
    } finally {
      await rm(appPath, { recursive: true, force: true })
    }
  })

  it('rejects missing package name in a plugin directory', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    try {
      const pluginRoot = join(appPath, RUNTIME_PLUGINS_RELATIVE, 'bad-plugin')
      cpSync(fixtureRoot, pluginRoot, { recursive: true })
      writeFileSync(join(pluginRoot, 'package.json'), JSON.stringify({ private: true }), 'utf8')
      expect(() => discoverRuntimePlugins(appPath)).toThrow(/package name missing/)
    } finally {
      await rm(appPath, { recursive: true, force: true })
    }
  })
})

describe('runtime plugin validation and linking', () => {
  it('validates required build output and resolves scoped link paths', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    try {
      await buildFixtureInInventory(appPath)
      const [plugin] = discoverRuntimePlugins(appPath)
      if (plugin === undefined) throw new Error('fixture plugin was not discovered')
      validateRuntimePlugin(plugin)
      const incompleteRoot = join(appPath, 'incomplete-plugin')
      const { mkdirSync } = await import('node:fs')
      mkdirSync(incompleteRoot, { recursive: true })
      cpSync(join(plugin.rootPath, 'package.json'), join(incompleteRoot, 'package.json'))
      expect(() => { validateRuntimePlugin({ ...plugin, rootPath: incompleteRoot }) })
        .toThrow(/missing lib\/index.js/)

      ensureRuntimePluginsLinked(appPath, harnessHome)
      const link = profileModuleLinkPath(harnessHome, plugin.name)
      const { readlink } = await import('node:fs/promises')
      expect((await readlink(link)).replaceAll('\\', '/')).toBe(plugin.rootPath.replaceAll('\\', '/'))
    } finally {
      await rm(appPath, { recursive: true, force: true })
      await rm(harnessHome, { recursive: true, force: true })
    }
  })

  it('preserves correct existing links and repairs wrong links', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    const otherTarget = await mkdtemp(join(tmpdir(), 'dsh-electron-other-'))
    try {
      await buildFixtureInInventory(appPath)
      const [plugin] = discoverRuntimePlugins(appPath)
      if (plugin === undefined) throw new Error('fixture plugin was not discovered')
      const link = profileModuleLinkPath(harnessHome, plugin.name)
      const { mkdirSync } = await import('node:fs')
      mkdirSync(dirname(link), { recursive: true })
      symlinkSync(otherTarget, link, 'junction')
      ensureRuntimePluginsLinked(appPath, harnessHome)
      const { readlink } = await import('node:fs/promises')
      expect((await readlink(link)).replaceAll('\\', '/')).toBe(plugin.rootPath.replaceAll('\\', '/'))
      ensureRuntimePluginsLinked(appPath, harnessHome)
      expect((await readlink(link)).replaceAll('\\', '/')).toBe(plugin.rootPath.replaceAll('\\', '/'))
    } finally {
      await rm(appPath, { recursive: true, force: true })
      await rm(harnessHome, { recursive: true, force: true })
      await rm(otherTarget, { recursive: true, force: true })
    }
  })

  it('does not remove unrelated profile packages when linking bundled plugins', async () => {
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    try {
      const unrelated = join(harnessHome, 'profiles', 'node_modules', 'left-alone')
      const { mkdirSync } = await import('node:fs')
      mkdirSync(unrelated, { recursive: true })
      writeFileSync(join(unrelated, 'package.json'), '{"name":"left-alone"}', 'utf8')
      ensureRuntimePluginsLinked(electronRoot, harnessHome)
      expect(existsSync(join(unrelated, 'package.json'))).toBe(true)
    } finally {
      await rm(harnessHome, { recursive: true, force: true })
    }
  })

  it('links all production runtime plugins from the packaged inventory', async () => {
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    try {
      ensureRuntimePluginsLinked(electronRoot, harnessHome)
      for (const plugin of discoverRuntimePlugins(electronRoot)) {
        const link = profileModuleLinkPath(harnessHome, plugin.name)
        const { readlink } = await import('node:fs/promises')
        expect((await readlink(link)).replaceAll('\\', '/')).toBe(plugin.rootPath.replaceAll('\\', '/'))
      }
    } finally {
      await rm(harnessHome, { recursive: true, force: true })
    }
  })
})

describe('runtime plugin inventory layout', () => {
  it('keeps bundled plugins under runtime/plugins', () => {
    expect(existsSync(runtimePluginsRoot(electronRoot))).toBe(true)
  })

  it('does not hard-code directory-picker package names in generic linker source', () => {
    const source = readFileSync(join(electronRoot, 'src', 'runtime-plugins.ts'), 'utf8')
    expect(source).not.toContain('ui-directory-picker-electron')
    expect(source).not.toContain('ELECTRON_DIRECTORY_PICKER')
  })
})

describe('runtime plugin symlink helper', () => {
  it('creates missing parent directories for scoped package links', async () => {
    const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-electron-home-'))
    const target = await mkdtemp(join(tmpdir(), 'dsh-electron-target-'))
    try {
      const link = profileModuleLinkPath(harnessHome, '@scope/pkg')
      ensureSymlink(link, target)
      const { readlink } = await import('node:fs/promises')
      expect((await readlink(link)).replaceAll('\\', '/')).toBe(target.replaceAll('\\', '/'))
    } finally {
      await rm(harnessHome, { recursive: true, force: true })
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe('generic runtime plugin builder', () => {
  it('builds every production plugin and derives ModuleLoader ids from package.json', () => {
    const builderSource = readFileSync(buildScript, 'utf8')
    expect(builderSource).not.toContain('directory-picker')
    expect(builderSource).not.toContain('ui-directory-picker-electron')

    for (const plugin of discoverRuntimePlugins(electronRoot)) {
      expect(existsSync(join(plugin.rootPath, 'lib', 'index.js'))).toBe(true)
      if (plugin.hasClient) {
        const client = readFileSync(join(plugin.rootPath, 'lib', 'client.js'), 'utf8')
        expect(client).toContain(`id: ${JSON.stringify(plugin.name)}`)
        expect(existsSync(join(plugin.rootPath, 'lib', 'client.js'))).toBe(true)
      }
    }
  })

  it('emits automatic JSX so a TSX occupant does not need a React identifier', () => {
    const builderSource = readFileSync(buildScript, 'utf8')
    expect(builderSource).toMatch(/jsx:\s*'automatic'/)

    const plugin = discoverRuntimePlugins(electronRoot)
      .find(candidate => candidate.name === '@dsh-electron/dsh-client-ui-details-host')
    if (plugin === undefined) throw new Error('Details Host runtime plugin is missing')
    const client = readFileSync(join(plugin.rootPath, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('react/jsx-runtime')
    expect(client).not.toMatch(/\bReact\.createElement\b/)
  })

  it('keeps Host package imports external to the plugin bundle', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'dsh-electron-plugins-'))
    try {
      const pluginRoot = await buildFixtureInInventory(appPath)
      const host = await readFile(join(pluginRoot, 'lib', 'index.js'), 'utf8')
      expect(host).toContain('from "@deepseek-ai/cordis"')
      expect(readFileSync(buildScript, 'utf8')).toContain("packages: 'external'")
    } finally {
      await rm(appPath, { recursive: true, force: true })
    }
  })

  it('inlines plugin-owned CSS Modules for loader lifecycle cleanup', () => {
    const plugin = discoverRuntimePlugins(electronRoot)
      .find(candidate => candidate.name === '@dsh-electron/dsh-electron-ui-plugin-manager')
    if (plugin === undefined) throw new Error('Plugin Manager runtime plugin is missing')
    const client = readFileSync(join(plugin.rootPath, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('dataset.pluginCss')
    expect(client).toContain(plugin.name)
    expect(client).toContain('PluginManagerTab.module.css')
  })
})
