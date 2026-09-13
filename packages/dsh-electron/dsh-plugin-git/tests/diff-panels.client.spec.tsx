// @vitest-environment jsdom
/**
 * Regression coverage for the reproduced P1 bug: two Diff panels mounted at
 * once (split pane, float window, or staged+worktree of one file) must never
 * render one another's diff body. The old shared controller state made the
 * newest fetch win for every panel; results are panel-local now.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, waitFor, within } from '@testing-library/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSidebarRightTabInfo, SidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { GitRepositorySnapshot } from '../src/types.ts'
import type { GitRpcResult } from '../src/client/controller.ts'
import { GitClientController } from '../src/client/controller.ts'
import { GitDiffSurface } from '../src/client/surfaces/GitDiffSurface.tsx'
import { gitDiffAddress } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'

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

const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']

const sessionsHook = ((selector: (list: { current: string | undefined; byId: Record<string, { cwd?: string } | undefined> }) => unknown) =>
  selector({ current: 'session-a', byId: { 'session-a': { cwd: '/workspace' } } })) as never

function tabInfoOf(
  address: string,
  params: { readonly path: string; readonly staged: boolean },
): UseSidebarRightTabInfo {
  const info = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-a' },
    tab: {
      id: 1,
      kind: 'git.diff',
      contentId: address,
      title: 'Diff',
      visible: true,
      navigation: { address, params, revision: 1 },
      signal: new AbortController().signal,
      actions: { openResource: () => {}, openTab: () => {}, close: () => {} },
    },
  } as unknown as SidebarRightTabInfo
  return () => info
}

function pathOf(payload: unknown): string {
  return typeof payload === 'object' && payload !== null && 'path' in payload && typeof payload.path === 'string' ? payload.path : ''
}

function stagedOf(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && 'staged' in payload && payload.staged === true
}

/** A real controller on a fake rpc that holds every `diff` call until the test releases it. */
function createHarness(repository: GitRepositorySnapshot, statusError?: () => string | undefined): {
  controller: GitClientController
  diffs: Array<{ payload: unknown; resolve: (result: GitRpcResult) => void }>
} {
  const diffs: Array<{ payload: unknown; resolve: (result: GitRpcResult) => void }> = []
  const rpc = {
    call: vi.fn(async (_channel: string, endpoint: string, payload: unknown): Promise<GitRpcResult> => {
      if (endpoint === 'discover') return { ok: true, value: '/repo' }
      if (endpoint === 'status') {
        const failure = statusError?.()
        if (failure !== undefined) return { ok: false, error: { message: failure } }
        return { ok: true, value: repository }
      }
      if (endpoint === 'diff') {
        return new Promise<GitRpcResult>((resolve) => {
          diffs.push({ payload, resolve })
        })
      }
      return { ok: true, value: null }
    }),
  }
  return { controller: new GitClientController(rpc), diffs }
}

/** One mounted Diff panel bound to its own tab address (props shape mirrors the details-surface suite). */
function panel(controller: GitClientController, path: string, staged: boolean): ReactNode {
  const address = gitDiffAddress(path, staged)
  return (
    <GitDiffSurface
      controller={controller}
      t={t}
      sessionId={'session-a' as never}
      useSessions={sessionsHook}
      useSession={vi.fn()}
      useStore={vi.fn()}
      useWorkspaces={vi.fn()}
      useTabInfo={tabInfoOf(address, { path, staged })}
    />
  )
}

function release(harness: ReturnType<typeof createHarness>, path: string, staged: boolean, text: string): void {
  const index = harness.diffs.findIndex(entry => pathOf(entry.payload) === path && stagedOf(entry.payload) === staged)
  const entry = harness.diffs[index]!
  harness.diffs.splice(index, 1)
  entry.resolve({ ok: true, value: { repository: '/repo', path, staged, text } })
}

afterEach(() => { cleanup() })

