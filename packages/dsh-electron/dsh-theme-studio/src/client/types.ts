/** Internal Stage 1 theme data. Not a public cross-plugin exchange format. */

/** Four-color chip shown on a theme card. */
export interface ThemePreview {
  /** Card mosaic background. */
  background: string
  /** Card mosaic raised surface. */
  surface: string
  /** Card mosaic foreground sample. */
  foreground: string
  /** Card mosaic accent sample. */
  accent: string
}

/** Stage 1 token names already declared by ThemeRuntime. */
export const STAGE1_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
] as const

/** One Stage 1 token name. */
export type Stage1Token = typeof STAGE1_TOKENS[number]

/** One builtin palette keyed by Stage 1 token names. */
export type ThemeTokenPalette = Record<Stage1Token, string>

/**
 * Compiled builtin theme. Stage 2 may replace this with a ThemeManifest
 * adapter feeding the same `presetToOverrides` conversion.
 */
export interface BuiltinThemePreset {
  /** Namespaced theme id; never `light`, `dark`, `system`, or `default`. */
  id: string
  /** English display name used until locale dictionaries resolve. */
  name: string
  /** Optional English description. */
  description?: string
  /** Light and dark palettes; every defined token must exist in both. */
  tokens: {
    /** Values applied while the official light base palette is active. */
    light: Record<string, string>
    /** Values applied while the official dark base palette is active. */
    dark: Record<string, string>
  }
  /** Card mosaic colors for each official color scheme. */
  preview: {
    /** Mosaic while Appearance is light. */
    light: ThemePreview
    /** Mosaic while Appearance is dark. */
    dark: ThemePreview
  }
}

/** Lookup used by Theme Studio runtime; Stage 2 can swap the implementation. */
export interface ThemeCatalog {
  /**
   * Resolve one theme by id.
   * @param id - namespaced theme id.
   * @returns the preset, or `undefined` when the id is unknown.
   */
  get(id: string): BuiltinThemePreset | undefined
  /**
   * List builtin themes in display order.
   * @returns the catalog snapshot.
   */
  list(): readonly BuiltinThemePreset[]
}
