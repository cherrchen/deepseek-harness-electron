import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
export interface InspectedPluginPackage {
  name: string
  version: string
  description?: string
  rootPath: string
  kind: PluginPackageKind
  hasClient: boolean
}

/**
 * Inspect one direct dependency through the active profile's node_modules tree.
 * @param profileDir - Absolute active profile directory.
 * @param dependencyName - Real dependency key written by pnpm.
 * @returns validated installed package facts.
 */
export function inspectProfilePackage(profileDir: string, dependencyName: string): InspectedPluginPackage {
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
  return {
    name: manifest.name,
    version: manifest.version,
    ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
    rootPath,
    kind,
    hasClient: manifest.dsh?.client !== undefined,
  }
}

function hasRootExport(exportsField: unknown): boolean {
  if (typeof exportsField === 'string') return true
  return typeof exportsField === 'object' && exportsField !== null && (
    '.' in exportsField || 'default' in exportsField || 'import' in exportsField
  )
}
