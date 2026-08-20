/** Native theme snapshot exposed to the renderer. */
export interface ThemeState {
  /** Whether the OS prefers a dark chrome palette. */
  shouldUseDarkColors: boolean
  /** Electron `nativeTheme.themeSource` value. */
  themeSource: 'system' | 'light' | 'dark'
}

/**
 * Build a theme snapshot from Electron nativeTheme fields.
 * @param shouldUseDarkColors - Current dark-mode preference.
 * @param themeSource - Active theme source.
 * @returns Serialisable theme state for IPC.
 */
export function themeState(
  shouldUseDarkColors: boolean,
  themeSource: ThemeState['themeSource'],
): ThemeState {
  return { shouldUseDarkColors, themeSource }
}
