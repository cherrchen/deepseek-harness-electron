// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import type { DetailsHostProps } from '../src/client/DetailsHost.tsx'
import type { DetailsHostState } from '../src/client/contract.ts'

afterEach(() => {
  cleanup()
})

const unused = (): never => {
  throw new Error('unused')
}

function props(state: DetailsHostState, close = vi.fn()): DetailsHostProps {
  return {
    sessionId: 'session-a' as DetailsHostProps['sessionId'],
    useSession: unused,
    useSessions: unused,
    useWorkspaces: unused,
    renderSlot: (_name, _owner, options) => <div data-testid={`surface-${String(options?.only)}`} />,
    useDetailsHost: selector => selector(state),
    close,
  }
}

describe('DetailsHost', () => {
  it('renders nothing while idle', () => {
    const view = render(<DetailsHost {...props({ activeId: null, label: null })} />)
    expect(view.container.querySelector('[data-details-host]')).toBeNull()
  })

  it('renders the active surface and closes from the header control', () => {
    const close = vi.fn()
    render(<DetailsHost {...props({ activeId: 'test.alpha', label: 'Alpha' }, close)} />)
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByTestId('surface-test.alpha')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
