// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRepositorySnapshot } from '../src/types.ts'
import { GitDetailsSurface } from '../src/client/GitDetailsSurface.tsx'
import type { GitDetailsSurfaceProps } from '../src/client/GitDetailsSurface.tsx'
import type { GitClientController } from '../src/client/controller.ts'
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
  const surfaceProps = (controller: GitClientController): GitDetailsSurfaceProps =>
    ({ controller, t }) as GitDetailsSurfaceProps

  it('refreshes on mount and renders repository metadata without a close button', async () => {
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
    expect(screen.getByRole('button', { name: en['details.reveal'] })).toBeTruthy()
    expect(container.querySelector('[data-git-details-surface]')).toBeTruthy()
    expect(container.querySelector('aside')).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
  })

  it('hides Reveal without desktop and shows empty states', () => {
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
    expect(screen.queryByRole('button', { name: en['details.reveal'] })).toBeNull()
    expect(screen.getByText(en['details.notRepository'])).toBeTruthy()
  })
})
