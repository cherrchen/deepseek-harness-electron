#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { synchronizeDependencies, assertResolvedWorkspaceDependencies } from './sync-version-dependencies.mjs'

const electronManifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
const upstreamManifestPath = fileURLToPath(new URL('../../cli/package.json', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const electronManifest = JSON.parse(await readFile(electronManifestPath, 'utf8'))
const upstreamManifest = JSON.parse(await readFile(upstreamManifestPath, 'utf8'))

if (typeof upstreamManifest.version !== 'string' || upstreamManifest.version.length === 0) {
  throw new Error('apps/cli/package.json does not contain a release version')
}

/** Discover named workspace manifests without a build-time glob dependency. */
async function discoverManifests(root) {
  const manifests = new Map()
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name === 'package.json') {
        const manifest = JSON.parse(await readFile(path, 'utf8'))
        if (typeof manifest.name === 'string') manifests.set(manifest.name, manifest)
      }
    }
  }
  for (const relative of ['apps/cli', 'packages', 'vendor', 'native/landlock-run']) {
    await visit(join(root, relative))
  }
  return manifests
}

/** Collect workspace peers from the complete CLI production graph. */
function collectWorkspacePeers(manifests) {
  const pending = ['@deepseek-ai/dsh']
  const visited = new Set()
  const peers = new Set()
  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined || visited.has(name)) continue
    visited.add(name)
    const manifest = manifests.get(name)
    if (manifest === undefined) continue
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (manifests.has(dependency)) pending.push(dependency)
    }
    for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
      if (!manifests.has(dependency)) continue
      peers.add(dependency)
      pending.push(dependency)
    }
  }
  return [...peers].sort()
}

const manifests = await discoverManifests(repositoryRoot)
const workspaceDependencies = [
  '@deepseek-ai/dsh',
  ...collectWorkspacePeers(manifests),
].sort()
const workspaceNames = new Set(manifests.keys())
const dependencies = synchronizeDependencies(
  electronManifest.dependencies,
  workspaceDependencies,
  workspaceNames,
)
assertResolvedWorkspaceDependencies(dependencies, workspaceNames)
const changed = electronManifest.version !== upstreamManifest.version
  || JSON.stringify(electronManifest.dependencies) !== JSON.stringify(dependencies)

if (changed) {
  electronManifest.version = upstreamManifest.version
  electronManifest.dependencies = dependencies
  await writeFile(electronManifestPath, `${JSON.stringify(electronManifest, null, 2)}\n`)
  console.log(`Electron manifest synchronized to upstream ${upstreamManifest.version}`)
}
