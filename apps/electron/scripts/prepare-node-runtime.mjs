/** Download and verify the upstream Node.js runtime that carries the Windows Host process. */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import extractZip from 'extract-zip'

/** Node.js release shipped beside the Windows Host, matching the supported Desktop reference runtime. */
const NODE_VERSION = '24.17.0'
const BUILD_ROOT = join(resolve(import.meta.dirname, '..'), '.electron-build')
const DOWNLOAD_ROOT = join(BUILD_ROOT, 'downloads')
const NODE_ROOT = join(BUILD_ROOT, 'node')
const EXTRACT_ROOT = join(BUILD_ROOT, 'node-extract')
const VERSION = `v${NODE_VERSION}`

/**
 * Resolve the packaging target platform.
 * @returns {'win' | string} `win` for Windows targets, otherwise the host platform name.
 */
function targetPlatform() {
  const raw = process.env.DSH_ELECTRON_TARGET_PLATFORM ?? process.platform
  return raw === 'win32' ? 'win' : raw
}

/**
 * Resolve the packaging target architecture.
 * @returns {'x64' | 'arm64'} Supported Windows architecture.
 */
function targetArch() {
  const raw = process.env.DSH_ELECTRON_TARGET_ARCH ?? process.arch
  if (raw !== 'x64' && raw !== 'arm64') throw new Error(`prepare-node-runtime: unsupported architecture ${raw}`)
  return raw
}

/**
 * Write one remote file to disk with owner-only permissions.
 * @param {string} url - Absolute download URL.
 * @param {string} path - Destination file path.
 * @returns {Promise<void>} Resolves after the complete body is written.
 */
async function download(url, path) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`prepare-node-runtime: ${url} returned HTTP ${String(response.status)}`)
  writeFileSync(path, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 })
}

/**
 * Reject a candidate runtime that the build host cannot execute.
 * @param {string} executable - Extracted `node.exe`.
 * @param {'x64' | 'arm64'} arch - Architecture the runtime was prepared for.
 * @returns {void}
 */
function verifyNode(executable, arch) {
  if (process.platform !== 'win32' || process.arch !== arch) return
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true })
  if (result.error !== undefined || result.status !== 0 || result.stdout.trim() !== VERSION) {
    const detail = result.error?.message ?? result.signal ?? result.stderr.trim()
    throw new Error(`prepare-node-runtime: ${VERSION} failed executable verification: ${detail === '' ? `exit ${String(result.status)}` : detail}`)
  }
}

/**
 * Download, verify, and extract `node.exe` for one Windows architecture.
 * @param {'x64' | 'arm64'} arch - Target architecture.
 * @returns {Promise<string>} Directory holding the prepared runtime.
 */
async function prepareNode(arch) {
  const folder = `node-v${NODE_VERSION}-win-${arch}`
  const archiveName = `${folder}.zip`
  const destinationRoot = join(NODE_ROOT, `win-${arch}`)
  const destination = join(destinationRoot, 'node.exe')
  const versionFile = join(destinationRoot, 'VERSION')
  if (existsSync(destination) && existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === VERSION) {
    return destinationRoot
  }
  const releaseRoot = `https://nodejs.org/download/release/v${NODE_VERSION}`
  const archive = join(DOWNLOAD_ROOT, archiveName)
  const sums = join(DOWNLOAD_ROOT, `node-v${NODE_VERSION}-SHASUMS256.txt`)
  mkdirSync(DOWNLOAD_ROOT, { recursive: true })
  if (!existsSync(archive)) await download(`${releaseRoot}/${archiveName}`, archive)
  if (!existsSync(sums)) await download(`${releaseRoot}/SHASUMS256.txt`, sums)
  const line = (await readFile(sums, 'utf8')).split(/\r?\n/u).find(candidate => candidate.endsWith(`  ${archiveName}`))
  if (line === undefined) throw new Error(`prepare-node-runtime: ${archiveName} is absent from Node.js SHASUMS256.txt`)
  const expected = line.split(/\s+/u)[0]
  const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
  if (actual !== expected) throw new Error(`prepare-node-runtime: checksum mismatch for ${archiveName}`)

  rmSync(EXTRACT_ROOT, { recursive: true, force: true })
  mkdirSync(EXTRACT_ROOT, { recursive: true })
  await extractZip(archive, { dir: EXTRACT_ROOT })
  rmSync(destinationRoot, { recursive: true, force: true })
  mkdirSync(destinationRoot, { recursive: true })
  cpSync(join(EXTRACT_ROOT, folder, 'node.exe'), destination)
  rmSync(EXTRACT_ROOT, { recursive: true, force: true })
  // `VERSION` is what makes this directory reusable, so it is written only once the executable has
  // been verified: a rejected runtime must never be reused from the cache above or copied into
  // `current`, which is what `build.win.extraResources` ships.
  verifyNode(destination, arch)
  writeFileSync(versionFile, `${VERSION}\n`)
  return destinationRoot
}

/**
 * Copy the prepared runtime to the fixed path the package configuration references.
 * @param {string} sourceRoot - Prepared architecture directory.
 * @returns {void}
 */
function syncCurrent(sourceRoot) {
  const currentRoot = join(NODE_ROOT, 'current')
  const currentExe = join(currentRoot, 'node.exe')
  const sourceExe = join(sourceRoot, 'node.exe')
  const currentVersion = join(currentRoot, 'VERSION')
  if (
    existsSync(currentExe) && existsSync(currentVersion)
    && readFileSync(currentVersion, 'utf8').trim() === VERSION
    && statSync(currentExe).size === statSync(sourceExe).size
  ) return
  rmSync(currentRoot, { recursive: true, force: true })
  mkdirSync(currentRoot, { recursive: true })
  cpSync(sourceExe, currentExe)
  writeFileSync(currentVersion, `${VERSION}\n`)
}

async function main() {
  const platform = targetPlatform()
  if (platform !== 'win') {
    console.log(`prepare-node-runtime: ${platform} targets keep the Electron runtime; no Node.js download needed.`)
    return
  }
  const arch = targetArch()
  const prepared = await prepareNode(arch)
  syncCurrent(prepared)
  console.log(`prepare-node-runtime: ${prepared}`)
}

await main()
