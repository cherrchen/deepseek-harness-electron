/**
 * Rasterize the tracked DeepSeek tray SVG into per-DPI PNGs for each platform variant.
 */

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')
const assetsDir = join(root, 'assets', 'tray')
const buildDir = join(root, 'build')
const trayDir = join(buildDir, 'tray')

/** @type {{ rasterSizesPx: number[]; glyphScale: number; macTemplate: { basePx: number; glyphScale: number } }} */
const sourceMeta = JSON.parse(readFileSync(join(assetsDir, 'source.json'), 'utf8'))

/** @type {ReadonlyArray<{ prefix: string; fill: string; sizes: readonly number[] }>} */
const VARIANTS = [
  { prefix: 'deepseek-black', fill: '#000000', sizes: sourceMeta.rasterSizesPx },
  { prefix: 'deepseek-white', fill: '#ffffff', sizes: sourceMeta.rasterSizesPx },
]

/** @type {ReadonlyArray<{ filename: string; size: number; glyphScale: number }>} */
const MAC_TEMPLATE_OUTPUTS = [
  { filename: 'deepseekTemplate.png', size: sourceMeta.macTemplate.basePx, glyphScale: sourceMeta.macTemplate.glyphScale },
  {
    filename: 'deepseekTemplate@2x.png',
    size: sourceMeta.macTemplate.basePx * 2,
    glyphScale: sourceMeta.macTemplate.glyphScale,
  },
]

function resolveSharp() {
  for (const base of [root, repoRoot]) {
    try {
      return require(require.resolve('sharp', { paths: [base] }))
    } catch {
      // Continue searching.
    }
  }
  const pnpm = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(pnpm)) {
    for (const entry of readdirSync(pnpm)) {
      if (!entry.startsWith('sharp@')) continue
      const candidate = join(pnpm, entry, 'node_modules', 'sharp')
      if (existsSync(candidate)) return require(candidate)
    }
  }
  throw new Error('sharp not found; install workspace dependencies before building tray icons')
}

const sharp = resolveSharp()
const svgTemplate = readFileSync(join(assetsDir, 'deepseek.svg'), 'utf8')

/**
 * @param {string} fill
 * @returns {Buffer}
 */
function coloredSvg(fill) {
  return Buffer.from(svgTemplate.replaceAll('fill="currentColor"', `fill="${fill}"`))
}

/**
 * @param {Buffer} svg
 * @param {number} size
 * @param {number} glyphScale
 * @returns {Promise<Buffer>}
 */
async function rasterizeTrayIcon(svg, size, glyphScale) {
  const inner = Math.max(1, Math.round(size * glyphScale))
  const glyph = await sharp(svg).resize(inner, inner, { fit: 'contain' }).png().toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: glyph, gravity: 'center' }]).png().toBuffer()
}

mkdirSync(trayDir, { recursive: true })
copyFileSync(join(assetsDir, 'LICENSE.lobe-icons'), join(buildDir, 'LICENSE.lobe-icons'))

const manifest = {
  sourceSvgSha256: createHash('sha256').update(readFileSync(join(assetsDir, 'deepseek.svg'))).digest('hex'),
  glyphScale: sourceMeta.glyphScale,
  macTemplate: sourceMeta.macTemplate,
  outputs: /** @type {Record<string, string>} */ ({}),
}

for (const variant of VARIANTS) {
  const svg = coloredSvg(variant.fill)
  for (const size of variant.sizes) {
    const filename = `${variant.prefix}-${size}.png`
    const outputPath = join(trayDir, filename)
    const png = await rasterizeTrayIcon(svg, size, sourceMeta.glyphScale)
    writeFileSync(outputPath, png)
    manifest.outputs[filename] = createHash('sha256').update(png).digest('hex')
  }
}

const templateSvg = coloredSvg('#000000')
for (const output of MAC_TEMPLATE_OUTPUTS) {
  const outputPath = join(trayDir, output.filename)
  const png = await rasterizeTrayIcon(templateSvg, output.size, output.glyphScale)
  writeFileSync(outputPath, png)
  manifest.outputs[output.filename] = createHash('sha256').update(png).digest('hex')
}

writeFileSync(join(trayDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.info(`[build-tray-icons] wrote ${Object.keys(manifest.outputs).length} PNGs to ${trayDir}`)
