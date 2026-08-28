/** Test doubles that do not import `@deepseek-ai/dsh-client-test-runtime`. */

import { vi } from 'vitest'
import { useSyncExternalStore } from 'react'

interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  base: unknown
  user: unknown
  revision: number | undefined
  writable: boolean
  mode: 'host' | 'memory'
}

interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** Handle over one stubbed settings scope. */
export interface StubSettingsScope<T> {
  /** The scope face handed to the service under test. */
  scope: SettingsScope<T>
  /** Spy behind `scope.set`. */
  set: ReturnType<typeof vi.fn>
  /** Spy behind `scope.unset`. */
  unset: ReturnType<typeof vi.fn>
  /** @returns how many listeners are currently subscribed. */
  listenerCount(): number
  /**
   * Replace part of the snapshot and notify subscribers.
   * @param next - snapshot fields to replace.
   */
  publish(next: Partial<SettingsScopeSnapshot<T>>): void
}

/**
 * In-memory settings scope: starts loading, records writes, publishes Host acceptances.
 * @returns the stub handle.
 */
export function stubSettingsScope<T>(): StubSettingsScope<T> {
  let snapshot: SettingsScopeSnapshot<T> = {
    status: 'loading', value: undefined, base: undefined, user: undefined,
    revision: undefined, writable: false, mode: 'host',
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(() => Promise.resolve())
  const unset = vi.fn(() => Promise.resolve())
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      unset,
    },
    set,
    unset,
    listenerCount: () => listeners.size,
    publish: (next) => {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * Bind a snapshot store to the slot `useStore` selector hook.
 * @param store - subscribe/getSnapshot source.
 * @returns a React selector hook.
 */
export function bindSnapshotSelector<T extends object>(store: {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}): <S>(selector: (state: T) => S) => S {
  return function useStore<S>(selector: (state: T) => S): S {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    return selector(snapshot)
  }
}
