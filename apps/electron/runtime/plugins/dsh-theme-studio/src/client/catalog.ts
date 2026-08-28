/** Builtin catalog used until Stage 2 replaces it with a Theme Library. */

import { BUILTIN_PRESETS } from './presets.ts'
import type { BuiltinThemePreset, ThemeCatalog } from './types.ts'

/** In-memory registry over compiled builtin presets. */
export class BuiltinPresetRegistry implements ThemeCatalog {
  /**
   * @param presets - frozen builtin list; defaults to the Stage 1 set.
   */
  constructor(private readonly presets: readonly BuiltinThemePreset[] = BUILTIN_PRESETS) {}

  /**
   * Resolve one builtin theme.
   * @param id - namespaced theme id.
   * @returns the preset, or `undefined` when the id is unknown.
   */
  get(id: string): BuiltinThemePreset | undefined {
    return this.presets.find(preset => preset.id === id)
  }

  /**
   * List builtin themes in display order.
   * @returns the catalog snapshot.
   */
  list(): readonly BuiltinThemePreset[] {
    return this.presets
  }
}
