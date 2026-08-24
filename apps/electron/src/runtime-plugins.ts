import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { ManagedPluginSource } from './plugin-lifecycle-contract.ts'

export type { ManagedPluginSource } from './plugin-lifecycle-contract.ts'

/** Relative path from the Electron application root to bundled runtime plugins. */
export const RUNTIME_PLUGINS_RELATIVE = join('runtime', 'plugins')

/** Parsed metadata for one bundled runtime plugin directory. */
export interface RuntimePluginManifest {
  /** npm package name from package.json. */
  name: string
  /** npm package version from package.json. */
  version: string
  /** User-facing package description from package.json. */
  description?: string
  /** Direct child directory name under runtime/plugins. */
  directoryName: string
  /** Absolute path to the plugin root (contains package.json and lib/). */
  rootPath: string
  /** Whether package.json declares a dsh.client browser half. */
  hasClient: boolean
}

/** Runtime plugin plus lifecycle-management policy owned by Electron Main. */
export interface ManagedPlugin extends RuntimePluginManifest {
  /** Whether this artifact comes from runtime/plugins or ecosystem inventory. */
  source: ManagedPluginSource
  /** Whether users may enable, disable, or reload this plugin at runtime. */
  manageable: boolean
  /** Whether the desktop shell requires the plugin in static bootstrap composition. */
  required: boolean
}

interface ElectronPluginInventoryManifest {
  dshElectron?: { ecosystemPlugins?: string[] }
}

/**
 * Absolute path of the bundled runtime plugin inventory.
 * @param appPath - Electron application root.
 * @returns Directory containing one folder per runtime plugin.
 */
export function runtimePluginsRoot(appPath: string): string {
  return join(appPath, RUNTIME_PLUGINS_RELATIVE)
}

/**
 * Discover bundled runtime plugin directories under runtime/plugins.
 * @param appPath - Electron application root.
 * @returns One manifest per direct child directory containing package.json.
 */
export function discoverRuntimePlugins(appPath: string): RuntimePluginManifest[] {
  const root = runtimePluginsRoot(appPath)
  if (!existsSync(root)) {
    throw new Error(`runtime plugins: inventory missing at ${root}`)
  }
  const plugins: RuntimePluginManifest[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pluginRoot = join(root, entry.name)
    const manifestPath = join(pluginRoot, 'package.json')
    if (!existsSync(manifestPath)) continue
    let manifest: PackageManifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
    } catch (error) {
      throw new Error(`runtime plugins: invalid package.json at ${manifestPath}: ${String(error)}`)
    }
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new Error(`runtime plugins: package name missing in ${manifestPath}`)
    }
    if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
      throw new Error(`runtime plugins: package version missing in ${manifestPath}`)
    }
    plugins.push({
      name: manifest.name,
      version: manifest.version,
      ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
      directoryName: entry.name,
      rootPath: pluginRoot,
      hasClient: manifest.dsh?.client !== undefined,
    })
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Resolve prebuilt standard DSH packages declared by the Electron distribution.
 * @param appPath - Electron application root.
 * @returns manifests backed by installed package artifacts or workspace sources in development.
 */
export function discoverEcosystemPlugins(appPath: string): RuntimePluginManifest[] {
  const appManifestPath = join(appPath, 'package.json')
  if (!existsSync(appManifestPath)) return []
  const appManifest = JSON.parse(readFileSync(appManifestPath, 'utf8')) as ElectronPluginInventoryManifest
  const names = appManifest.dshElectron?.ecosystemPlugins ?? []
  return names.map((name) => {
    const installed = join(appPath, 'node_modules', ...name.split('/'))
    const workspace = join(appPath, '..', '..', 'packages', 'dsh-electron', name.split('/').at(-1) ?? '')
    const rootPath = existsSync(installed) ? installed : workspace
    const manifestPath = join(rootPath, 'package.json')
    if (!existsSync(manifestPath)) {
      throw new Error(`ecosystem plugins: ${name} is declared but not installed at ${installed}`)
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
    if (manifest.name !== name) {
      throw new Error(`ecosystem plugins: expected ${name} at ${manifestPath}, found ${String(manifest.name)}`)
    }
    if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
      throw new Error(`ecosystem plugins: package version missing in ${manifestPath}`)
    }
    return {
      name,
      version: manifest.version,
      ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
      directoryName: name.split('/').at(-1) ?? name,
      rootPath,
      hasClient: manifest.dsh?.client !== undefined,
    }
  })
}

