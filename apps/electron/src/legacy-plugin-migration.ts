import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SCHEMA, Type, load } from 'js-yaml'
import { readTextFile, writeTextFileAtomic } from './text-file.ts'

const pluginStateFile = 'plugin-state.json'
const migrationMarker = 'plugin-state-v2-migrated'
const jsSchema = DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind: 'scalar' })])

interface LegacyPluginState {
  version: 2
  disabled: string[]
  profileManaged: string[]
}

/**
 * Transfer Desktop-managed runtime plugins into the Web profile's persistent patch.
 * The legacy state remains on disk; the marker prevents a later user removal from being undone.
 * @param harnessHome - Active DSH home.
 */
export async function migrateLegacyPluginState(harnessHome: string): Promise<void> {
  const electronDir = join(harnessHome, 'electron')
  const statePath = join(electronDir, pluginStateFile)
  if (!existsSync(statePath) || existsSync(join(electronDir, migrationMarker))) return

  const parsedState: unknown = JSON.parse(readFileSync(statePath, 'utf8'))
  const state = parseLegacyState(parsedState)
  if (state.profileManaged.length === 0) {
    await writeTextFileAtomic(join(electronDir, migrationMarker), 'Web profile patch owns migrated plugin enablement.\n')
    return
  }
  const profileDir = join(harnessHome, 'profiles', 'web')
  const manifestPath = join(profileDir, 'package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const dependencies = profileDependencies(manifest)
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const source = await readTextFile(patchPath) ?? '[]\n'
  const patches: unknown = load(source, { schema: jsSchema })
  if (!Array.isArray(patches)) throw new Error(`Legacy plugin migration: profile patch must be a YAML sequence: ${patchPath}`)
  const existingIds = new Set<string>()
  const existingNames = new Set<string>()
  collectEntries(patches, existingIds, existingNames)

  const disabled = new Set(state.disabled)
  const additions: string[] = []
  for (const name of state.profileManaged) {
    if (!Object.hasOwn(dependencies, name)) {
      throw new Error(`Legacy plugin migration: ${name} is absent from ${manifestPath}`)
    }
    const pluginPath = join(profileDir, 'node_modules', ...name.split('/'), 'package.json')
    const plugin: unknown = JSON.parse(readFileSync(pluginPath, 'utf8'))
    if (!isRecord(plugin) || plugin.name !== name) {
      throw new Error(`Legacy plugin migration: invalid installed package ${name} at ${pluginPath}`)
    }
    if (isRecord(plugin.dsh) && isRecord(plugin.dsh.bundle)) continue
    if (typeof plugin.main !== 'string' && plugin.exports === undefined) {
      throw new Error(`Legacy plugin migration: ${name} has no Host entry`)
    }
    const id = `electron-migrated:${name}`
    if (existingIds.has(id) || existingNames.has(name)) continue
    additions.push(`- insert:\n    - id: ${JSON.stringify(id)}\n      name: ${JSON.stringify(name)}${disabled.has(name) ? '\n      disabled: true' : ''}`)
    existingIds.add(id)
    existingNames.add(name)
  }

  if (additions.length > 0) {
    const initial = patches.length === 0 ? source.replace(/^\s*\[\](?:\s*#.*)?\s*$/m, '').trimEnd() : source.trimEnd()
    await writeTextFileAtomic(patchPath, `${initial.length > 0 ? `${initial}\n` : ''}${additions.join('\n')}\n`)
  }
  await writeTextFileAtomic(join(electronDir, migrationMarker), 'Web profile patch owns migrated plugin enablement.\n')
}

function parseLegacyState(value: unknown): LegacyPluginState {
  if (!isRecord(value) || value.version !== 2 || !isNames(value.disabled) || !isNames(value.profileManaged)) {
    throw new Error('Legacy plugin migration: plugin-state.json must contain version 2 and string name lists')
  }
  return { version: 2, disabled: value.disabled, profileManaged: value.profileManaged }
}

function profileDependencies(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.dependencies)) {
    throw new Error('Legacy plugin migration: Web profile has no dependency manifest')
  }
  return value.dependencies
}

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === 'string'
    && /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectEntries(value: unknown, ids: Set<string>, names: Set<string>, inserted = false): void {
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (!isRecord(item)) continue
    if (typeof item.id === 'string') ids.add(item.id)
    if (inserted && typeof item.name === 'string') names.add(item.name)
    collectEntries(item.insert, ids, names, true)
  }
}
