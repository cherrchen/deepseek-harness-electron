import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
