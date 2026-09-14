import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureWebProfileWorkspace } from './plugin-profile-workspace.ts'
import type { PluginCatalog } from './plugin-catalog.ts'
import { PluginRecoveryError } from './plugin-recovery.ts'
import { clearPluginPending, readPluginPending } from './plugin-pending.ts'
import type { PluginProfileLock } from './plugin-profile-lock.ts'
import { ensureCatalogPluginLinks } from './runtime-plugins.ts'
import { loadPluginState, reconcilePluginState, savePluginState, type PluginState } from './plugin-state.ts'
import { DynamicIncludeCompositionBackend, effectivePluginRoster } from './plugin-runtime-config.ts'
import { writeTextFileAtomic } from './text-file.ts'

/** Result of inspecting a leftover packages-pending marker at startup. */
export type PendingReconcileResult = 'absent' | 'recovered'

/**
 * Resolve the active web profile directory.
 * @param harnessHome - Active DSH home.
 * @returns Absolute profile path.
 */
export function webProfileDir(harnessHome: string): string {
  return join(harnessHome, 'profiles', 'web')
}

/**
 * Read direct dependencies from the web profile manifest.
 * @param profileDir - Absolute profile directory.
 * @returns Dependency name to spec map.
 */
export function readWebProfileDependencies(profileDir: string): Record<string, string> {
  const path = join(profileDir, 'package.json')
  if (!existsSync(path)) return {}
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> }
    return manifest.dependencies ?? {}
  } catch (error) {
    throw new PluginRecoveryError(
      `The web profile manifest is invalid: ${path}`,
      'profile-reconcile-failed',
      String(error),
    )
  }
}

/**
 * Reconcile a leftover pending marker without spawning Host.
 * Parses profile dependencies, repairs hot-plugin symlinks, and relists the catalog.
 * @param options - Overlay paths, catalog, and lock used for this boot.
 * @returns `absent` when no marker exists; `recovered` after a successful repair.
 */
export async function reconcilePendingPackageMutation(options: {
  harnessHome: string
  catalog: PluginCatalog
  pendingPath: string
  lock: PluginProfileLock
}): Promise<PendingReconcileResult> {
  let marker: ReturnType<typeof readPluginPending>
  try {
    marker = readPluginPending(options.pendingPath)
  } catch (error) {
    throw new PluginRecoveryError(
      'Desktop found an unreadable in-flight plugin mutation.',
      'pending-reconcile-failed',
      String(error),
    )
  }
  if (marker === undefined) return 'absent'
  await options.lock.acquire()
  try {
    readWebProfileDependencies(webProfileDir(options.harnessHome))
    const plugins = await options.catalog.list()
    ensureCatalogPluginLinks(options.harnessHome, plugins)
    await clearPluginPending(options.pendingPath)
    return 'recovered'
  } catch (error) {
    if (error instanceof PluginRecoveryError && error.reason === 'lock-timeout') throw error
    throw new PluginRecoveryError(
      'Desktop could not reconcile an interrupted plugin mutation.',
      'pending-reconcile-failed',
      String(error),
    )
  } finally {
    options.lock.release()
  }
}

/**
 * Disable every manageable plugin and rewrite the generated roster.
 * Excludes unloadable profile bundles while retaining their dependency entries.
 * Holds the profile lock through pending-marker removal; required system plugins stay composed.
 * @param options - Harness home, catalog, state, and generated include path.
 */
export async function disableAllManageablePlugins(options: {
  harnessHome: string
  lock: PluginProfileLock
  catalog: PluginCatalog
  statePath: string
  configPath: string
  pendingPath: string
}): Promise<void> {
  await options.lock.acquire()
  try {
    const plugins = await options.catalog.list()
    await excludeUnhealthyProfileBundles(webProfileDir(options.harnessHome), plugins)
    const loaded = loadPluginState(options.statePath).state
    const disabled = [...new Set([
      ...loaded.disabled,
      ...plugins.filter(plugin => plugin.manageable).map(plugin => plugin.name),
    ])]
    const state: PluginState = { ...loaded, disabled }
    await savePluginState(options.statePath, state)
    await new DynamicIncludeCompositionBackend(options.configPath).apply(effectivePluginRoster(plugins, state))
    await clearPluginPending(options.pendingPath)
  } finally {
    options.lock.release()
  }
}

/**
 * Clear Desktop-managed membership and disabled preferences, then relink.
 * Excludes unloadable profile bundles while retaining every profile dependency.
 * Holds the profile lock through pending-marker removal.
 * @param options - Catalog, state, generated include, and DSH home.
 */
export async function resetPluginManagement(options: {
  harnessHome: string
  lock: PluginProfileLock
  catalog: PluginCatalog
  statePath: string
  configPath: string
  pendingPath: string
}): Promise<void> {
  await options.lock.acquire()
  try {
    const state: PluginState = { version: 2, disabled: [], profileManaged: [] }
    const plugins = await options.catalog.list()
    await excludeUnhealthyProfileBundles(webProfileDir(options.harnessHome), plugins)
    await savePluginState(options.statePath, state)
    ensureCatalogPluginLinks(options.harnessHome, plugins)
    await new DynamicIncludeCompositionBackend(options.configPath).apply(effectivePluginRoster(plugins, state))
    await clearPluginPending(options.pendingPath)
  } finally {
    options.lock.release()
  }
}

/**
 * Reload durable preferences and reconcile them with the repaired catalog.
 * @param statePath - Desktop plugin preferences path.
 * @param plugins - Current catalog after any startup repair.
 * @param profileDir - Active web profile directory.
 * @returns Preferences shared by startup composition and lifecycle operations.
 */
export async function loadStartupPluginState(
  statePath: string,
  plugins: Awaited<ReturnType<PluginCatalog['list']>>,
  profileDir: string,
): Promise<PluginState> {
  const reconciled = reconcilePluginState(
    loadPluginState(statePath).state,
    plugins.filter(plugin => plugin.manageable).map(plugin => plugin.name),
    Object.keys(readWebProfileDependencies(profileDir)),
  )
  await savePluginState(statePath, reconciled.state)
  return reconciled.state
}

/**
 * Prepare workspace policy after acquiring ownership of the web profile.
 * @param profileDir - Active web profile directory.
 * @param lock - Shared Desktop package transaction lock.
 */
export async function prepareStartupWorkspace(profileDir: string, lock: PluginProfileLock): Promise<void> {
  await lock.acquire()
  try {
    ensureWebProfileWorkspace(profileDir)
  } finally {
    lock.release()
  }
}

interface WebProfileManifest {
  dependencies?: Record<string, string>
  dsh?: {
    profile?: {
      bundles?: string[]
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

async function excludeUnhealthyProfileBundles(
  profileDir: string,
  plugins: Awaited<ReturnType<PluginCatalog['list']>>,
): Promise<void> {
  const excluded = new Set(plugins
    .filter(plugin => plugin.ownership === 'profile' && plugin.kind === 'bundle' && plugin.health !== 'healthy')
    .map(plugin => plugin.name))
  if (excluded.size === 0) return
  const path = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as WebProfileManifest
  const bundles = manifest.dsh?.profile?.bundles
  if (bundles === undefined) return
  const retained = bundles.filter(name => !excluded.has(name))
  if (retained.length === bundles.length) return
  const profile = { ...manifest.dsh?.profile, bundles: retained }
  const dsh = { ...manifest.dsh, profile }
  await writeTextFileAtomic(path, `${JSON.stringify({ ...manifest, dsh }, undefined, 2)}\n`)
}
