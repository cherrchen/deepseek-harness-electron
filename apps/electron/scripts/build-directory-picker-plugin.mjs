/**
 * Build the Electron-local directory-picker client plugin into ModuleLoader format.
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')
const pluginRoot = join(root, 'runtime', 'plugins', 'ui-directory-picker-electron')

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
  throw new Error('esbuild not found for directory-picker client build')
}

const { build } = require(resolveEsbuild())

mkdirSync(join(pluginRoot, 'lib'), { recursive: true })

writeFileSync(
  join(pluginRoot, 'lib', 'index.js'),
  '/** Host half — empty; the OS chooser lives in Electron Main. */\nexport function apply() {}\n',
  'utf8',
)

const PACKAGE_ID = '@deepseek-ai/dsh-electron-ui-directory-picker'

const result = await build({
  entryPoints: [join(pluginRoot, 'src', 'client', 'index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  write: false,
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-ui-workspace/client'],
  logLevel: 'info',
})

const code = result.outputFiles?.[0]?.text
if (code === undefined) throw new Error('directory-picker client build produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    ${code}
    return module.exports;
  }
});
`

writeFileSync(join(pluginRoot, 'lib', 'client.js'), wrapped, 'utf8')
console.log('built', join(pluginRoot, 'lib', 'client.js'))
