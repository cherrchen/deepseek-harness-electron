import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeTextFileAtomic } from './text-file.ts'

/** Writable Host patch passed to the supervised `dsh web` process. */
export interface HostRuntimeOverlay {
  patchPath: string
}

/**
 * Copy the packaged Desktop composition into writable user data.
 * @param appPath - Electron application root.
 * @param userDataPath - Writable Electron userData directory.
 * @returns Writable Host patch path.
 */
export async function prepareHostRuntimeOverlay(appPath: string, userDataPath: string): Promise<HostRuntimeOverlay> {
  mkdirSync(userDataPath, { recursive: true })
  const patchPath = join(userDataPath, 'electron-host.patch.yml')
  await writeTextFileAtomic(patchPath, readFileSync(join(appPath, 'runtime', 'host.patch.yml'), 'utf8'))
  return { patchPath }
}

/**
 * Copy the Host overlay into a destination tree for packaging or tests.
 * @param appPath - Source application root.
 * @param destinationRoot - Destination application root.
 */
export function copyRuntimeOverlay(appPath: string, destinationRoot: string): void {
  const from = join(appPath, 'runtime', 'host.patch.yml')
  const toDir = join(destinationRoot, 'runtime')
  mkdirSync(toDir, { recursive: true })
  copyFileSync(from, join(toDir, 'host.patch.yml'))
}
