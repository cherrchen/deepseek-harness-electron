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
})
