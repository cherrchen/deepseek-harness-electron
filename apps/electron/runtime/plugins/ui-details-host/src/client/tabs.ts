/**
 * Tab navigation helpers over one session state: dedupe lookup, activation,
 * close with fallback, surface pruning, and the MRU history face.
 */
import type { DetailsSurfaceDescriptor, DetailsSurfaceInstance } from './contract.ts'
import { DETAILS_TAB_LIMIT, type DetailsSessionState } from './session-state.ts'

/**
 * Compute a dedupe key for a surface open, when the descriptor defines one.
 * @param descriptor - optional surface descriptor.
 * @param payload - open payload.
 * @returns dedupe key, or undefined when dedupe does not apply.
 */
export function resolveDedupeKey(
  descriptor: DetailsSurfaceDescriptor | undefined,
  payload: unknown,
): string | undefined {
  if (descriptor?.dedupeKey === undefined) return undefined
  return descriptor.dedupeKey(payload)
}

/**
 * Find an existing tab matching surface id + dedupe key.
 * @param state - session navigation state.
 * @param surfaceId - surface type id.
 * @param key - dedupe key.
 * @returns the matching tab, or undefined.
 */
export function findDedupedTab(
  state: DetailsSessionState,
  surfaceId: string,
  key: string,
  descriptor: DetailsSurfaceDescriptor,
): DetailsSurfaceInstance | undefined {
  for (const tab of state.tabs) {
    if (tab.surfaceId !== surfaceId) continue
    if (resolveDedupeKey(descriptor, tab.payload) === key) return tab
  }
  return undefined
}

/**
 * Record an activation: point `activeInstanceId` at the tab, remember the
 * previously active tab in the MRU list, and hide the Launcher.
 * @param state - session state to mutate.
 * @param instanceId - instance id of the newly active tab.
 */
export function activateTab(state: DetailsSessionState, instanceId: string): void {
  if (state.activeInstanceId === instanceId) {
    state.launcherVisible = false
    return
  }
  const previous = state.activeInstanceId
  if (previous !== null) {
    state.mru = state.mru.filter(id => id !== previous)
    state.mru.unshift(previous)
  }
  state.mru = state.mru.filter(id => id !== instanceId)
  state.activeInstanceId = instanceId
  state.launcherVisible = false
}

/**
 * Drop a tab and select the fallback: the most recent MRU entry still present,
 * else the adjacent tab (next, then previous), else none.
 * @param state - session state to mutate.
 * @param instanceId - instance id of the removed tab.
 * @returns the removed instance, or undefined when the id was unknown.
 */
export function removeTab(
  state: DetailsSessionState,
  instanceId: string,
): { removed: DetailsSurfaceInstance; nextActiveId: string | null } | undefined {
  const index = state.tabs.findIndex(tab => tab.instanceId === instanceId)
  if (index === -1) return undefined
  const [removed] = state.tabs.splice(index, 1)
  state.mru = state.mru.filter(id => id !== instanceId)
  if (state.activeInstanceId === instanceId) {
    let nextActiveId: string | null = null
    while (state.mru.length > 0) {
      const candidate = state.mru.shift()!
      if (state.tabs.some(tab => tab.instanceId === candidate)) {
        nextActiveId = candidate
        break
      }
    }
    if (nextActiveId === null && state.tabs.length > 0) {
      const neighbor = state.tabs[index] ?? state.tabs[state.tabs.length - 1]
      if (neighbor !== undefined) nextActiveId = neighbor.instanceId
    }
    if (nextActiveId === null) state.mru = []
    state.activeInstanceId = nextActiveId
  }
  return { removed: removed!, nextActiveId: state.activeInstanceId }
}

/**
 * Evict the oldest non-active tab when the tab list exceeds
 * {@link DETAILS_TAB_LIMIT}.
 * @param state - session state to mutate.
 * @returns the evicted instance, or undefined when within the limit.
 */
export function evictOldestTab(state: DetailsSessionState): DetailsSurfaceInstance | undefined {
  if (state.tabs.length <= DETAILS_TAB_LIMIT) return undefined
  const candidate = state.tabs.find(tab => tab.instanceId !== state.activeInstanceId)
    ?? state.tabs[0]
  if (candidate === undefined) return undefined
  return removeTab(state, candidate.instanceId)?.removed
}

/**
 * Remove every tab of `surfaceId` (surface unload / crash pruning).
 * @param state - session state to mutate.
 * @param surfaceId - surface type to purge.
 * @returns removed instances (activation order preserved) and the surviving
 * active instance id after fallback selection.
 */
export function pruneSurfaceId(
  state: DetailsSessionState,
  surfaceId: string,
): { removed: DetailsSurfaceInstance[]; activeInstanceId: string | null } {
  const removed = state.tabs.filter(tab => tab.surfaceId === surfaceId)
  state.tabs = state.tabs.filter(tab => tab.surfaceId !== surfaceId)
  const removedIds = new Set(removed.map(tab => tab.instanceId))
  state.mru = state.mru.filter(id => !removedIds.has(id))
  if (state.activeInstanceId !== null && removedIds.has(state.activeInstanceId)) {
    state.activeInstanceId = null
    while (state.mru.length > 0) {
      const candidate = state.mru.shift()!
      if (state.tabs.some(tab => tab.instanceId === candidate)) {
        state.activeInstanceId = candidate
        break
      }
    }
    if (state.activeInstanceId === null && state.tabs.length > 0) {
      state.activeInstanceId = state.tabs[state.tabs.length - 1]!.instanceId
    }
  }
  return { removed, activeInstanceId: state.activeInstanceId }
}

/**
 * Whether the MRU history can restore a tab.
 * @param state - session state.
 * @returns true when a back activation would land on a live tab.
 */
export function canGoBack(state: DetailsSessionState): boolean {
  return state.mru.some(id => state.tabs.some(tab => tab.instanceId === id))
}

/**
 * Pop the most recent MRU entry that still resolves to a live tab.
 * @param state - session state.
 * @returns the instance id to activate, or undefined.
 */
export function popMru(state: DetailsSessionState): string | undefined {
  while (state.mru.length > 0) {
    const candidate = state.mru.shift()!
    if (state.tabs.some(tab => tab.instanceId === candidate)) return candidate
  }
  return undefined
}

/**
 * Whether an instance id resolves to a live tab.
 * @param state - session state.
 * @param instanceId - instance id to check.
 * @returns true when the tab exists.
 */
export function hasTab(state: DetailsSessionState, instanceId: string): boolean {
  return state.tabs.some(tab => tab.instanceId === instanceId)
}

/**
 * Replace a tab payload while preserving identity fields.
 * @param instance - existing tab.
 * @param payload - latest open payload.
 * @param label - optional refreshed label.
 * @returns updated tab with the same `instanceId`.
 */
export function withUpdatedPayload<P>(
  instance: DetailsSurfaceInstance<P>,
  payload: P,
  label: string = instance.label,
): DetailsSurfaceInstance<P> {
  return {
    instanceId: instance.instanceId,
    surfaceId: instance.surfaceId,
    payload,
    label,
    sessionId: instance.sessionId,
    ...(instance.closable === false ? { closable: false } : {}),
  }
}
