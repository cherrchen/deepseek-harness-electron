import { describe, expect, it, vi } from 'vitest'
import type { GitRepositorySnapshot } from '../src/types.ts'
import { changedPathCount } from '../src/client/changed-path-count.ts'
import { GitClientController } from '../src/client/controller.ts'

function snapshot(overrides: Partial<GitRepositorySnapshot> = {}): GitRepositorySnapshot {
  return {
    root: '/repo',
    version: '2.43.0',
    branch: 'main',
    head: 'abc123',
    staged: [],
    unstaged: [],
    untracked: [],
    branches: [{ name: 'main', head: 'abc123', current: true }],
    ...overrides,
  }
}

describe('changedPathCount', () => {
  it('counts each path once when staged and unstaged overlap', () => {
    const count = changedPathCount(snapshot({
      staged: [{ path: 'src/a.ts', status: 'M ' }],
      unstaged: [{ path: 'src/a.ts', status: 'MM' }],
      untracked: ['README.md'],
    }))
    expect(count).toBe(2)
  })
})

describe('GitClientController', () => {
  it('discovers repository on workspace bind and ignores stale responses', async () => {
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string) => {
        if (endpoint === 'discover') {
          await new Promise((resolve) => { setTimeout(resolve, 0) })
          return { ok: true as const, value: '/repo' }
        }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') return { ok: true as const, value: [] }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    const first = controller.setWorkspace('/workspace-a')
    await controller.setWorkspace('/workspace-b')
    await first
    expect(controller.getSnapshot().workspacePath).toBe('/workspace-b')
    expect(controller.getSnapshot().repository?.root).toBe('/repo')
  })

  it('clears retained surface state when the workspace changes', async () => {
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') return { ok: true as const, value: [] }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace-a')
    controller.setCommitMessage('draft message')
    await controller.setWorkspace('/workspace-b')
    expect(controller.getSnapshot().commitMessage).toBe('')
    expect(controller.getSnapshot().graph).toEqual([])
  })

  it('surfaces switch-branch errors without mutating repository state', async () => {
    const current = snapshot({ branch: 'main' })
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: current }
        if (endpoint === 'switch-branch') {
          return { ok: false as const, error: { message: 'Your local changes would be overwritten' } }
        }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace')
    await expect(controller.switchBranch('dev')).rejects.toThrow('Your local changes would be overwritten')
    expect(controller.getSnapshot().repository?.branch).toBe('main')
    expect(controller.getSnapshot().error).toBe('Your local changes would be overwritten')
  })

  it('passes the graph scope to log and reloads the first page on switch', async () => {
    const logPayloads: Record<string, unknown>[] = []
    const commit = (hash: string, parents: string[]) => ({
      hash,
      parents,
      shortHash: hash.slice(0, 7),
      subject: hash,
      author: 'tester',
      date: '2026-01-01T00:00:00Z',
      refs: hash === 'c2' ? ['HEAD'] : [],
    })
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') {
          logPayloads.push(payload as Record<string, unknown>)
          return { ok: true as const, value: [commit('c2', ['c1']), commit('c1', [])] }
        }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace')
    expect(logPayloads.at(-1)!.scope).toBe('auto')
    await controller.setGraphScope('first-parent')
    expect(logPayloads.at(-1)!.scope).toBe('first-parent')
    expect(controller.getSnapshot().graphScope).toBe('first-parent')
    expect(controller.getSnapshot().graphRows).toHaveLength(2)
  })

  it('continues graph lanes across appended pages instead of restarting', async () => {
    const commit = (hash: string, parents: string[]) => ({
      hash,
      parents,
      shortHash: hash.slice(0, 7),
      subject: hash,
      author: 'tester',
      date: '2026-01-01T00:00:00Z',
      refs: [],
    })
    const pageOne = [commit('m', ['a', 's'])]
    const pageTwo = [commit('s', ['base']), commit('a', ['base']), commit('base', [])]
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') {
          const skip = (payload as { skip?: number }).skip ?? 0
          return { ok: true as const, value: skip === 0 ? pageOne : pageTwo }
        }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace')
    // The first-page load fires without being awaited inside setWorkspace;
    // flush pending tasks so the paged assertions below are deterministic.
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(controller.getSnapshot().graphRows).toHaveLength(1)
    await controller.loadMoreGraph()
    const state = controller.getSnapshot()
    expect(state.graphRows).toHaveLength(4)
    // The pending lanes of page one (spine + side lane) continue into page
    // two: the first appended row carries an entry column instead of
    // appearing without a rail.
    expect(state.graphRows[1]!.nodeEntryColumn).toBeDefined()
    // The shared parent folds both pending lanes in and releases them.
    expect(state.graphRows.at(-1)!.merging).toHaveLength(1)
    expect(state.graphLaneCount).toBeGreaterThanOrEqual(2)
  })

  it('keeps the commit draft when the same workspace rebinds', async () => {
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') return { ok: true as const, value: [] }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace-a')
    controller.setCommitMessage('draft to keep')
    // Details Host remounts surfaces on tab switches; the same binding must
    // not clear retained state.
    await controller.setWorkspace('/workspace-a')
    expect(controller.getSnapshot().commitMessage).toBe('draft to keep')
    expect(controller.getSnapshot().repository?.root).toBe('/repo')
  })

  it('marks the first graph page as loaded when empty or failed', async () => {
    let failLog = false
    const logCalls: Record<string, unknown>[] = []
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') {
          logCalls.push(payload as Record<string, unknown>)
          if (failLog) return { ok: false as const, error: { message: 'fatal: bad object' } }
          return { ok: true as const, value: [] }
        }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace')
    await new Promise(resolve => { setTimeout(resolve, 0) })
    // An empty history counts as loaded: the Graph surface auto effect keys on
    // graphLoaded, so no further requests may fire without explicit refresh.
    expect(controller.getSnapshot().graphLoaded).toBe(true)
    expect(logCalls).toHaveLength(1)

    await controller.loadGraph(true)
    expect(logCalls).toHaveLength(2)

    failLog = true
    await controller.loadGraph(true)
    expect(controller.getSnapshot().graphLoaded).toBe(true)
    expect(controller.getSnapshot().graphError).toBe('fatal: bad object')
    expect(logCalls).toHaveLength(3)
  })

  it('discards a stale graph page whose workspace was rebound mid-flight', async () => {
    let releaseA: ((value: unknown) => void) | undefined
    let signalALog: (() => void) | undefined
    const aLogPending = new Promise<void>((resolve) => { signalALog = resolve })
    const commit = (hash: string) => ({
      hash,
      parents: [],
      shortHash: hash.slice(0, 7),
      subject: hash,
      author: 'tester',
      date: '2026-01-01T00:00:00Z',
      refs: [],
    })
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
        if (endpoint === 'discover') return { ok: true as const, value: (payload as { path: string }).path }
        if (endpoint === 'status') {
          return { ok: true as const, value: snapshot({ root: (payload as { repository: string }).repository }) }
        }
        if (endpoint === 'log') {
          const repository = (payload as { repository: string }).repository
          if (repository === '/workspace-a') {
            signalALog?.()
            return new Promise((resolve) => { releaseA = resolve })
          }
          return { ok: true as const, value: [commit('b-commit')] }
        }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    const staleBinding = controller.setWorkspace('/workspace-a')
    await aLogPending
    await controller.setWorkspace('/workspace-b')
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(controller.getSnapshot().graph.map(entry => entry.hash)).toEqual(['b-commit'])
    releaseA?.({ ok: true as const, value: [commit('a-commit')] })
    await staleBinding
    await new Promise(resolve => { setTimeout(resolve, 0) })
    // The late response belongs to the abandoned binding and must not
    // replace workspace B's graph.
    expect(controller.getSnapshot().graph.map(entry => entry.hash)).toEqual(['b-commit'])
  })

  it('invalidates the loaded graph on refresh and mutation', async () => {
    let logCalls = 0
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: snapshot() }
        if (endpoint === 'log') {
          logCalls += 1
          return { ok: true as const, value: [] }
        }
        if (endpoint === 'stage') return { ok: true as const, value: snapshot() }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace')
    await new Promise(resolve => { setTimeout(resolve, 0) })
    expect(controller.getSnapshot().graphLoaded).toBe(true)

    await controller.refresh()
    expect(controller.getSnapshot().graphLoaded).toBe(false)
    await controller.loadGraph(true)
    const callsAfterRefresh = logCalls
    expect(callsAfterRefresh).toBeGreaterThanOrEqual(2)

    await controller.stage()
    expect(controller.getSnapshot().graphLoaded).toBe(false)
    await controller.loadGraph(true)
    expect(logCalls).toBe(callsAfterRefresh + 1)
  })

  it('discards a commit message proposal whose workspace was rebound mid-flight', async () => {
    let releaseGeneration: ((value: unknown) => void) | undefined
    let signalGeneration: (() => void) | undefined
    const generationRequested = new Promise<void>((resolve) => { signalGeneration = resolve })
    const stagedSnapshot = snapshot({
      root: '/repo',
      staged: [{ path: 'src/a.ts', status: 'A ' }],
    })
    const rpc = {
      call: vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
        if (endpoint === 'discover') return { ok: true as const, value: '/repo' }
        if (endpoint === 'status') return { ok: true as const, value: stagedSnapshot }
        if (endpoint === 'diff') return { ok: true as const, value: { repository: '/repo', staged: true, text: 'diff --git' } }
        if (endpoint === 'generate-commit-message') {
          signalGeneration?.()
          return new Promise((resolve) => { releaseGeneration = resolve })
        }
        if (endpoint === 'log') return { ok: true as const, value: [] }
        if (endpoint === 'commit-message-capability') return { ok: true as const, value: { available: false } }
        return { ok: true as const, value: null }
      }),
    }
    const controller = new GitClientController(rpc)
    await controller.setWorkspace('/workspace-a')
    const pending = controller.generateCommitMessage()
    await generationRequested
    await controller.setWorkspace('/workspace-b')
    releaseGeneration?.({ ok: true as const, value: 'stale proposal' })
    await pending
    expect(controller.getSnapshot().commitMessage).toBe('')
    expect(controller.getSnapshot().generating).toBe(false)
  })
})
