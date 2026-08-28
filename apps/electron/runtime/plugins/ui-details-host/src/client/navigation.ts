/**
 * Navigation helpers for push / replace / back / dedupe over one session state.
 */
import type { DetailsSurfaceDescriptor, DetailsSurfaceInstance } from './contract.ts'
import { DETAILS_HISTORY_LIMIT, type DetailsSessionState } from './session-state.ts'

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
 * Find an existing instance matching surface id + dedupe key in active or stack.
 * @param state - session navigation state.
 * @param surfaceId - surface type id.
 * @param key - dedupe key.
 * @returns match location, or undefined.
 */
export function findDedupedInstance(
  state: DetailsSessionState,
  surfaceId: string,
  key: string,
  descriptor: DetailsSurfaceDescriptor,
): { instance: DetailsSurfaceInstance; where: 'active' | 'stack'; index: number } | undefined {
  if (state.active !== null && state.active.surfaceId === surfaceId) {
    const activeKey = resolveDedupeKey(descriptor, state.active.payload)
    if (activeKey === key) {
      return { instance: state.active, where: 'active', index: -1 }
    }
  }
  for (let index = state.backStack.length - 1; index >= 0; index -= 1) {
    const candidate = state.backStack[index]!
    if (candidate.surfaceId !== surfaceId) continue
    const candidateKey = resolveDedupeKey(descriptor, candidate.payload)
    if (candidateKey === key) {
      return { instance: candidate, where: 'stack', index }
    }
  }
  return undefined
}

/**
 * Push `previous` onto the back stack and trim to {@link DETAILS_HISTORY_LIMIT}.
 * @param state - session state to mutate.
 * @param previous - instance leaving the active seat into history.
 * @returns instances evicted from the oldest end (for lifecycle).
 */
export function pushToHistory(
  state: DetailsSessionState,
  previous: DetailsSurfaceInstance,
): DetailsSurfaceInstance[] {
  state.backStack.push(previous)
  const evicted: DetailsSurfaceInstance[] = []
  while (state.backStack.length > DETAILS_HISTORY_LIMIT) {
    const dropped = state.backStack.shift()
    if (dropped !== undefined) evicted.push(dropped)
  }
  return evicted
}

/**
 * Pop the most recent history entry, or undefined when empty.
 * @param state - session state to mutate.
 * @returns the restored instance, or undefined.
 */
export function popHistory(state: DetailsSessionState): DetailsSurfaceInstance | undefined {
  return state.backStack.pop()
}

/**
 * Remove every instance of `surfaceId` from active and history.
 * @param state - session state to mutate.
 * @param surfaceId - surface type to purge.
 * @returns removed instances (active first, then stack oldest→newest).
 */
export function pruneSurfaceId(
  state: DetailsSessionState,
  surfaceId: string,
): DetailsSurfaceInstance[] {
  const removed: DetailsSurfaceInstance[] = []
  if (state.active?.surfaceId === surfaceId) {
    removed.push(state.active)
    state.active = null
  }
  const kept: DetailsSurfaceInstance[] = []
  for (const entry of state.backStack) {
    if (entry.surfaceId === surfaceId) removed.push(entry)
    else kept.push(entry)
  }
  state.backStack = kept
  return removed
}

/**
 * Whether the session can navigate back.
 * @param state - session state.
 * @returns true when the back stack is non-empty.
 */
export function canGoBack(state: DetailsSessionState): boolean {
  return state.backStack.length > 0
}

/**
 * Replace an instance payload while preserving identity fields.
 * @param instance - existing instance.
 * @param payload - latest open payload.
 * @param label - optional refreshed label.
 * @returns updated instance with the same `instanceId`.
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
  }
}