interface PackageManifest {
  name?: string
  version?: string
  description?: string
  dsh?: { client?: unknown }
}

/**
 * Discover every Electron-bundled plugin artifact with lifecycle policy metadata.
 * @param appPath - Electron application root.
 * @returns Runtime adapters first, then ecosystem plugins in distribution order.
 */
export function discoverManagedPlugins(appPath: string): ManagedPlugin[] {
  const runtime = discoverRuntimePlugins(appPath).map<ManagedPlugin>(plugin => ({
    ...plugin,
    source: 'desktop-runtime',
    manageable: false,
    required: true,
  }))
  const ecosystem = discoverEcosystemPlugins(appPath).map<ManagedPlugin>(plugin => ({
    ...plugin,
    source: 'ecosystem',
    manageable: true,
    required: false,
  }))
  return [...runtime, ...ecosystem]
}

/**
 * Discover only ecosystem plugins that Electron may manage at runtime.
 * @param appPath - Electron application root.
 * @returns Bundled ecosystem plugins in distribution order.
 */
export function discoverManageablePlugins(appPath: string): ManagedPlugin[] {
  return discoverManagedPlugins(appPath).filter(plugin => plugin.manageable)
}

/**
 * Validate that a bundled plugin has the expected built artifacts.
 * @param plugin - Discovered plugin manifest.
 */
export function validateRuntimePlugin(plugin: RuntimePluginManifest): void {
  const { rootPath, name } = plugin
  if (!existsSync(join(rootPath, 'package.json'))) {
    throw new Error(`runtime plugins: ${name} missing package.json at ${rootPath}`)
  }
  if (!existsSync(join(rootPath, 'lib', 'index.js'))) {
    throw new Error(`runtime plugins: ${name} missing lib/index.js at ${rootPath}`)
  }
  if (plugin.hasClient && !existsSync(join(rootPath, 'lib', 'client.js'))) {
    throw new Error(`runtime plugins: ${name} missing lib/client.js at ${rootPath}`)
  }
}

/**
 * Resolve the profile node_modules link path for one npm package name.
 * @param harnessHome - `$DSH_HOME` root used by the supervised Host.
 * @param packageName - Scoped or unscoped npm package name.
 * @returns Absolute symlink path under profiles/node_modules.
 */
export function profileModuleLinkPath(harnessHome: string, packageName: string): string {
  return join(harnessHome, 'profiles', 'node_modules', ...packageName.split('/'))
}

/**
 * Resolve the dynamic-include module fallback path for one npm package name.
 * @param harnessHome - `$DSH_HOME` root used by the supervised Host.
 * @param packageName - Scoped or unscoped npm package name.
 * @returns Absolute symlink path under `electron/node_modules`.
 */
export function pluginRuntimeModuleLinkPath(harnessHome: string, packageName: string): string {
  return join(harnessHome, 'electron', 'node_modules', ...packageName.split('/'))
}

/**
 * Symlink every bundled runtime plugin into the profile module fallback.
 * @param appPath - Electron application root.
 * @param harnessHome - `$DSH_HOME` root used by the supervised Host.
 */
export function ensureRuntimePluginsLinked(appPath: string, harnessHome: string): void {
  const plugins = discoverManagedPlugins(appPath)
  if (plugins.length === 0) {
    throw new Error(`runtime plugins: no bundled plugins under ${runtimePluginsRoot(appPath)}`)
  }
  for (const plugin of plugins) {
    validateRuntimePlugin(plugin)
    for (const link of [
      profileModuleLinkPath(harnessHome, plugin.name),
      pluginRuntimeModuleLinkPath(harnessHome, plugin.name),
    ]) {
      mkdirSync(dirname(link), { recursive: true })
      ensureSymlink(link, plugin.rootPath)
    }
  }
}

/**
 * Create or repair a directory symlink (junction on Windows).
 * @param link - Symlink path under profiles/node_modules.
 * @param target - Absolute plugin directory.
 */
export function ensureSymlink(link: string, target: string): void {
  mkdirSync(dirname(link), { recursive: true })
  try {
    const current = readlinkSync(link)
    if (current === target) return
    unlinkSync(link)
  } catch (error: unknown) {
    if (!isMissingPathError(error)) {
      try {
        if (lstatSync(link).isSymbolicLink() || lstatSync(link).isDirectory()) unlinkSync(link)
      } catch {
        // Race or already gone.
      }
    }
  }
  symlinkSync(target, link, 'junction')
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
