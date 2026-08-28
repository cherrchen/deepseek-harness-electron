import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PLUGIN_RUNTIME_CONFIG_FILENAME } from './plugin-runtime-config.ts'
import { writeTextFileAtomic } from './text-file.ts'

/**
 * Runtime overlay paths owned by Electron Main.
 */
export interface HostRuntimeOverlay {
  /** Writable `--patch` path passed to `dsh web`. */
  patchPath: string
  /** `<DSH_HOME>/electron/` runtime directory. */
  pluginRuntimeDirectory: string
  /** Generated desired-roster config watched by Cordis HMR. */
  pluginConfigPath: string
  /** Persisted disabled-set state file. */
  pluginStatePath: string
}

const PLUGIN_CONFIG_URL_PLACEHOLDER = '__DSH_ELECTRON_PLUGIN_CONFIG_URL__'
const PLUGIN_RUNTIME_BASE_URL_PLACEHOLDER = '__DSH_ELECTRON_PLUGIN_RUNTIME_BASE_URL__'

/**
 * Prepare Electron's runtime-rendered Host overlay and plugin storage paths.
 * @param appPath - Electron application root.
 * @param userDataPath - Writable Electron userData directory.
 * @param harnessHome - `$DSH_HOME` root used by the supervised Host.
 * @returns Writable overlay and runtime file paths.
 */
export async function prepareHostRuntimeOverlay(
  appPath: string,
  userDataPath: string,
  harnessHome: string,
): Promise<HostRuntimeOverlay> {
  const pluginRuntimeDirectory = join(harnessHome, 'electron')
  mkdirSync(pluginRuntimeDirectory, { recursive: true })
  mkdirSync(userDataPath, { recursive: true })
  const pluginConfigPath = join(pluginRuntimeDirectory, PLUGIN_RUNTIME_CONFIG_FILENAME)
  const pluginStatePath = join(pluginRuntimeDirectory, 'plugin-state.json')
  const patchPath = join(userDataPath, 'electron-host.patch.yml')
  const templatePath = join(appPath, 'runtime', 'host.patch.yml')
  const template = readFileSync(templatePath, 'utf8')
  const rendered = renderHostOverlayTemplate(
    template,
    pathToFileURL(pluginConfigPath).href,
    pathToFileURL(pluginRuntimeDirectory).href,
  )
  await writeTextFileAtomic(patchPath, rendered)
  return {
    patchPath,
    pluginRuntimeDirectory,
    pluginConfigPath,
    pluginStatePath,
  }
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

/**
 * Render the packaged Host overlay template with runtime file URLs.
 * @param template - Overlay template text.
 * @param pluginConfigUrl - File URL for `plugins.cordis.yml`.
 * @param runtimeBaseUrl - File URL for `<DSH_HOME>/electron/`.
 * @returns Rendered overlay ready for `--patch`.
 */
export function renderHostOverlayTemplate(
  template: string,
  pluginConfigUrl: string,
  runtimeBaseUrl: string,
): string {
  return replaceExactPlaceholder(
    replaceExactPlaceholder(template, PLUGIN_CONFIG_URL_PLACEHOLDER, pluginConfigUrl),
    PLUGIN_RUNTIME_BASE_URL_PLACEHOLDER,
    runtimeBaseUrl,
  )
}

function replaceExactPlaceholder(template: string, placeholder: string, value: string): string {
  const matches = template.match(new RegExp(escapeRegExp(placeholder), 'g')) ?? []
  if (matches.length !== 1) {
    throw new Error(`runtime overlay: expected exactly one ${placeholder} placeholder, found ${String(matches.length)}`)
  }
  return template.replace(placeholder, value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
