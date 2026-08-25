import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginInstallSource, PluginPackageKind } from './plugin-lifecycle-contract.ts'
import type { PluginState } from './plugin-state.ts'
import { discoverManagedPlugins, type ManagedPlugin } from './runtime-plugins.ts'

/** Refreshable package inventory consumed by plugin lifecycle management. */
export interface PluginCatalog {
  /** @returns current system, bundled, and profile-owned packages in precedence order. */
  list(): Promise<readonly ManagedPlugin[]>
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

interface InstalledPackageManifest {
  name?: string
  version?: string
  description?: string
  main?: string
  exports?: unknown
  dsh?: { client?: unknown; bundle?: { patch?: unknown } }
}

/** Filesystem-backed catalog for the Desktop's active profile. */
export class ProfilePluginCatalog implements PluginCatalog {
  /**
   * @param appPath - Electron application root containing distribution plugins.
   * @param harnessHome - Active DSH home.
   * @param profile - Active profile name.
   * @param getState - Current Desktop plugin state.
   */
  constructor(
    private readonly appPath: string,
    private readonly harnessHome: string,
    private readonly profile: string,
    private readonly getState: () => PluginState,
  ) {}

  list(): Promise<readonly ManagedPlugin[]> {
    return Promise.resolve(this.read())
  }

  private read(): readonly ManagedPlugin[] {
    const entries = new Map<string, ManagedPlugin>()
    for (const plugin of discoverManagedPlugins(this.appPath)) entries.set(plugin.name, plugin)

    const profileDir = join(this.harnessHome, 'profiles', this.profile)
    const profileManifestPath = join(profileDir, 'package.json')
    if (!existsSync(profileManifestPath)) return [...entries.values()]
    const profileManifest = parseJson(profileManifestPath, 'profile catalog') as ProfileManifest
    const dependencies = profileManifest.dependencies ?? {}
    const bundleNames = new Set(profileManifest.dsh?.profile?.bundles ?? [])
    const managedNames = new Set(this.getState().profileManaged)

    for (const [dependencyName, requestedSpec] of Object.entries(dependencies)) {
      if (!bundleNames.has(dependencyName) && !managedNames.has(dependencyName)) continue
      if (entries.has(dependencyName)) continue
      const rootPath = join(profileDir, 'node_modules', ...dependencyName.split('/'))
      const manifestPath = join(rootPath, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = parseJson(manifestPath, 'profile catalog') as InstalledPackageManifest
      if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
        throw new Error(`profile catalog: package name missing in ${manifestPath}`)
      }
      if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
        throw new Error(`profile catalog: package version missing in ${manifestPath}`)
      }
      const kind = classifyPackage(manifest)
      entries.set(manifest.name, {
        name: manifest.name,
        version: manifest.version,
        ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
        directoryName: manifest.name.split('/').at(-1) ?? manifest.name,
        rootPath,
        hasClient: manifest.dsh?.client !== undefined,
        ownership: 'profile',
        kind,
        installSource: classifyInstallSource(requestedSpec),
        requestedSpec,
        manageable: kind === 'runtime-plugin' && managedNames.has(dependencyName),
        required: false,
        activation: kind === 'runtime-plugin' ? 'hot' : kind === 'bundle' ? 'profile-restart' : 'none',
      })
    }
    return [...entries.values()]
  }
}

function classifyPackage(manifest: InstalledPackageManifest): PluginPackageKind {
  if (manifest.dsh?.bundle?.patch !== undefined) return 'bundle'
  if (typeof manifest.main === 'string' || hasRootExport(manifest.exports)) return 'runtime-plugin'
  return 'dependency'
}

function hasRootExport(exportsField: unknown): boolean {
  if (typeof exportsField === 'string') return true
  return typeof exportsField === 'object' && exportsField !== null && (
    '.' in exportsField || 'default' in exportsField || 'import' in exportsField
  )
}

function classifyInstallSource(spec: string): PluginInstallSource {
  if (/^(?:file|link):/i.test(spec)) return 'local'
  if (/^(?:git\+|github:)|github\.com[/:]/i.test(spec)) return 'git'
  return /^[a-z@]/i.test(spec) ? 'registry' : 'unknown'
}

function parseJson(path: string, subject: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`${subject}: invalid package.json at ${path}: ${String(error)}`)
  }
}
