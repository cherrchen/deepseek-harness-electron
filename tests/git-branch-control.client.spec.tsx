// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor, fireEvent, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRepositorySnapshot } from '../src/types.ts'
import {
  createBranchErrorMessage,
  GitBranchControl,
} from '../src/client/GitBranchControl.tsx'
import type { GitClientController, GitClientState } from '../src/client/controller.ts'
import type { GitDetailsTab } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'

const SESSION_A = 'session-a' as SessionId
const SESSION_B = 'session-b' as SessionId

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

function controllerOf(state: GitClientState): GitClientController {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setWorkspace: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    selectTab: vi.fn(),
    selectDiff: vi.fn(async () => {}),
    stage: vi.fn(async () => {}),
    unstage: vi.fn(async () => {}),
    switchBranch: vi.fn(async () => {}),
    createBranch: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    reveal: vi.fn(async () => {}),
    setDesktop: vi.fn(),
  } as unknown as GitClientController
}

function sessionsOf(cwdBySession: Partial<Record<SessionId, string>>): SessionListState {
  const ids = Object.keys(cwdBySession) as SessionId[]
  const byId = {} as Record<SessionId, SessionSummary>
  for (const id of ids) {
    const cwd = cwdBySession[id]
    byId[id] = {
      id,
      displayTitle: id,
      running: false,
      blank: false,
      updatedAt: 0,
      ...(cwd === undefined ? {} : { cwd }),
    }
  }
  return {
    ids,
    byId,
    current: ids[0],
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

const unused = (): never => { throw new Error('unused') }

describe('GitBranchControl', () => {
  afterEach(() => { cleanup() })

  const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']
  const baseProps = (
    controller: GitClientController,
    list: SessionListState,
    openDetails: (tab?: GitDetailsTab) => void = vi.fn(),
  ) => ({
    controller,
    openDetails,
    t,
    useSessions: <S,>(selector: (s: SessionListState) => S): S => selector(list),
    useSession: unused,
    useWorkspaces: unused,
    useProjection: unused,
    useInput: unused,
    inputActions: {
      setDraft: unused,
      submit: unused,
      addImages: unused,
      removeImage: unused,
      pruneImages: unused,
    },
    session: {} as never,
    input: {} as never,
  })

  it('binds repository discovery to the current session cwd', async () => {
    const controller = controllerOf({
      workspacePath: undefined,
      repository: snapshot({ branch: 'develop' }),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    const list = sessionsOf({ [SESSION_A]: '/projects/alpha', [SESSION_B]: '/projects/beta' })
    const props = baseProps(controller, list)
    const { rerender } = render(<GitBranchControl {...props} sessionId={SESSION_A} />)
    await waitFor(() => {
      expect(controller.setWorkspace).toHaveBeenCalledWith('/projects/alpha')
    })
    rerender(<GitBranchControl {...props} sessionId={SESSION_B} />)
    await waitFor(() => {
      expect(controller.setWorkspace).toHaveBeenCalledWith('/projects/beta')
    })
  })

  it('renders nothing while discovery is pending or when the workspace is not a Git repository', () => {
    const list = sessionsOf({ [SESSION_A]: '/projects/plain' })
    const pending = controllerOf({
      workspacePath: '/projects/plain',
      repository: undefined,
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: true,
      error: undefined,
      desktopAvailable: false,
    })
    const { container, rerender } = render(
      <GitBranchControl {...baseProps(pending, list)} sessionId={SESSION_A} />,
    )
    expect(container.firstChild).toBeNull()

    const nonRepo = controllerOf({
      workspacePath: '/projects/plain',
      repository: null,
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    rerender(<GitBranchControl {...baseProps(nonRepo, list)} sessionId={SESSION_A} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls openDetails when the changes indicator is clicked', () => {
    const openDetails = vi.fn()
    const controller = controllerOf({
      workspacePath: '/projects/alpha',
      repository: snapshot({ unstaged: [{ path: 'src/a.ts', status: ' M' }] }),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    const list = sessionsOf({ [SESSION_A]: '/projects/alpha' })
    render(<GitBranchControl {...baseProps(controller, list, openDetails)} sessionId={SESSION_A} />)
    fireEvent.click(screen.getByRole('button', { name: /1 changes/i }))
    expect(openDetails).toHaveBeenCalledWith('changes')
  })

  it('opens a conversation Modal to create a branch', async () => {
    const createBranch = vi.fn(async () => {})
    const controller = controllerOf({
      workspacePath: '/projects/alpha',
      repository: snapshot(),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    ;(controller as { createBranch: typeof createBranch }).createBranch = createBranch
    const list = sessionsOf({ [SESSION_A]: '/projects/alpha' })
    render(<GitBranchControl {...baseProps(controller, list)} sessionId={SESSION_A} />)
    fireEvent.click(screen.getByRole('button', { name: 'main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create new branch' }))
    expect(await screen.findByRole('dialog', { name: 'Create branch' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New branch name'), { target: { value: 'feature/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => {
      expect(createBranch).toHaveBeenCalledWith('feature/x')
    })
  })

  it('explains unborn repositories instead of offering create', async () => {
    const controller = controllerOf({
      workspacePath: '/projects/alpha',
      repository: snapshot({
        head: null,
        branches: [],
        branch: 'main',
      }),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    const list = sessionsOf({ [SESSION_A]: '/projects/alpha' })
    render(<GitBranchControl {...baseProps(controller, list)} sessionId={SESSION_A} />)
    fireEvent.click(screen.getByRole('button', { name: 'main' }))
    expect(await screen.findByText(/No commits yet/i)).toBeTruthy()
    expect((screen.getByRole('menuitem', { name: 'Create new branch' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('createBranchErrorMessage', () => {
  const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']

  it('maps unborn HEAD and object-name failures to the same copy', () => {
    expect(createBranchErrorMessage(new Error('boom'), true, t)).toBe(en['branch.unbornCreate'])
    expect(createBranchErrorMessage(new Error("fatal: not a valid object name: 'main'"), false, t))
      .toBe(en['branch.unbornCreate'])
  })
})
