/**
 * Bundle the sandboxed preload to one CommonJS file (Electron cannot load
 * package `"type":"module"` ESM preloads with relative imports under sandbox).
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')

function resolveEsbuild() {
  for (const base of [root, repoRoot]) {
    try {
      return require.resolve('esbuild', { paths: [base] })
    } catch {
      // Continue searching.
    }
  }
  const pnpm = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(pnpm)) {
    for (const entry of readdirSync(pnpm)) {
      if (!entry.startsWith('esbuild@')) continue
      const candidate = join(pnpm, entry, 'node_modules', 'esbuild')
      if (existsSync(candidate)) return require.resolve(candidate)
    }
  }
  throw new Error('esbuild not found for preload build')
}

const { build } = require(resolveEsbuild())

mkdirSync(join(root, 'lib', 'preload'), { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'preload', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: join(root, 'lib', 'preload', 'index.cjs'),
  external: ['electron'],
  logLevel: 'info',
})

for (const name of ['index.js', 'index.js.map']) {
  try {
    unlinkSync(join(root, 'lib', 'preload', name))
  } catch {
    // No stale ESM preload artifact.
  }
}
