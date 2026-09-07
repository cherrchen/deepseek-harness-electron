// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DetailsSurfaceInstance } from '@dsh-electron/dsh-client-ui-details-host/client'
import type { GitRepositorySnapshot } from '../src/types.ts'
import { GitDetailsHeaderActions } from '../src/client/GitDetailsHeaderActions.tsx'
import type { GitDetailsHeaderActionsProps } from '../src/client/GitDetailsHeaderActions.tsx'
import { GitChangesSurface } from '../src/client/surfaces/GitChangesSurface.tsx'
import type { GitChangesSurfaceProps } from '../src/client/surfaces/GitChangesSurface.tsx'
import { GitDiffSurface } from '../src/client/surfaces/GitDiffSurface.tsx'
import type { GitDiffSurfaceProps } from '../src/client/surfaces/GitDiffSurface.tsx'
import { GitGraphSurface } from '../src/client/surfaces/GitGraphSurface.tsx'
import type { GitGraphSurfaceProps } from '../src/client/surfaces/GitGraphSurface.tsx'
import type { GitClientController } from '../src/client/controller.ts'
import { layoutGitGraph } from '../src/client/graph/layout.ts'
import { GIT_CHANGES_SURFACE_ID, GIT_DIFF_SURFACE_ID } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'

function snapshot(overrides: Partial<GitRepositorySnapshot> = {}): GitRepositorySnapshot {
  return {
    root: '/repo',
    version: '2.43.0',
    branch: 'main',
    head: 'abc123',
    staged: [],
    unstaged: [{ path: 'src/a.ts', status: ' M' }],
    untracked: [],
    branches: [{ name: 'main', head: 'abc123', current: true }],
    ...overrides,
  }
}

function commit(hash: string, parents: string[]): import('../src/types.ts').GitCommitSummary {
  return {
    hash,
    parents,
    shortHash: hash.slice(0, 7),
    subject: `commit ${hash}`,
    author: 'tester',
    date: '2026-01-01T00:00:00Z',
    refs: [],
  }
}

function baseState(overrides: Partial<ReturnType<GitClientController['getSnapshot']>> = {}): ReturnType<GitClientController['getSnapshot']> {
  return {
    workspacePath: '/workspace',
    repository: snapshot(),
    selectedDiff: undefined,
    diff: undefined,
    loading: false,
    error: undefined,
    desktopAvailable: false,
    graph: [],
    graphLoading: false,
    graphHasMore: false,
    graphError: undefined,
    graphScope: 'auto',
    graphLoaded: false,
    graphRows: [],
    graphLaneCount: 0,
    commitMessage: '',
    generating: false,
    generationAvailable: false,
    generationReason: undefined,
    generationError: undefined,
    ...overrides,
  }
}

function detailsInstanceOf(surfaceId: string, payload: unknown = {}): DetailsSurfaceInstance {
  return {
    instanceId: 'details-instance-1',
    surfaceId,
    payload,
    label: 'Git',
    sessionId: 'session-a',
  }
}

type GitControllerMock = ReturnType<typeof controllerOf>

function controllerOf(state: ReturnType<GitClientController['getSnapshot']>) {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: vi.fn(async () => {}),
    showDiff: vi.fn(async () => {}),
    openDiff: vi.fn(),
    stage: vi.fn(async () => {}),
    unstage: vi.fn(async () => {}),
    discard: vi.fn(async () => {}),
    switchBranch: vi.fn(async () => {}),
    createBranch: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    reveal: vi.fn(async () => {}),
    setDesktop: vi.fn(),
    setDiffNavigator: vi.fn(),
    setWorkspace: vi.fn(async () => {}),
    loadGraph: vi.fn(async () => {}),
    loadMoreGraph: vi.fn(async () => {}),
    setGraphScope: vi.fn(async () => {}),
    setCommitMessage: vi.fn(),
    generateCommitMessage: vi.fn(async () => {}),
  }
}

const sessionsHook = ((selector: (list: { current: string | undefined; byId: Record<string, { cwd?: string } | undefined> }) => unknown) =>
  selector({ current: 'session-a', byId: { 'session-a': { cwd: '/workspace' } } })) as never

afterEach(() => { cleanup() })

const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']

