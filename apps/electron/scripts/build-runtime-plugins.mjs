/**
 * Discover, validate, and build bundled Desktop runtime plugins under runtime/plugins/.
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')
const pluginsRoot = join(root, 'runtime', 'plugins')

/** Baseline browser externals for every client plugin bundle. */
const CLIENT_BASELINE_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
]

/**
 * @param {string} base
 * @returns {string}
 */
function resolveEsbuild(base) {
  for (const search of [base, repoRoot]) {
    try {
      return require.resolve('esbuild', { paths: [search] })
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
  throw new Error('esbuild not found for runtime plugin build')
}

const { build } = require(resolveEsbuild(root))

/**
 * @param {string} pluginRoot
 * @returns {Record<string, unknown>}
 */
function readPluginManifest(pluginRoot) {
  const manifestPath = join(pluginRoot, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`runtime plugin build: missing package.json at ${pluginRoot}`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`runtime plugin build: invalid package.json at ${manifestPath}: ${error}`)
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error(`runtime plugin build: package name missing in ${manifestPath}`)
  }
  return manifest
}

/**
 * @param {string} pluginRoot
 * @param {Record<string, unknown>} manifest
 */
function validatePluginSources(pluginRoot, manifest) {
  const hostEntry = join(pluginRoot, 'src', 'index.ts')
  if (!existsSync(hostEntry)) {
    throw new Error(`runtime plugin build: missing Host entry ${hostEntry}`)
  }
  const dsh = /** @type {{ client?: { inject?: string[]; external?: string[] } } | undefined} */ (manifest.dsh)
  if (dsh?.client !== undefined) {
    const clientEntry = join(pluginRoot, 'src', 'client', 'index.ts')
    if (!existsSync(clientEntry)) {
      throw new Error(`runtime plugin build: ${manifest.name} declares dsh.client but missing ${clientEntry}`)
    }
    if (manifest.exports === undefined || !('./client' in /** @type {Record<string, string>} */ (manifest.exports))) {
      throw new Error(`runtime plugin build: ${manifest.name} declares dsh.client but missing ./client export`)
    }
  }
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
function clientExternals(manifest) {
  const dsh = /** @type {{ client?: { inject?: string[]; external?: string[] } } | undefined} */ (manifest.dsh)
  const inject = dsh?.client?.inject ?? []
  const external = dsh?.client?.external ?? []
  const fromManifest = [...inject, ...external].flatMap(spec => {
    if (typeof spec !== 'string') return []
    return spec.endsWith('/client') ? [spec, spec.replace(/\/client$/, '')] : [spec]
  })
  return [...new Set([...CLIENT_BASELINE_EXTERNALS, ...fromManifest])]
}

/**
 * Compile CSS Modules into a class map and a plugin-owned inline style.
 * @param {string} packageId
 * @returns {import('esbuild').Plugin}
 */
function clientCssModules(packageId) {
  return {
    name: 'dsh-electron-css-modules-inline',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, args => ({
        path: join(args.resolveDir, args.path),
        namespace: 'dsh-electron-css',
      }))
      build.onLoad({ filter: /.*/, namespace: 'dsh-electron-css' }, (args) => {
        const source = readFileSync(args.path)
        const { code, exports: cssExports } = transform({
          filename: args.path,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap = {}
        for (const [local, value] of Object.entries(cssExports ?? {})) classMap[local] = value.name
        const tagId = `${packageId}/${basename(args.path)}`
        return {
          loader: 'js',
          contents: [
            `const css = ${JSON.stringify(code.toString())};`,
            'if (typeof document !== "undefined") {',
            '  const tag = document.createElement("style");',
            `  tag.dataset.plugin = ${JSON.stringify(packageId)};`,
            `  tag.dataset.pluginCss = ${JSON.stringify(tagId)};`,
            '  tag.textContent = css;',
            '  document.head.append(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`,
          ].join('\n'),
        }
      })
    },
  }
}

/**
 * @param {string} pluginRoot
 */
async function buildHostHalf(pluginRoot) {
  const outDir = join(pluginRoot, 'lib')
  mkdirSync(outDir, { recursive: true })
  await build({
    entryPoints: [join(pluginRoot, 'src', 'index.ts')],
    outfile: join(outDir, 'index.js'),
    bundle: true,
    platform: 'node',
    packages: 'external',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  })
}

/**
 * @param {string} pluginRoot
 * @param {string} packageId
 * @param {Record<string, unknown>} manifest
 */
async function buildClientHalf(pluginRoot, packageId, manifest) {
  const outDir = join(pluginRoot, 'lib')
  mkdirSync(outDir, { recursive: true })
  const result = await build({
    entryPoints: [join(pluginRoot, 'src', 'client', 'index.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    write: false,
    // Pin automatic JSX. esbuild otherwise follows the nearest tsconfig.json;
    // a solution-style package file with no `jsx` setting emits
    // `React.createElement` without importing `React`.
    jsx: 'automatic',
    external: clientExternals(manifest),
    plugins: [clientCssModules(packageId)],
    logLevel: 'silent',
  })
  const code = result.outputFiles?.[0]?.text
  if (code === undefined) {
    throw new Error(`runtime plugin build: ${packageId} client build produced no output`)
  }
  const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    ${code}
    return module.exports;
  }
});
`
  writeFileSync(join(outDir, 'client.js'), wrapped, 'utf8')
}

/**
 * @param {string} pluginRoot
 */
async function buildPlugin(pluginRoot) {
  const manifest = readPluginManifest(pluginRoot)
  validatePluginSources(pluginRoot, manifest)
  await buildHostHalf(pluginRoot)
  const dsh = /** @type {{ client?: unknown } | undefined} */ (manifest.dsh)
  if (dsh?.client !== undefined) {
    await buildClientHalf(pluginRoot, manifest.name, manifest)
  }
  console.log('built', join(pluginRoot, 'lib'))
}

if (!existsSync(pluginsRoot)) {
  throw new Error(`runtime plugin build: plugins directory missing at ${pluginsRoot}`)
}

const entries = readdirSync(pluginsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(pluginsRoot, entry.name))

if (entries.length === 0) {
  throw new Error(`runtime plugin build: no plugin directories under ${pluginsRoot}`)
}

for (const pluginRoot of entries) {
  await buildPlugin(pluginRoot)
}
