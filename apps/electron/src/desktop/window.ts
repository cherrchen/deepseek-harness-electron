/** Main-window geometry and visibility snapshot. */
export interface WindowState {
  /** Whether the window is minimized. */
  isMinimized: boolean
  /** Whether the window is maximized. */
  isMaximized: boolean
  /** Whether the window is full-screen. */
  isFullScreen: boolean
  /** Whether the window is currently visible. */
  isVisible: boolean
  /** Whether the window is focused. */
  isFocused: boolean
}

/**
 * Snapshot BrowserWindow flags for the renderer.
 * @param flags - Live window flags.
 * @returns Serialisable window state.
 */
export function windowState(flags: WindowState): WindowState {
  return { ...flags }
}
