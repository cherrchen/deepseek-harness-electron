import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { PluginPackageKind } from './plugin-lifecycle-contract.ts'
import { PluginInstallError } from './plugin-install-contract.ts'

interface PackageManifest {
  name?: string
  version?: string
  description?: string
  main?: string
  exports?: unknown
  dsh?: { client?: unknown; bundle?: { patch?: unknown } }
}

/** Installed package facts used for catalog membership and activation. */
interface InspectedPluginPackage {
  name: string
  version: string
  description?: string
  rootPath: string
  kind: PluginPackageKind
  hasClient: boolean
}

/** Catalog inspection that preserves a package with unloadable declared entries. */
interface ProfilePackageInspection extends InspectedPluginPackage {
  entryProblem?: string
}

/**
 * Inspect package metadata while reporting unloadable entries to the profile catalog.
 * @param profileDir - Absolute active profile directory.
 * @param dependencyName - Real dependency key written by pnpm.
 * @returns installed package facts and an optional entry validation problem.
 */
export function inspectProfilePackageState(profileDir: string, dependencyName: string): ProfilePackageInspection {
  const rootPath = join(profileDir, 'node_modules', ...dependencyName.split('/'))
  const manifestPath = join(rootPath, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new PluginInstallError('profile-reconcile-failed', `Installed package ${dependencyName} cannot be resolved from the web profile.`)
  }
  let manifest: PackageManifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
  } catch (error) {
    throw new PluginInstallError('invalid-package', `Installed package manifest is invalid: ${manifestPath}`, String(error))
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0 || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new PluginInstallError('invalid-package', `Installed package manifest must declare name and version: ${manifestPath}`)
  }
  const kind = manifest.dsh?.bundle?.patch !== undefined
    ? 'bundle'
    : typeof manifest.main === 'string' || hasRootExport(manifest.exports)
      ? 'runtime-plugin'
      : 'dependency'
  const entryProblem = validatePackageEntries(rootPath, manifest, kind)
  return {
    name: manifest.name,
    version: manifest.version,
    ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
    rootPath,
    kind,
    hasClient: manifest.dsh?.client !== undefined,
    ...(entryProblem === undefined ? {} : { entryProblem }),
  }
}

function validatePackageEntries(
  rootPath: string,
  manifest: PackageManifest,
  kind: PluginPackageKind,
): string | undefined {
  const declaredPatch = manifest.dsh?.bundle?.patch
  if (declaredPatch !== undefined) {
    if (typeof declaredPatch !== 'string' || declaredPatch.length === 0 || isAbsolute(declaredPatch)) {
      return 'dsh.bundle.patch must be a non-empty relative path'
    }
    const patchPath = resolve(rootPath, declaredPatch)
    if (escapesDirectory(rootPath, patchPath)) return `dsh.bundle.patch escapes the package directory: ${declaredPatch}`
    if (!existsSync(patchPath)) return `declared bundle patch does not exist: ${declaredPatch}`
  }
  const hostEntry = packageExportTarget(manifest, '.')
  if (kind === 'runtime-plugin' && hostEntry === undefined) {
    return 'runtime plugin requires a root package export or main entry with an importable target'
  }
  const hostProblem = hostEntry === undefined ? undefined : validateEntryPath(rootPath, hostEntry, 'Host')
  if (hostProblem !== undefined) return hostProblem
  if (manifest.dsh?.client !== undefined) {
    const clientEntry = packageExportTarget(manifest, './client')
    if (clientEntry === undefined) return 'dsh.client requires a ./client package export'
    const clientProblem = validateEntryPath(rootPath, clientEntry, 'client')
    if (clientProblem !== undefined) return clientProblem
  }
  return undefined
}

function validateEntryPath(rootPath: string, entry: string, label: string): string | undefined {
  const entryPath = resolve(rootPath, entry)
  if (isAbsolute(entry) || escapesDirectory(rootPath, entryPath)) {
    return `declared ${label} entry escapes the package directory: ${entry}`
  }
  return existsSync(entryPath) ? undefined : `declared ${label} entry does not exist: ${entry}`
}

function escapesDirectory(rootPath: string, candidatePath: string): boolean {
  const offset = relative(rootPath, candidatePath)
  return offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)
}

function packageExportTarget(manifest: PackageManifest, key: '.' | './client'): string | undefined {
  const selected = key === '.' && typeof manifest.exports === 'string'
    ? manifest.exports
    : typeof manifest.exports === 'object' && manifest.exports !== null
      ? key in manifest.exports
        ? (manifest.exports as Record<string, unknown>)[key]
        : key === '.' ? manifest.exports : undefined
      : undefined
  return conditionalExportTarget(selected) ?? (key === '.' && typeof manifest.main === 'string' ? manifest.main : undefined)
}

function conditionalExportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return undefined
  const conditions = value as Record<string, unknown>
  return conditionalExportTarget(conditions.import ?? conditions.default)
}

function hasRootExport(exportsField: unknown): boolean {
  if (typeof exportsField === 'string') return true
  return typeof exportsField === 'object' && exportsField !== null && (
    '.' in exportsField || 'default' in exportsField || 'import' in exportsField
  )
}
