import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginInstallSource, PluginPackageActions } from './plugin-lifecycle-contract.ts'
import { inspectProfilePackageState } from './plugin-package-inspector.ts'
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
      if (entries.has(dependencyName)) continue
      const rootPath = join(profileDir, 'node_modules', ...dependencyName.split('/'))
      const manifestPath = join(rootPath, 'package.json')
      if (!existsSync(manifestPath)) {
        const installSource = classifyInstallSource(requestedSpec)
        const kind = bundleNames.has(dependencyName) ? 'bundle' : 'dependency'
        entries.set(dependencyName, {
          name: dependencyName,
          version: 'unknown',
          directoryName: dependencyName.split('/').at(-1) ?? dependencyName,
          rootPath,
          hasClient: false,
          ownership: 'profile',
          kind,
          installSource,
          requestedSpec,
          manageable: false,
          required: false,
          activationMode: kind === 'bundle' ? 'profile-restart' : 'none',
          health: 'reconcile-required',
          packageActions: packageActions(installSource, requestedSpec, 'reconcile-required'),
        })
        continue
      }
      const inspected = inspectProfilePackageState(profileDir, dependencyName)
      const incomplete = inspected.entryProblem !== undefined
      const declaredKind = inspected.kind
      const managedRuntime = !incomplete && declaredKind === 'runtime-plugin' && managedNames.has(dependencyName)
      const kind = declaredKind === 'bundle'
        ? 'bundle'
        : declaredKind === 'runtime-plugin' && (managedRuntime || incomplete) ? 'runtime-plugin' : 'dependency'
      const activationMode = kind === 'runtime-plugin'
        ? 'hot'
        : kind === 'bundle' ? 'profile-restart' : 'none'
      const health = incomplete || (kind === 'bundle' && !bundleNames.has(dependencyName))
        ? 'reconcile-required'
        : 'healthy'
      const installSource = classifyInstallSource(requestedSpec)
      entries.set(inspected.name, {
        name: inspected.name,
        version: inspected.version,
        ...(inspected.description === undefined ? {} : { description: inspected.description }),
        directoryName: inspected.name.split('/').at(-1) ?? inspected.name,
        rootPath: inspected.rootPath,
        hasClient: inspected.hasClient,
        ownership: 'profile',
        kind,
        installSource,
        requestedSpec,
        manageable: activationMode === 'hot' && health === 'healthy' && managedRuntime,
        required: false,
        activationMode,
        health,
        packageActions: packageActions(installSource, requestedSpec, health),
      })
    }
    return [...entries.values()]
  }
}

function packageActions(
  source: PluginInstallSource,
  requestedSpec: string,
  health: 'healthy' | 'reconcile-required',
): PluginPackageActions {
  if (source === 'registry') {
    return { checkUpdates: true, update: 'registry', reinstall: true, remove: true }
  }
  if (source === 'git') {
    return { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true }
  }
  if (source === 'local' && /^file:/i.test(requestedSpec)) {
    return { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true }
  }
  if (source === 'local') {
    return { checkUpdates: false, update: false, reinstall: health === 'reconcile-required', remove: true }
  }
  return { checkUpdates: false, update: false, reinstall: false, remove: true }
}

function classifyInstallSource(spec: string): PluginInstallSource {
  if (/^(?:file|link):/i.test(spec)) return 'local'
  if (/^(?:git\+|github:)|github\.com[/:]/i.test(spec)) return 'git'
  if (/^(?:https?:|workspace:|portal:|patch:)/i.test(spec)) return 'unknown'
  return spec.length > 0 ? 'registry' : 'unknown'
}

function parseJson(path: string, subject: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`${subject}: invalid package.json at ${path}: ${String(error)}`)
  }
}
