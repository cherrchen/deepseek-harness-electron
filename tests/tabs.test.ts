import { describe, expect, it } from 'vitest'
import type { DetailsSurfaceInstance } from '../src/client/contract.ts'
import {
  activateTab,
  canGoBack,
  evictOldestTab,
  findDedupedTab,
  hasTab,
  popMru,
  pruneSurfaceId,
  removeTab,
  resolveDedupeKey,
  withUpdatedPayload,
} from '../src/client/tabs.ts'
import { emptySessionState } from '../src/client/session-state.ts'
import { DETAILS_TAB_LIMIT } from '../src/client/session-state.ts'

let serial = 0
function tab(surfaceId: string, payload: unknown = {}): DetailsSurfaceInstance {
  serial += 1
  return {
    instanceId: `instance-${serial}`,
    surfaceId,
    payload,
    label: surfaceId,
    sessionId: 'session-a',
  }
}

describe('tabs navigation helpers', () => {
  it('activates tabs, records MRU, and hides the launcher', () => {
    const state = emptySessionState()
    const alpha = tab('a')
    const beta = tab('b')
    state.tabs.push(alpha, beta)

    activateTab(state, alpha.instanceId)
    expect(state.activeInstanceId).toBe(alpha.instanceId)
    expect(state.launcherVisible).toBe(false)

    state.launcherVisible = true
    activateTab(state, beta.instanceId)
    expect(state.activeInstanceId).toBe(beta.instanceId)
    expect(state.launcherVisible).toBe(false)
    expect(state.mru).toEqual([alpha.instanceId])

    activateTab(state, alpha.instanceId)
    expect(state.mru).toEqual([beta.instanceId])
    expect(canGoBack(state)).toBe(true)
  })

  it('re-activating the active tab only hides the launcher', () => {
    const state = emptySessionState()
    const alpha = tab('a')
    state.tabs.push(alpha)
    activateTab(state, alpha.instanceId)
    state.launcherVisible = true
    activateTab(state, alpha.instanceId)
    expect(state.activeInstanceId).toBe(alpha.instanceId)
    expect(state.launcherVisible).toBe(false)
    expect(state.mru).toEqual([])
  })

  it('removes a tab and falls back to MRU, then neighbor', () => {
    const state = emptySessionState()
    const alpha = tab('a')
    const beta = tab('b')
    const gamma = tab('c')
    state.tabs.push(alpha, beta, gamma)
    activateTab(state, alpha.instanceId)
    activateTab(state, beta.instanceId)
    activateTab(state, gamma.instanceId)

    // Removing the active tab falls back to the MRU entry (beta).
    const outcome = removeTab(state, gamma.instanceId)
    expect(outcome?.removed).toBe(gamma)
    expect(outcome?.nextActiveId).toBe(beta.instanceId)

    // Removing the remaining tabs empties the selection.
    removeTab(state, beta.instanceId)
    const last = removeTab(state, alpha.instanceId)
    expect(last?.nextActiveId).toBeNull()
    expect(state.tabs).toEqual([])
    expect(state.activeInstanceId).toBeNull()
    expect(state.mru).toEqual([])
  })

  it('removing an inactive tab keeps the active selection', () => {
    const state = emptySessionState()
    const alpha = tab('a')
    const beta = tab('b')
    state.tabs.push(alpha, beta)
    activateTab(state, alpha.instanceId)
    activateTab(state, beta.instanceId)

    const outcome = removeTab(state, alpha.instanceId)
    expect(outcome?.nextActiveId).toBe(beta.instanceId)
    expect(state.activeInstanceId).toBe(beta.instanceId)
  })

  it('evicts the oldest non-active tab beyond the limit', () => {
    const state = emptySessionState()
    const first = tab('s-0')
    state.tabs.push(first)
    for (let index = 1; index < DETAILS_TAB_LIMIT + 2; index += 1) {
      state.tabs.push(tab(`s-${index}`))
    }
    // Activate the newest tab so the oldest is evictable.
    const newest = state.tabs[state.tabs.length - 1]!
    activateTab(state, newest.instanceId)

    const evicted = evictOldestTab(state)
    expect(evicted?.instanceId).toBe(first.instanceId)
    expect(state.tabs).toHaveLength(DETAILS_TAB_LIMIT + 1)

    // Eviction repeats while the list exceeds the limit.
    while (evictOldestTab(state) !== undefined) { /* drain */ }
    expect(state.tabs).toHaveLength(DETAILS_TAB_LIMIT)
    expect(state.activeInstanceId).toBe(newest.instanceId)

    // Within the limit nothing is evicted.
    expect(evictOldestTab(state)).toBeUndefined()
  })

  it('prunes every tab of a surface id and recovers an activation', () => {
    const state = emptySessionState()
    const alpha1 = tab('alpha')
    const beta = tab('beta')
    const alpha2 = tab('alpha')
    state.tabs.push(alpha1, beta, alpha2)
    activateTab(state, alpha1.instanceId)
    activateTab(state, beta.instanceId)
    activateTab(state, alpha2.instanceId)

    const pruned = pruneSurfaceId(state, 'alpha')
    expect(pruned.removed).toEqual([alpha1, alpha2])
    expect(pruned.activeInstanceId).toBe(beta.instanceId)
    expect(state.tabs).toEqual([beta])
    expect(hasTab(state, alpha1.instanceId)).toBe(false)
    expect(hasTab(state, beta.instanceId)).toBe(true)
  })

  it('prunes to empty and clears the activation', () => {
    const state = emptySessionState()
    const alpha = tab('alpha')
    state.tabs.push(alpha)
    activateTab(state, alpha.instanceId)
    const pruned = pruneSurfaceId(state, 'alpha')
    expect(pruned.removed).toEqual([alpha])
    expect(pruned.activeInstanceId).toBeNull()
    expect(canGoBack(state)).toBe(false)
    expect(popMru(state)).toBeUndefined()
  })

  it('finds deduped tabs and resolves keys defensively', () => {
    const state = emptySessionState()
    const alpha = tab('alpha', { repo: 'a' })
    state.tabs.push(alpha)
    const descriptor = { id: 'alpha', dedupeKey: (payload: unknown) => `key:${(payload as { repo: string }).repo}` }
    expect(resolveDedupeKey(descriptor, { repo: 'a' })).toBe('key:a')
    expect(resolveDedupeKey(undefined, {})).toBeUndefined()
    expect(findDedupedTab(state, 'alpha', 'key:a', descriptor)).toBe(alpha)
    expect(findDedupedTab(state, 'alpha', 'key:b', descriptor)).toBeUndefined()
    expect(findDedupedTab(state, 'beta', 'key:a', descriptor)).toBeUndefined()
  })

  it('updates payload while preserving identity and closability', () => {
    const source: DetailsSurfaceInstance = { ...tab('alpha'), closable: false }
    const updated = withUpdatedPayload(source, { next: true }, 'Renamed')
    expect(updated).toEqual({
      instanceId: source.instanceId,
      surfaceId: 'alpha',
      payload: { next: true },
      label: 'Renamed',
      sessionId: 'session-a',
      closable: false,
    })
  })
})