describe('concurrent Diff panels', () => {
  it('keeps each panel body bound to its own file when responses arrive out of order', async () => {
    const harness = createHarness(snapshot({
      staged: [{ path: 'src/a.ts', status: 'M ' }],
      unstaged: [{ path: 'src/b.ts', status: ' M' }],
    }))
    await harness.controller.setWorkspace('/workspace')
    const { container } = render(
      <div>
        <div data-panel="a">{panel(harness.controller, 'src/a.ts', false)}</div>
        <div data-panel="b">{panel(harness.controller, 'src/b.ts', false)}</div>
      </div>,
    )
    await waitFor(() => { expect(harness.diffs).toHaveLength(2) })
    // Resolve b first, then a: with the old shared slot, every panel rendered
    // the last-resolved text; each panel must now keep its own.
    release(harness, 'src/b.ts', false, '+b-line')
    release(harness, 'src/a.ts', false, '+a-line')
    const panelA = container.querySelector<HTMLElement>('[data-panel="a"]')!
    const panelB = container.querySelector<HTMLElement>('[data-panel="b"]')!
    await waitFor(() => { expect(within(panelA).getByText('+a-line')).toBeTruthy() })
    await waitFor(() => { expect(within(panelB).getByText('+b-line')).toBeTruthy() })
    expect(within(panelA).getByText('a.ts')).toBeTruthy()
    expect(within(panelA).queryByText('+b-line')).toBeNull()
    expect(within(panelB).getByText('b.ts')).toBeTruthy()
    expect(within(panelB).queryByText('+a-line')).toBeNull()
  })

  it('keeps staged and worktree panels of one file apart', async () => {
    const harness = createHarness(snapshot({
      staged: [{ path: 'src/a.ts', status: 'M ' }],
      unstaged: [{ path: 'src/a.ts', status: ' M' }],
    }))
    await harness.controller.setWorkspace('/workspace')
    const { container } = render(
      <div>
        <div data-panel="staged">{panel(harness.controller, 'src/a.ts', true)}</div>
        <div data-panel="worktree">{panel(harness.controller, 'src/a.ts', false)}</div>
      </div>,
    )
    await waitFor(() => { expect(harness.diffs).toHaveLength(2) })
    release(harness, 'src/a.ts', true, '+staged-line')
    release(harness, 'src/a.ts', false, '+worktree-line')
    const panelStaged = container.querySelector<HTMLElement>('[data-panel="staged"]')!
    const panelWorktree = container.querySelector<HTMLElement>('[data-panel="worktree"]')!
    await waitFor(() => { expect(within(panelStaged).getByText('+staged-line')).toBeTruthy() })
    await waitFor(() => { expect(within(panelWorktree).getByText('+worktree-line')).toBeTruthy() })
    expect(within(panelStaged).queryByText('+worktree-line')).toBeNull()
    expect(within(panelWorktree).queryByText('+staged-line')).toBeNull()
    expect(within(panelStaged).getByText(en['details.stagedLabel'])).toBeTruthy()
    expect(within(panelWorktree).getByText(en['details.workingTree'])).toBeTruthy()
  })

  it('renders the untracked notice without a diff request', async () => {
    const harness = createHarness(snapshot({ untracked: ['notes.txt'] }))
    await harness.controller.setWorkspace('/workspace')
    const { container } = render(<div data-panel="u">{panel(harness.controller, 'notes.txt', false)}</div>)
    const panelU = container.querySelector<HTMLElement>('[data-panel="u"]')!
    expect(within(panelU).getByText(en['details.untrackedDiff'])).toBeTruthy()
    expect(harness.diffs).toHaveLength(0)
  })

  it('surfaces a refresh failure over the stale diff body', async () => {
    // The first status call succeeds; a later refresh fails while the
    // repository object is retained, so the panel never refetches. The
    // discovery failure must still appear above the stale diff.
    let calls = 0
    const harness = createHarness(snapshot({ unstaged: [{ path: 'src/a.ts', status: ' M' }] }), () => (++calls > 1 ? 'status exploded' : undefined))
    await harness.controller.setWorkspace('/workspace')
    const { container } = render(<div data-panel="a">{panel(harness.controller, 'src/a.ts', false)}</div>)
    await waitFor(() => { expect(harness.diffs).toHaveLength(1) })
    release(harness, 'src/a.ts', false, '+a-line')
    const panelA = container.querySelector<HTMLElement>('[data-panel="a"]')!
    await waitFor(() => { expect(within(panelA).getByText('+a-line')).toBeTruthy() })
    await harness.controller.refresh()
    await waitFor(() => { expect(within(panelA).getByText('status exploded')).toBeTruthy() })
    // The diff is not refetched: the repository snapshot never changed.
    expect(harness.diffs).toHaveLength(0)
  })
})
