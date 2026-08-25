/**
 * Per-session details navigation state. Memory only; cleared on Host unload
 * or when a session disappears from the sessions list.
 */
import type { DetailsSurfaceInstance } from './contract.ts'

/** Maximum back-stack depth retained per session. */
export const DETAILS_HISTORY_LIMIT = 20

/** One session's active surface and bounded back stack. */
export interface DetailsSessionState {
  active: DetailsSurfaceInstance | null
  backStack: DetailsSurfaceInstance[]
}

/**
 * Create an empty session navigation record.
 * @returns idle session state.
 */
export function emptySessionState(): DetailsSessionState {
  return { active: null, backStack: [] }
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
