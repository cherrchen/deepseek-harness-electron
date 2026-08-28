/** Updater lifecycle exposed through the typed desktop bridge. */
export type DesktopUpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

/** Snapshot returned by `desktop.updater.getState`. */
export interface DesktopUpdaterSnapshot {
  /** Current lifecycle state. */
  state: DesktopUpdaterState
  /** Download progress percent when downloading. */
  progress?: number
  /** Update channel label when known. */
  channel?: 'prerelease' | 'stable'
}

/**
 * Map the Main updater controller state onto the bridge enum.
 * @param state - Controller state from `createUpdater`.
 * @param progress - Optional download percent.
 * @param channel - Active update channel.
 * @returns Bridge snapshot.
 */
export function updaterSnapshot(
  state: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error',
  progress: number | undefined,
  channel: 'prerelease' | 'stable',
): DesktopUpdaterSnapshot {
  const mapped: DesktopUpdaterState = state === 'idle' ? 'idle'
    : state === 'checking' ? 'checking'
      : state === 'downloading' ? 'downloading'
        : state === 'downloaded' ? 'downloaded'
          : 'error'
  return {
    state: mapped,
    ...(progress === undefined ? {} : { progress }),
    channel,
  }
}
