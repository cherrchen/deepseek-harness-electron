/**
 * Bundle the sandboxed preload to one CommonJS file (Electron cannot load
 * package `"type":"module"` ESM preloads with relative imports under sandbox).
 */

import { createRequire } from 'node:module'
import { mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const esbuildPath = require.resolve('esbuild', { paths: [require.resolve('vite')] })
const { build } = require(esbuildPath)

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
