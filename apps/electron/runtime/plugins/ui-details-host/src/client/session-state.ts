/**
 * Per-session details navigation state: the live tab list plus launcher and
 * MRU bookkeeping. Memory only; cleared on Host unload or when a session
 * disappears from the sessions list.
 */
import type { DetailsSurfaceInstance } from './contract.ts'

/** Maximum tabs retained per session; oldest non-active tabs are evicted. */
export const DETAILS_TAB_LIMIT = 20

/**
 * One session's tabbed navigation state.
 * `activeInstanceId` selects among `tabs`; `mru` holds other-tab instance ids
 * most-recent-first (the compatibility face of the v2 back stack);
 * `launcherVisible` shows the Launcher page over the active tab.
 */
export interface DetailsSessionState {
  tabs: DetailsSurfaceInstance[]
  activeInstanceId: string | null
  launcherVisible: boolean
  mru: string[]
}

/**
 * Create an empty session navigation record.
 * @returns idle session state.
 */
export function emptySessionState(): DetailsSessionState {
  return { tabs: [], activeInstanceId: null, launcherVisible: false, mru: [] }
}

/** In-memory map of session id → details navigation state. */
export class DetailsSessionStore {
  readonly #bySession = new Map<string, DetailsSessionState>()

  /**
   * Read session state without creating it.
   * @param sessionId - session key.
   * @returns the state, or undefined when never opened.
   */
  get(sessionId: string): DetailsSessionState | undefined {
    return this.#bySession.get(sessionId)
  }

  /**
   * Read or create session state.
   * @param sessionId - session key.
   * @returns mutable session state.
   */
  getOrCreate(sessionId: string): DetailsSessionState {
    let state = this.#bySession.get(sessionId)
    if (state === undefined) {
      state = emptySessionState()
      this.#bySession.set(sessionId, state)
    }
    return state
  }

  /**
   * Drop one session's retained navigation.
   * @param sessionId - session key to purge.
   */
  delete(sessionId: string): void {
    this.#bySession.delete(sessionId)
  }

  /** Drop every session's retained navigation. */
  clear(): void {
    this.#bySession.clear()
  }

  /**
   * @returns session ids currently retained in the store.
   */
  keys(): IterableIterator<string> {
    return this.#bySession.keys()
  }
}
