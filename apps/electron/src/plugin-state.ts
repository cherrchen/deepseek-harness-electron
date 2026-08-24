import { existsSync, readFileSync } from 'node:fs'
import { writeTextFileAtomic } from './text-file.ts'

/** Current on-disk version of Electron's plugin preference file. */
export const PLUGIN_STATE_VERSION = 1

/** Persisted user preferences for bundled ecosystem plugin enablement. */
export interface PluginState {
  /** File-format version for future migrations. */
  version: typeof PLUGIN_STATE_VERSION
  /** Distribution plugin package names explicitly disabled by the user. */
  disabled: string[]
}

/** Parsed state plus normalization diagnostics. */
export interface LoadedPluginState {
  /** Normalized state used by startup and lifecycle operations. */
  state: PluginState
  /** Whether the caller should rewrite the file on the next successful save. */
  dirty: boolean
  /** Diagnostics the caller may log. */
  warnings: string[]
}

/**
 * Read the plugin-state file if present; invalid content falls back without failing startup.
 * @param path - Absolute path to `plugin-state.json`.
 * @returns Normalized state plus warnings.
 */
export function loadPluginState(path: string): LoadedPluginState {
  if (!existsSync(path)) {
    return {
      state: emptyPluginState(),
      dirty: false,
      warnings: [],
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    return {
      state: emptyPluginState(),
      dirty: false,
      warnings: [`plugin state: failed to parse ${path}: ${String(error)}`],
    }
  }
  const normalized = normalizePluginState(parsed)
  return {
    state: normalized.state,
    dirty: normalized.dirty,
    warnings: normalized.warnings.map(warning => `plugin state: ${warning} (${path})`),
  }
}

/**
 * Remove disabled names absent from the current distribution inventory.
 * @param state - Parsed persisted state.
 * @param availableNames - Current bundled ecosystem package names.
 * @returns Reconciled state plus removed stale names.
 */
export function reconcilePluginState(
  state: PluginState,
  availableNames: readonly string[],
): { state: PluginState; removed: string[] } {
  const available = new Set(availableNames)
  const kept: string[] = []
  const removed: string[] = []
  for (const name of state.disabled) {
    if (available.has(name)) kept.push(name)
    else removed.push(name)
  }
  return {
    state: {
      version: PLUGIN_STATE_VERSION,
      disabled: kept,
    },
    removed,
  }
}

/**
 * Persist plugin state after a runtime operation reaches its target composition.
 * @param path - Absolute path to `plugin-state.json`.
 * @param state - State to write.
 */
export async function savePluginState(path: string, state: PluginState): Promise<void> {
  const normalized = normalizePluginState(state).state
  const rendered = `${JSON.stringify(normalized, undefined, 2)}\n`
  await writeTextFileAtomic(path, rendered)
}

function emptyPluginState(): PluginState {
  return {
    version: PLUGIN_STATE_VERSION,
    disabled: [],
  }
}

function normalizePluginState(value: unknown): LoadedPluginState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      state: emptyPluginState(),
      dirty: false,
      warnings: ['top-level JSON value must be an object; using defaults'],
    }
  }
  const record = value as { version?: unknown; disabled?: unknown }
  if (record.version !== PLUGIN_STATE_VERSION) {
    return {
      state: emptyPluginState(),
      dirty: false,
      warnings: [`unsupported version ${JSON.stringify(record.version)}; using defaults`],
    }
  }
  const warnings: string[] = []
  const seen = new Set<string>()
  const disabled: string[] = []
  if (!Array.isArray(record.disabled)) {
    warnings.push('disabled must be an array; using defaults')
  } else {
    for (const item of record.disabled) {
      if (typeof item !== 'string' || item.length === 0) {
        warnings.push('disabled contains a non-string entry; dropping it')
        continue
      }
      if (seen.has(item)) {
        warnings.push(`disabled repeats ${JSON.stringify(item)}; deduplicating`)
        continue
      }
      seen.add(item)
      disabled.push(item)
    }
  }
  return {
    state: {
      version: PLUGIN_STATE_VERSION,
      disabled,
    },
    dirty: warnings.length > 0,
    warnings,
  }
}