describe('GitChangesSurface', () => {
  const props = (controller: GitControllerMock): GitChangesSurfaceProps =>
    ({
      controller,
      t,
      sessionId: 'session-a' as never,
      useSessions: sessionsHook,
      useSession: vi.fn(),
      useStore: vi.fn(),
      useWorkspaces: vi.fn(),
      detailsInstance: detailsInstanceOf(GIT_CHANGES_SURFACE_ID),
    }) as unknown as GitChangesSurfaceProps

  it('refreshes on mount, binds the workspace, and renders context plus sections', () => {
    const controller = controllerOf(baseState())
    const { container } = render(<GitChangesSurface {...props(controller)} />)
    expect(controller.refresh).toHaveBeenCalled()
    expect(controller.setWorkspace).toHaveBeenCalledWith('/workspace')
    expect(screen.getByText('main')).toBeTruthy()
    expect(container.querySelector('[data-git-changes-surface]')).toBeTruthy()
    expect(container.querySelector('[data-git-commit-region]')).toBeTruthy()
  })

  it('shows empty states for a missing workspace and a non-repository', () => {
    const controller = controllerOf(baseState({ repository: null }))
    render(<GitChangesSurface {...props(controller)} />)
    expect(screen.getByText(en['details.notRepository'])).toBeTruthy()
  })
})

describe('GitDiffSurface', () => {
  const props = (controller: GitControllerMock): GitDiffSurfaceProps =>
    ({
      controller,
      t,
      sessionId: 'session-a' as never,
      useSessions: sessionsHook,
      useSession: vi.fn(),
      useStore: vi.fn(),
      useWorkspaces: vi.fn(),
      detailsInstance: detailsInstanceOf(GIT_DIFF_SURFACE_ID, { path: 'src/a.ts', staged: false }),
    }) as unknown as GitDiffSurfaceProps

  it('loads the payload diff and renders the file header', () => {
    const controller = controllerOf(baseState({
      diff: { repository: '/repo', staged: false, path: 'src/a.ts', text: '+added\n' },
    }))
    render(<GitDiffSurface {...props(controller)} />)
    expect(controller.showDiff).toHaveBeenCalledWith('src/a.ts', false)
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText(en['details.workingTree'])).toBeTruthy()
  })

  it('renders the untracked empty state for an untracked payload', () => {
    const controller = controllerOf(baseState({
      repository: snapshot({ untracked: ['notes.txt'] }),
    }))
    render(<GitDiffSurface
      {...props(controller)}
      detailsInstance={detailsInstanceOf(GIT_DIFF_SURFACE_ID, { path: 'notes.txt', staged: false })}
    />)
    expect(controller.showDiff).toHaveBeenCalledWith('notes.txt', false)
    expect(screen.getByText(en['details.untrackedDiff'])).toBeTruthy()
  })

  it('waits for the repository binding before requesting the payload diff', () => {
    const controller = controllerOf(baseState({ repository: undefined }))
    render(<GitDiffSurface {...props(controller)} />)
    // Mounting before the shared controller discovered a repository must not
    // fire a doomed `showDiff` (the load-failure regression).
    expect(controller.showDiff).not.toHaveBeenCalled()
  })

  it('places compact refresh in the top-right overlay and hides Reveal even when Desktop exists', () => {
    const controller = controllerOf(baseState({ desktopAvailable: true }))
    const { container } = render(<GitDiffSurface {...props(controller)} />)
    const toolbar = container.querySelector('[data-git-diff-toolbar]')
    expect(toolbar?.querySelector('[data-git-details-header-actions]')).toBeTruthy()
    expect(container.querySelector('[data-git-diff-surface] > [data-git-details-header-actions]')).toBeNull()
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['details.refresh'] }))
    expect(controller.refresh).toHaveBeenCalled()
  })

  it('keeps Diff refresh overlaid so it does not consume a layout row', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitDetailsSurface.module.css'), 'utf8')
    expect(source).toMatch(/\.diffRoot[^{]*\{[^}]*\n  position: relative/)
    expect(source).toMatch(/\.diffToolbar[^{]*\{[^}]*\n  position: absolute/)
    expect(source).toMatch(/\.diffToolbar[^{]*\{[^}]*\n  top: 10px/)
    expect(source).toMatch(/\.diffToolbar[^{]*\{[^}]*\n  right: 12px/)
  })
})

describe('GitGraphSurface', () => {
  const props = (controller: GitControllerMock): GitGraphSurfaceProps =>
    ({
      controller,
      t,
      sessionId: 'session-a' as never,
      useSessions: sessionsHook,
      useSession: vi.fn(),
      useStore: vi.fn(),
      useWorkspaces: vi.fn(),
      detailsInstance: detailsInstanceOf('git.graph'),
    }) as unknown as GitGraphSurfaceProps

  it('auto-loads the first page only while the history was never loaded', () => {
    const controller = controllerOf(baseState())
    render(<GitGraphSurface {...props(controller)} />)
    expect(controller.loadGraph).toHaveBeenCalledWith(true)
  })

  it('renders empty history copy after the first page settled without reloading', () => {
    const controller = controllerOf(baseState({ graphLoaded: true }))
    render(<GitGraphSurface {...props(controller)} />)
    expect(controller.loadGraph).not.toHaveBeenCalled()
    expect(screen.getByText(en['graph.empty'])).toBeTruthy()
  })

  it('sizes the canvas at design pixels regardless of devicePixelRatio', () => {
    const graph = [commit('c2', ['c1']), commit('c1', [])]
    const layout = layoutGitGraph(graph)
    const controller = controllerOf(baseState({
      repository: snapshot(),
      graph,
      graphRows: layout.rows,
      graphLaneCount: layout.laneCount,
    }))
    const { container } = render(<GitGraphSurface {...props(controller)} />)
    const canvas = container.querySelector('[data-git-graph-surface] canvas') as HTMLCanvasElement
    expect(canvas).toBeTruthy()
    // CSS box is the design size; the DPR-scaled backing store must never
    // leak into layout (Retina 2x regression guard).
    expect(canvas.style.width).toBe(`${layout.laneCount * 16}px`)
    expect(canvas.style.height).toBe(`${graph.length * 36}px`)
  })

  it('places refresh on the scope bar and hides Reveal even when Desktop exists', () => {
    const controller = controllerOf(baseState({ desktopAvailable: true, graphLoaded: true }))
    const { container } = render(<GitGraphSurface {...props(controller)} />)
    const toolbar = container.querySelector('[data-git-graph-toolbar]')
    expect(toolbar?.querySelector('[role="tablist"]')).toBeTruthy()
    expect(toolbar?.querySelector('[data-git-details-header-actions]')).toBeTruthy()
    expect(container.querySelector('[data-git-graph-surface] > [data-git-details-header-actions]')).toBeNull()
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['details.refresh'] }))
    expect(controller.refresh).toHaveBeenCalled()
  })

  it('keeps the scope bar a single row with compact trailing refresh', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitGraphSurface.module.css'), 'utf8')
    expect(source).toMatch(/\.scopeBar[^{]*\{[^}]*\n  display: flex/)
    expect(source).toMatch(/\.scopeBar[^{]*\{[^}]*\n  align-items: center/)
    expect(source).toMatch(/\.scopeTabs[^{]*\{[^}]*\n  flex: 1/)
  })
})

