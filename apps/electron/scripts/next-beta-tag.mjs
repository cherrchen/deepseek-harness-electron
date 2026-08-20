#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { baseVersion, nextBetaTag } from './next-beta-tag-lib.mjs'

const upstreamManifestPath = fileURLToPath(new URL('../../cli/package.json', import.meta.url))

const upstreamManifest = JSON.parse(await readFile(upstreamManifestPath, 'utf8'))
if (typeof upstreamManifest.version !== 'string' || upstreamManifest.version.length === 0) {
  throw new Error('apps/cli/package.json does not contain a release version')
}

const base = baseVersion(upstreamManifest.version)
const tags = execFileSync('git', ['tag', '--list', `v${base}-beta.*`], { encoding: 'utf8' })
  .split('\n')
  .map(tag => tag.trim())
  .filter(tag => tag.length > 0)
process.stdout.write(nextBetaTag(upstreamManifest.version, tags))
