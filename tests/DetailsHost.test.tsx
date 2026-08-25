// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DETAILS_HEADER_ACTIONS_SLOT, DETAILS_SURFACE_SLOT } from '../src/client/contract.ts'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import type { DetailsHostProps } from '../src/client/DetailsHost.tsx'
import type { DetailsHostState, DetailsSurfaceInstance } from '../src/client/contract.ts'

afterEach(() => {
  cleanup()
})

const unused = (): never => {
  throw new Error('unused')
}

function instance(overrides: Partial<DetailsSurfaceInstance> = {}): DetailsSurfaceInstance {
  return {
    instanceId: 'details-instance-1',
    surfaceId: 'test.alpha',
    payload: { tab: 'diff' },
    label: 'Alpha',
    sessionId: 'session-a',
    ...overrides,
  }
}

function props(
  state: DetailsHostState,
  handlers: { close?: ReturnType<typeof vi.fn>; back?: ReturnType<typeof vi.fn> } = {},
): DetailsHostProps {
  const close = handlers.close ?? vi.fn()
  const back = handlers.back ?? vi.fn()
  return {
    sessionId: 'session-a' as DetailsHostProps['sessionId'],
    useSession: unused,
    useSessions: unused,
    useWorkspaces: unused,
    renderSlot: (name, owner, options) => {
      if (name === DETAILS_HEADER_ACTIONS_SLOT) {
        return (
          <button
            type="button"
            data-testid={`action-${String(options?.only)}`}
            data-instance-id={(owner as { detailsInstance: DetailsSurfaceInstance }).detailsInstance.instanceId}
          >
            Refresh
          </button>
        )
      }
      if (name === DETAILS_SURFACE_SLOT) {
        return (
          <div
            data-testid={`surface-${String(options?.only)}`}
            data-instance-id={(owner as { detailsInstance: DetailsSurfaceInstance }).detailsInstance.instanceId}
            data-payload={JSON.stringify((owner as { detailsInstance: DetailsSurfaceInstance }).detailsInstance.payload)}
          />
        )
      }
      return null
    },
    useDetailsHost: selector => selector(state),
    close,
    back,
  }
}

describe('DetailsHost', () => {
  it('renders nothing while idle', () => {
    const view = render(<DetailsHost {...props({
      activeId: null,
      activeInstance: null,
      label: null,
      canGoBack: false,
    })} />)
    expect(view.container.querySelector('[data-details-host]')).toBeNull()
  })

  it('renders header actions and closes from the header', () => {
    const close = vi.fn()
    const active = instance()
    render(<DetailsHost {...props({
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
      canGoBack: false,
    }, { close })} />)
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByTestId('surface-test.alpha')).toBeTruthy()
    expect(screen.getByTestId('action-test.alpha').getAttribute('data-instance-id')).toBe('details-instance-1')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('renders a back control when history is available', () => {
    const back = vi.fn()
    const active = instance()
    render(<DetailsHost {...props({
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
      canGoBack: true,
    }, { back })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).toHaveBeenCalledTimes(1)
  })
})