describe('GitDetailsHeaderActions', () => {
  const actionProps = (controller: GitControllerMock): GitDetailsHeaderActionsProps =>
    ({
      controller,
      t,
      detailsInstance: detailsInstanceOf(GIT_CHANGES_SURFACE_ID),
    }) as unknown as GitDetailsHeaderActionsProps

  it('renders Refresh and conditional Reveal from Host header actions', () => {
    const controller = controllerOf(baseState({ desktopAvailable: true }))
    render(<GitDetailsHeaderActions {...actionProps(controller)} />)
    fireEvent.click(screen.getByRole('button', { name: en['details.refresh'] }))
    expect(controller.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en['details.reveal'] }))
    expect(controller.reveal).toHaveBeenCalled()
  })

  it('hides Reveal without desktop capability', () => {
    const controller = controllerOf(baseState({ desktopAvailable: false }))
    render(<GitDetailsHeaderActions {...actionProps(controller)} />)
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    expect(screen.getByRole('button', { name: en['details.refresh'] })).toBeTruthy()
  })

  it('hides Reveal on compact Changes, Graph, and Diff toolbars even when Desktop exists', () => {
    const controller = controllerOf(baseState({ desktopAvailable: true }))
    render(<GitDetailsHeaderActions {...actionProps(controller)} compact />)
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    expect(screen.getByRole('button', { name: en['details.refresh'] })).toBeTruthy()
  })
})


describe('embedded commit message generation', () => {
  it('keeps generation inside the input field and fills only through the controller', () => {
    const controller = controllerOf(baseState({ generationAvailable: true, repository: snapshot({ staged: [{ path: 'src/a.ts', status: 'M ' }] }) }))
    render(<GitChangesSurface {...({ controller, t, sessionId: 'session-a', useSessions: sessionsHook } as unknown as GitChangesSurfaceProps)} />)
    const input = screen.getByRole('textbox', { name: en['details.commitPlaceholder'] })
    const generate = screen.getByRole('button', { name: en['details.generate'] })
    expect(input.parentElement?.contains(generate)).toBe(true)
    expect(generate.querySelector('svg')).not.toBeNull()
    fireEvent.click(generate)
    expect(controller.generateCommitMessage).toHaveBeenCalledTimes(1)
    expect(controller.commit).not.toHaveBeenCalled()
  })
})

