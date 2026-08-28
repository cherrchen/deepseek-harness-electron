/** Shared Theme Studio identifiers used by Host settings and Client overlays. */

/** Durable Theme Studio section stored in the Host user-settings document. */
export interface ThemeStudioSettings {
  /** Applied builtin theme id, or `null` when no Theme Studio overlay is active. */
  activeThemeId: string | null
}

/** Host user-settings namespace owned by Theme Studio. */
export const THEME_STUDIO_SETTINGS_NAMESPACE = 'theme-studio'

/** Durable field storing the applied builtin theme id, or `null` for Default. */
export const ACTIVE_THEME_ID_FIELD = 'activeThemeId'

/** ThemeRuntime overlay source for the persisted Theme Studio theme. */
export const ACTIVE_SOURCE = '@dsh-electron/dsh-theme-studio:active'

/** ThemeRuntime overlay source for the transient preview theme. */
export const PREVIEW_SOURCE = '@dsh-electron/dsh-theme-studio:preview'
