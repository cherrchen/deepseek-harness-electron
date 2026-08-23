/** Verify every downstream ecosystem plugin remains a pnpm workspace member. */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../../..')

/**
 * Read package identities from direct children of the downstream namespace.
 * @param {string} root repository root.
 * @returns {{name: string, path: string}[]} declared packages.
 */
export function downstreamPluginPackages(root = repositoryRoot) {
  const namespaceRoot = join(root, 'packages', 'dsh-electron')
  if (!existsSync(namespaceRoot)) return []
  return readdirSync(namespaceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(namespaceRoot, entry.name, 'package.json')
      if (!existsSync(manifestPath)) return []
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
        throw new Error(`downstream plugin workspace: package name missing in ${manifestPath}`)
      }
      return [{ name: manifest.name, path: manifestPath }]
    })
}

/**
 * Read the package names resolved by pnpm's workspace graph.
 * @param {string} root repository root.
 * @returns {Set<string>} resolved package names.
 */
export function pnpmWorkspacePackageNames(root = repositoryRoot) {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const output = execFileSync(executable, ['--recursive', 'list', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const rows = JSON.parse(output)
  if (!Array.isArray(rows)) throw new Error('downstream plugin workspace: pnpm returned a non-array package list')
  return new Set(rows.flatMap(row => typeof row?.name === 'string' ? [row.name] : []))
}

/**
 * Fail when a downstream subtree package is excluded from pnpm's workspace.
 * @param {string} root repository root.
 */
export function verifyDownstreamPluginWorkspace(root = repositoryRoot) {
  const packages = downstreamPluginPackages(root)
  if (packages.length === 0) return
  const visible = pnpmWorkspacePackageNames(root)
  const missing = packages.filter(pkg => !visible.has(pkg.name))
  if (missing.length > 0) {
    throw new Error(`downstream plugin workspace: pnpm cannot resolve ${missing.map(pkg => pkg.name).join(', ')}`)
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDownstreamPluginWorkspace()
}
