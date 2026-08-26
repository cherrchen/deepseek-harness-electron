/** Test stand-in for `@deepseek-ai/dsh-client-runtime/client` named exports. */

type Listener = () => void

interface StoreSpec<S extends object, A extends Record<string, (draft: S, ...args: never[]) => void>> {
  init: () => S
  actions: A
}

type Bound<A> = {
  [K in keyof A]: A[K] extends (draft: never, ...args: infer P) => void ? (...args: P) => void : never
}

/**
 * Minimal defineStore compatible with Theme Studio's slot store.
 * @param spec - init snapshot and draft-mutating actions.
 * @returns a handle whose `create()` yields subscribe/getSnapshot/actions.
 */
export function defineStore<S extends object, A extends Record<string, (draft: S, ...args: never[]) => void>>(
  spec: StoreSpec<S, A>,
) {
  return {
    create() {
      let state = spec.init()
      const listeners = new Set<Listener>()
      const notify = (): void => {
        for (const listener of [...listeners]) listener()
      }
      const actions = {} as Bound<A>
      for (const name of Object.keys(spec.actions) as (keyof A)[]) {
        const impl = spec.actions[name]
        actions[name] = ((...args: never[]) => {
          impl(state, ...args)
          notify()
        }) as Bound<A>[typeof name]
      }
      return {
        getSnapshot: () => state,
        subscribe: (listener: Listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        actions,
      }
    },
  }
}

export type EngineStoreHandle<S extends object, A> = ReturnType<typeof defineStore<S, A & Record<string, (draft: S, ...args: never[]) => void>>>
