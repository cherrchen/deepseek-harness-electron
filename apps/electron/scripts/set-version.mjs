#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const electronManifestPath = fileURLToPath(new URL('../package.json', import.meta.url))

/** @param {string} raw */
function normalizeVersion(raw) {
  const trimmed = raw.trim()
  if (trimmed.length === 0) throw new Error('Version argument is required.')
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
}

/** @param {string} version */
function assertSemver(version) {
  const pattern = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/
  if (!pattern.test(version)) {
    throw new Error(`Version ${version} is not a supported desktop release version.`)
  }
}

const version = normalizeVersion(process.argv[2] ?? '')
assertSemver(version)

const electronManifest = JSON.parse(await readFile(electronManifestPath, 'utf8'))
if (electronManifest.version === version) {
  console.log(`Electron manifest already at ${version}`)
  process.exit(0)
}

electronManifest.version = version
await writeFile(electronManifestPath, `${JSON.stringify(electronManifest, null, 2)}\n`)
console.log(`Electron manifest set to ${version}`)
