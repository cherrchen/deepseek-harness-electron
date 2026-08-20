import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/** npm package name of the Electron-local directory-picker client plugin. */
export const ELECTRON_DIRECTORY_PICKER_PACKAGE = '@deepseek-ai/dsh-electron-ui-directory-picker'

/**
 * Absolute path of the packaged Electron directory-picker plugin root.
 * @param appPath - Electron application root.
 * @returns Plugin directory containing `package.json` and `lib/`.
 */
export function electronDirectoryPickerPluginPath(appPath: string): string {
  return join(appPath, 'runtime', 'plugins', 'ui-directory-picker-electron')
}

/**
 * Copy the Host overlay into userData (so launches always use the packaged template).
 * @param appPath - Electron application root.
 * @param userDataPath - Writable Electron userData directory.
 * @returns Absolute path to the `--patch` YAML.
 */
export function resolveHostPatchPath(appPath: string, userDataPath: string): string {
  const templatePath = join(appPath, 'runtime', 'host.patch.yml')
  const template = readFileSync(templatePath, 'utf8')
  mkdirSync(userDataPath, { recursive: true })
  const patchPath = join(userDataPath, 'electron-host.patch.yml')
  writeFileSync(patchPath, template, 'utf8')
  return patchPath
}

/**
 * Symlink the Electron directory-picker package into the profile module fallback
 * so Host Loader and client-modules resolve it by package name. Heal only adds
 * links from the dsh closure; it does not remove this Electron-owned link.
 * @param appPath - Electron application root.
 * @param harnessHome - `$DSH_HOME` root used by the supervised Host.
 */
export function ensureElectronDirectoryPickerLinked(appPath: string, harnessHome: string): void {
  const target = electronDirectoryPickerPluginPath(appPath)
  if (!existsSync(join(target, 'package.json'))) {
    throw new Error(`desktop host patch: directory picker plugin missing at ${target}`)
  }
  if (!existsSync(join(target, 'lib', 'index.js'))) {
    throw new Error(`desktop host patch: directory picker plugin lib/index.js missing at ${target}`)
  }
  const link = join(
    harnessHome,
    'profiles',
    'node_modules',
    ...ELECTRON_DIRECTORY_PICKER_PACKAGE.split('/'),
  )
  mkdirSync(dirname(link), { recursive: true })
  ensureSymlink(link, target)
}

/**
 * Create or repair a directory symlink (junction on Windows).
 * @param link - Symlink path under profiles/node_modules.
 * @param target - Absolute plugin directory.
 */
export function ensureSymlink(link: string, target: string): void {
  try {
    const current = readlinkSync(link)
    if (current === target) return
    unlinkSync(link)
  } catch (error: unknown) {
    if (!isMissingPathError(error)) {
      try {
        if (lstatSync(link).isSymbolicLink() || lstatSync(link).isDirectory()) unlinkSync(link)
      } catch {
        // Race or already gone.
      }
    }
  }
  symlinkSync(target, link, 'junction')
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * Copy runtime overlay files into a destination tree (tests / packaging helpers).
 * @param appPath - Source application root containing `runtime/`.
 * @param destinationRoot - Destination application root.
 */
export function copyRuntimeOverlay(appPath: string, destinationRoot: string): void {
  const from = join(appPath, 'runtime', 'host.patch.yml')
  const toDir = join(destinationRoot, 'runtime')
  mkdirSync(toDir, { recursive: true })
  copyFileSync(from, join(toDir, 'host.patch.yml'))
}
