import type { OpenDialogOptions } from 'electron'

/** Options accepted by the typed desktop directory picker. */
export interface PickDirectoryOptions {
  /** Optional dialog title shown by the OS chooser. */
  title?: string
  /** Optional starting directory. */
  defaultPath?: string
}

/** Successful directory selection returned to the renderer. */
export interface PickDirectoryResult {
  /** Absolute path of the selected directory. */
  path: string
}

/**
 * Map bridge options to Electron `showOpenDialog` options for a single directory.
 * @param options - Optional title and starting path from the renderer.
 * @returns Electron open-dialog options restricted to directories.
 */
export function directoryOpenDialogOptions(
  options: PickDirectoryOptions = {},
): OpenDialogOptions {
  return {
    properties: ['openDirectory', 'createDirectory'],
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.defaultPath === undefined ? {} : { defaultPath: options.defaultPath }),
  }
}

/**
 * Convert an Electron dialog result into the bridge payload.
 * @param canceled - Whether the user dismissed the dialog.
 * @param filePaths - Paths returned by Electron.
 * @returns Selected directory, or null when canceled / empty.
 */
export function pickDirectoryResult(
  canceled: boolean,
  filePaths: readonly string[],
): PickDirectoryResult | null {
  if (canceled) return null
  const path = filePaths[0]
  if (path === undefined || path.length === 0) return null
  return { path }
}
