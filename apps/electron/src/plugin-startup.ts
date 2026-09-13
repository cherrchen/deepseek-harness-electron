import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginCatalog } from './plugin-catalog.ts'
import { PluginRecoveryError } from './plugin-recovery.ts'
import { clearPluginPending, readPluginPending } from './plugin-pending.ts'
import type { PluginProfileLock } from './plugin-profile-lock.ts'
import { ensureCatalogPluginLinks } from './runtime-plugins.ts'
import { loadPluginState, savePluginState, type PluginState } from './plugin-state.ts'
import { DynamicIncludeCompositionBackend, effectivePluginRoster } from './plugin-runtime-config.ts'

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
 * Required system plugins stay composed through the bootstrap overlay.
 * @param options - Catalog, state, and generated include path.
 */
export async function disableAllManageablePlugins(options: {
  catalog: PluginCatalog
  statePath: string
  configPath: string
  pendingPath: string
}): Promise<void> {
  const plugins = await options.catalog.list()
  const loaded = loadPluginState(options.statePath).state
  const disabled = [...new Set([
    ...loaded.disabled,
    ...plugins.filter(plugin => plugin.manageable).map(plugin => plugin.name),
  ])]
  const state: PluginState = { ...loaded, disabled }
  await savePluginState(options.statePath, state)
  await new DynamicIncludeCompositionBackend(options.configPath).apply(effectivePluginRoster(plugins, state))
  await clearPluginPending(options.pendingPath)
}

/**
 * Clear Desktop-managed membership and disabled preferences, then relink.
 * Profile dependencies are left on disk.
 * @param options - Catalog, state, generated include, and DSH home.
 */
export async function resetPluginManagement(options: {
  harnessHome: string
  catalog: PluginCatalog
  statePath: string
  configPath: string
  pendingPath: string
}): Promise<void> {
  const state: PluginState = { version: 2, disabled: [], profileManaged: [] }
  await savePluginState(options.statePath, state)
  const plugins = await options.catalog.list()
  ensureCatalogPluginLinks(options.harnessHome, plugins)
  await new DynamicIncludeCompositionBackend(options.configPath).apply(effectivePluginRoster(plugins, state))
  await clearPluginPending(options.pendingPath)
}
