// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DetailsSurfaceInstance } from '@dsh-electron/dsh-client-ui-details-host/client'
import type { GitRepositorySnapshot } from '../src/types.ts'
import { GitDetailsHeaderActions } from '../src/client/GitDetailsHeaderActions.tsx'
import type { GitDetailsHeaderActionsProps } from '../src/client/GitDetailsHeaderActions.tsx'
import { GitDetailsSurface } from '../src/client/GitDetailsSurface.tsx'
import type { GitDetailsSurfaceProps } from '../src/client/GitDetailsSurface.tsx'
import type { GitClientController } from '../src/client/controller.ts'
import { GIT_DETAILS_SURFACE_ID } from '../src/client/contract.ts'
import type { GitDetailsPayload } from '../src/client/contract.ts'
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

function detailsInstanceOf(payload: GitDetailsPayload = {}): DetailsSurfaceInstance<GitDetailsPayload> {
  return {
    instanceId: 'details-instance-1',
    surfaceId: GIT_DETAILS_SURFACE_ID,
    payload,
    label: 'Git',
    sessionId: 'session-a',
  }
}

function controllerOf(state: ReturnType<GitClientController['getSnapshot']>): GitClientController {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
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
    setWorkspace: vi.fn(async () => {}),
  } as unknown as GitClientController
}

describe('GitDetailsSurface', () => {
  afterEach(() => { cleanup() })

  const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']
  const surfaceProps = (
    controller: GitClientController,
    detailsInstance: DetailsSurfaceInstance<GitDetailsPayload> = detailsInstanceOf(),
  ): GitDetailsSurfaceProps =>
    ({ controller, t, detailsInstance }) as GitDetailsSurfaceProps

  it('refreshes on mount and renders repository context without panel actions', async () => {
    const controller = controllerOf({
      workspacePath: '/workspace',
      repository: snapshot(),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: true,
    })
    const { container } = render(<GitDetailsSurface {...surfaceProps(controller)} />)
    expect(controller.refresh).toHaveBeenCalled()
    expect(screen.getByText('repo')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    expect(screen.queryByRole('button', { name: en['details.refresh'] })).toBeNull()
    expect(container.querySelector('[data-git-details-surface]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
  })

  it('applies payload tab to the controller without assuming prior selectTab', () => {
    const controller = controllerOf({
      workspacePath: '/workspace',
      repository: snapshot(),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    render(<GitDetailsSurface {...surfaceProps(controller, detailsInstanceOf({ tab: 'diff' }))} />)
    expect(controller.selectTab).toHaveBeenCalledWith('diff')
  })

  it('shows empty states without desktop-dependent chrome', () => {
    const controller = controllerOf({
      workspacePath: '/workspace',
      repository: null,
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    render(<GitDetailsSurface {...surfaceProps(controller)} />)
    expect(screen.getByText(en['details.notRepository'])).toBeTruthy()
  })
})

describe('GitDetailsHeaderActions', () => {
  afterEach(() => { cleanup() })

  const t = ((key: keyof typeof en) => en[key]) as PropsLocale<'git'>['t']
  const actionProps = (controller: GitClientController): GitDetailsHeaderActionsProps =>
    ({
      controller,
      t,
      detailsInstance: detailsInstanceOf(),
    }) as GitDetailsHeaderActionsProps

  it('renders Refresh and conditional Reveal from Host header actions', () => {
    const controller = controllerOf({
      workspacePath: '/workspace',
      repository: snapshot(),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: true,
    })
    render(<GitDetailsHeaderActions {...actionProps(controller)} />)
    fireEvent.click(screen.getByRole('button', { name: en['details.refresh'] }))
    expect(controller.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en['details.reveal'] }))
    expect(controller.reveal).toHaveBeenCalled()
  })

  it('hides Reveal without desktop capability', () => {
    const controller = controllerOf({
      workspacePath: '/workspace',
      repository: snapshot(),
      activeTab: 'changes',
      selectedDiff: undefined,
      diff: undefined,
      loading: false,
      error: undefined,
      desktopAvailable: false,
    })
    render(<GitDetailsHeaderActions {...actionProps(controller)} />)
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    expect(screen.getByRole('button', { name: en['details.refresh'] })).toBeTruthy()
  })
})