describe('Git Changes actions', () => {
  const props = (controller: GitControllerMock): GitChangesSurfaceProps =>
    ({
      controller,
      t,
      sessionId: 'session-a' as never,
      useSessions: sessionsHook,
      useSession: vi.fn(),
      useStore: vi.fn(),
      useWorkspaces: vi.fn(),
      detailsInstance: detailsInstanceOf(GIT_CHANGES_SURFACE_ID),
    }) as unknown as GitChangesSurfaceProps

  it('stages an unstaged path from the row plus control', () => {
    const controller = controllerOf(baseState())
    render(<GitChangesSurface {...props(controller)} />)
    fireEvent.click(screen.getByRole('button', { name: en['details.stage'] }))
    expect(controller.stage).toHaveBeenCalledWith('src/a.ts')
  })

  it('runs commit from the split button when a message and staged files exist', () => {
    const controller = controllerOf(baseState({
      commitMessage: 'ship it',
      repository: snapshot({ staged: [{ path: 'src/a.ts', status: 'M ' }], unstaged: [] }),
    }))
    render(<GitChangesSurface {...props(controller)} />)
    fireEvent.click(screen.getByRole('button', { name: en['details.commit'] }))
    expect(controller.commit).toHaveBeenCalledWith('ship it', {})
  })

  it('opens commit options and amends HEAD', () => {
    const controller = controllerOf(baseState({
      commitMessage: 'revise',
      repository: snapshot({ staged: [{ path: 'src/a.ts', status: 'M ' }], unstaged: [] }),
    }))
    render(<GitChangesSurface {...props(controller)} />)
    fireEvent.click(screen.getByRole('button', { name: en['details.commitOptions'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: en['details.commitAmend'] }))
    expect(controller.commit).toHaveBeenCalledWith('revise', { amend: true })
  })

  it('disables the commit split and its menu together when the current action cannot run', () => {
    const controller = controllerOf(baseState({
      commitMessage: '1',
      repository: snapshot({ staged: [], unstaged: [{ path: 'README.en.md', status: ' M' }] }),
    }))
    render(<GitChangesSurface {...props(controller)} />)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en['details.commit'] }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en['details.commitOptions'] }).disabled).toBe(true)
    expect(screen.queryByRole('menuitem', { name: en['details.commitAmend'] })).toBeNull()
  })

  it('starts the commit message on one unresizable row', () => {
    const controller = controllerOf(baseState())
    render(<GitChangesSurface {...props(controller)} />)
    const input = screen.getByRole('textbox', { name: en['details.commitPlaceholder'] })
    expect(input.getAttribute('rows')).toBe('1')
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitDetailsSurface.module.css'), 'utf8')
    expect(source).toMatch(/\.field textarea[^{]*\{[^}]*\n  height: 36px/)
    expect(source).toMatch(/\.field textarea[^{]*\{[^}]*min-height: 36px/)
    expect(source).toMatch(/\.field textarea[^{]*\{[^}]*resize: none/)
    expect(source).not.toMatch(/resize: vertical/)
  })

  it('fills the commit split from the theme primary button tokens', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitDetailsSurface.module.css'), 'utf8')
    expect(source).toMatch(/\.commitMain[^{]*\{[^}]*background: var\(--dsw-alias-button-primary-fill\)/)
    expect(source).toMatch(/\.commitMain[^{]*\{[^}]*color: var\(--dsw-alias-label-primary-foreground\)/)
  })

  it('keeps the commit menu wrapper measurable for portal placement', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitDetailsSurface.module.css'), 'utf8')
    expect(source).toMatch(/\.commitMenu/)
    expect(source).not.toContain('display: contents')
  })
})

describe('Git Graph button hover token', () => {
  it('uses --dsw-alias-interactive-bg-hover for every hover background', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitGraphSurface.module.css'), 'utf8')
    const blocks = source.match(/[^{}]+\{[^{}]*\}/g) ?? []
    const hoverBackgrounds = blocks.filter(block => block.includes(':hover') && /background\s*:/.test(block))
    expect(hoverBackgrounds.length).toBeGreaterThan(0)
    for (const block of hoverBackgrounds) {
      expect(block).toContain('--dsw-alias-interactive-bg-hover')
    }
  })
})

describe('Git Changes button hover token', () => {
  it('uses --dsw-alias-interactive-bg-hover for every hover background', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/client/GitDetailsSurface.module.css'), 'utf8')
    const blocks = source.match(/[^{}]+\{[^{}]*\}/g) ?? []
    const hoverBackgrounds = blocks.filter(block => block.includes(':hover') && /background\s*:/.test(block))
    expect(hoverBackgrounds.length).toBeGreaterThan(0)
    for (const block of hoverBackgrounds) {
      expect(block).toContain('--dsw-alias-interactive-bg-hover')
    }
  })
})
