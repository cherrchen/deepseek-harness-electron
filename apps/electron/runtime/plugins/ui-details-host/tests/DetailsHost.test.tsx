// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DETAILS_HEADER_ACTIONS_SLOT, DETAILS_SURFACE_SLOT } from '../src/client/contract.ts'
import type { DetailsLauncherContribution, DetailsSurfaceInstance } from '../src/client/contract.ts'
import { DetailsHost } from '../src/client/DetailsHost.tsx'
import type { DetailsHostProps } from '../src/client/DetailsHost.tsx'
import type { DetailsHostState } from '../src/client/contract.ts'
import { SurfaceErrorBoundary } from '../src/client/SurfaceErrorBoundary.tsx'
import { DetailsHeaderAction } from '../src/client/DetailsHeaderAction.tsx'
import { DetailsToggle } from '../src/client/DetailsToggle.tsx'

afterEach(() => {
  cleanup()
})

/** Minimal ResizeObserver stub: records observed elements, no callbacks. */
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []
  observed: Element[] = []
  constructor(callback: ResizeObserverCallback) {
    void callback
    ResizeObserverStub.instances.push(this)
  }
  observe(el: Element): void { this.observed.push(el) }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  ResizeObserverStub.instances = []
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
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

function state(overrides: Partial<DetailsHostState> = {}): DetailsHostState {
  return {
    tabs: [],
    activeId: null,
    activeInstance: null,
    label: null,
    launcherVisible: false,
    dockVisible: false,
    canGoBack: false,
    ...overrides,
  }
}

function card(overrides: Partial<DetailsLauncherContribution> = {}): DetailsLauncherContribution {
  return {
    id: 'card.alpha',
    pluginId: 'test.plugin',
    title: 'Alpha card',
    open: () => ({ surfaceId: 'test.alpha' }),
    ...overrides,
  }
}

interface Handlers {
  activate?: ReturnType<typeof vi.fn>
  closeTab?: ReturnType<typeof vi.fn>
  showLauncher?: ReturnType<typeof vi.fn>
  openRequest?: ReturnType<typeof vi.fn>
  throwing?: boolean
}

function props(
  snapshot: DetailsHostState,
  entries: readonly DetailsLauncherContribution[] = [],
  handlers: Handlers = {},
): DetailsHostProps {
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
        if (handlers.throwing === true) throw new Error('surface render boom')
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
    useDetailsHost: selector => selector(snapshot),
    launcherEntries: entries,
    reportDockVisible: vi.fn(),
    activate: handlers.activate ?? vi.fn(),
    closeTab: handlers.closeTab ?? vi.fn(),
    showLauncher: handlers.showLauncher ?? vi.fn(),
    openRequest: handlers.openRequest ?? vi.fn(),
    close: vi.fn(),
    back: vi.fn(),
  }
}

describe('DetailsHost', () => {
  it('renders the launcher with an empty state while no tabs are open', () => {
    const view = render(<DetailsHost {...props(state())} />)
    expect(view.container.querySelector('[data-details-host]')).not.toBeNull()
    expect(screen.getByText('Open a tab')).toBeTruthy()
    expect(screen.getByText(/No panels are available/)).toBeTruthy()
  })

  it('renders launcher cards from live contributions and opens on click', () => {
    const openRequest = vi.fn()
    const entry = card({
      id: 'card.alpha',
      title: 'Git',
      description: 'Working tree changes',
      open: () => ({ surfaceId: 'git.changes', payload: { repo: 'r' } }),
    })
    render(<DetailsHost {...props(state(), [entry], { openRequest })} />)
    fireEvent.click(screen.getByRole('button', { name: /Git/ }))
    expect(openRequest).toHaveBeenCalledWith({ surfaceId: 'git.changes', payload: { repo: 'r' } })
  })

  it('renders launcher cards in the given contribution order', () => {
    render(<DetailsHost {...props(state(), [card({ id: 'b', title: 'B' }), card({ id: 'a', title: 'A' })])} />)
    const cards = screen.getAllByRole('button').map(button => button.textContent)
    expect(cards).toEqual(['B', 'A'])
  })

  it('renders the tab bar with the active tab and header actions, without a global close button', () => {
    const active = instance()
    const inactive = instance({ instanceId: 'details-instance-2', surfaceId: 'test.beta', label: 'Beta' })
    render(<DetailsHost {...props(state({
      tabs: [active, inactive],
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
    }), [], { showLauncher: vi.fn() })} />)
    const tablist = screen.getByRole('tablist', { name: 'Details tabs' })
    expect(tablist).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    expect(screen.getByTestId('surface-test.alpha')).toBeTruthy()
    expect(screen.getByTestId('action-test.alpha').getAttribute('data-instance-id')).toBe('details-instance-1')
    // v3 removed the dock-level X; tabs close individually.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('activates a tab on click and closes it via its own close control', () => {
    const activate = vi.fn()
    const closeTab = vi.fn()
    const active = instance()
    render(<DetailsHost {...props(state({
      tabs: [active],
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
    }), [], { activate, closeTab })} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }))
    expect(activate).toHaveBeenCalledWith('details-instance-1')
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha' }))
    expect(closeTab).toHaveBeenCalledWith('details-instance-1')
  })

  it('omits the close control for non-closable tabs', () => {
    const active = instance({ closable: false })
    render(<DetailsHost {...props(state({
      tabs: [active],
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
    }))} />)
    expect(screen.queryByRole('button', { name: 'Close Alpha' })).toBeNull()
  })

  it('shows the launcher page over the tab bar via the + control', () => {
    const showLauncher = vi.fn()
    const active = instance()
    render(<DetailsHost {...props(state({
      tabs: [active],
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
      launcherVisible: true,
    }), [card()], { showLauncher })} />)
    expect(screen.getByText('Open a tab')).toBeTruthy()
    expect(screen.queryByTestId('surface-test.alpha')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open a tab' }))
    expect(showLauncher).toHaveBeenCalledTimes(1)
  })

  it('activates the neighbor tab with arrow keys', () => {
    const activate = vi.fn()
    const alpha = instance()
    const beta = instance({ instanceId: 'details-instance-2', surfaceId: 'test.beta', label: 'Beta' })
    render(<DetailsHost {...props(state({
      tabs: [alpha, beta],
      activeId: alpha.surfaceId,
      activeInstance: alpha,
      label: 'Alpha',
    }), [], { activate })} />)
    const tablist = screen.getByRole('tablist', { name: 'Details tabs' })
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(activate).toHaveBeenCalledWith('details-instance-2')
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(activate).toHaveBeenCalledWith('details-instance-2')
  })

  it('isolates a crashing surface behind the error boundary', () => {
    const active = instance()
    const { container } = render(<DetailsHost {...props(state({
      tabs: [active],
      activeId: active.surfaceId,
      activeInstance: active,
      label: 'Alpha',
    }), [], { throwing: true })} />)
    expect(container.querySelector('[data-details-surface-error]')).not.toBeNull()
    expect(container.textContent).toContain('test.alpha')
  })
})

describe('DetailsToggle', () => {
  function toggleProps(overrides: Partial<DetailsHostState> = {}): DetailsToggleProps {
    return {
      sessionId: 'session-a' as never,
      useSession: unused,
      useSessions: unused,
      useWorkspaces: unused,
      t: ((key: string) => `label:${key}`) as never,
      useDetailsToggle: selector => selector(state(overrides)),
      toggleDock: vi.fn(),
    }
  }

  it('renders pressed with the measured dock visibility', () => {
    render(<DetailsToggle {...toggleProps({ dockVisible: true })} />)
    const button = screen.getByRole('button', { name: 'label:toggle.label' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders unpressed while the dock is hidden and toggles on click', () => {
    const toggleDock = vi.fn()
    render(<DetailsToggle {...toggleProps({ dockVisible: false, tabs: [], activeId: null })} toggleDock={toggleDock} />)
    const button = screen.getByRole('button', { name: 'label:toggle.label' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(toggleDock).toHaveBeenCalledTimes(1)
  })
})

describe('SurfaceErrorBoundary', () => {
  it('replaces a crashing child with the error panel', () => {
    function Bomb(): never {
      throw new Error('boom')
    }
    const { container } = render(
      <SurfaceErrorBoundary surfaceId="test.bomb">
        <Bomb />
      </SurfaceErrorBoundary>,
    )
    expect(container.querySelector('[data-details-surface-error]')).not.toBeNull()
    expect(container.textContent).toContain('test.bomb')
  })
})

describe('DetailsHost Windows Desktop chrome', () => {
  it('clears the caption row when Desktop stamps win32 on the document root', () => {
    const source = readFileSync(join(process.cwd(), 'src/client/DetailsHost.module.css'), 'utf8')
    expect(source).toContain("data-dsh-desktop-platform='win32'")
    expect(source).toContain('--dsh-native-control-row-height')
  })
})

describe('DetailsHost responsive tab strip contract', () => {
  const CSS_SOURCE = readFileSync(join(process.cwd(), 'src/client/DetailsHost.module.css'), 'utf8')

  function manyTabs(count: number): { tabs: DetailsSurfaceInstance[]; active: DetailsSurfaceInstance } {
    const tabs = Array.from({ length: count }, (_, index) => instance({
      instanceId: `details-instance-${index + 1}`,
      surfaceId: `test.surface-${index + 1}`,
      label: index === 0 ? 'Git Changes' : `Very Long Plugin Tab Name ${index + 1}`,
    }))
    return { tabs, active: tabs[0] as DetailsSurfaceInstance }
  }

  it('keeps every tab, its close button, the + control, and the header actions area mounted under tab pressure', () => {
    const { tabs, active } = manyTabs(8)
    render(<DetailsHost {...props(state({
      tabs,
      activeId: active.surfaceId,
      activeInstance: active,
      label: active.label,
    }), [], { showLauncher: vi.fn() })} />)
    expect(screen.getAllByRole('tab')).toHaveLength(8)
    expect(screen.getAllByRole('button', { name: /^Close / })).toHaveLength(8)
    // The action area rides the active surface only, and never leaves the DOM.
    expect(screen.getByTestId('action-test.surface-1')).toBeTruthy()
    expect(screen.queryByTestId('action-test.surface-2')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open a tab' })).toBeTruthy()
  })

  it('keeps the compression layout contract: tabs shrink, the strip never scrolls, actions never shrink', () => {
    expect(CSS_SOURCE).toMatch(/\.tabWrap \{[^}]*flex: 0 1 auto/)
    expect(CSS_SOURCE).toMatch(/\.tabWrap \{[^}]*min-width: 0/)
    expect(CSS_SOURCE).toMatch(/\.tab \{[^}]*min-width: 0/)
    expect(CSS_SOURCE).toMatch(/\.tabLabel \{[^}]*text-overflow: ellipsis/)
    expect(CSS_SOURCE).toMatch(/\.tabClose \{[^}]*flex: none/)
    expect(CSS_SOURCE).toMatch(/\.tabbar \{[^}]*overflow: hidden/)
    expect(CSS_SOURCE).toMatch(/\.tabbarTrailing \{[^}]*flex: none/)
    // Shared header geometry: token-driven height plus the main header's
    // transparent-border + hairline ::after divider treatment.
    expect(CSS_SOURCE).toMatch(/\.tabbar \{[^}]*height: var\(--app-header-height, 45px\)/)
    expect(CSS_SOURCE).toMatch(/\.tabbar \{[^}]*border-bottom: 1px solid transparent/)
    expect(CSS_SOURCE).toMatch(/\.tabbar::after \{[^}]*height: 0\.5px/)
    expect(CSS_SOURCE).toMatch(/\.tabbar::after \{[^}]*background: var\(--dsw-alias-border-l3\)/)
  })

  it('aligns the round controls with the tab row: no margin-based lift, one bottom-aligned strip', () => {
    expect(CSS_SOURCE).toMatch(/\.tabbar \{[^}]*align-items: flex-end/)
    expect(CSS_SOURCE).not.toMatch(/\.addTab[^{]*\{[^}]*margin-bottom/)
  })
})

describe('DetailsHeaderAction', () => {
  it('renders an icon-only button whose aria-label mirrors the tooltip label', () => {
    const onTrigger = vi.fn()
    render(
      <DetailsHeaderAction
        icon={<svg data-testid="glyph" />}
        label="Refresh Git status"
        onTrigger={onTrigger}
      />,
    )
    const button = screen.getByRole('button', { name: 'Refresh Git status' })
    expect(button.querySelector('[data-testid="glyph"]')).not.toBeNull()
    // Label drives tooltip + a11y only; no visible text node.
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('propagates the disabled state to the button', () => {
    const onTrigger = vi.fn()
    render(<DetailsHeaderAction icon={<span />} label="Reveal" onTrigger={onTrigger} disabled />)
    const button = screen.getByRole('button', { name: 'Reveal' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onTrigger).not.toHaveBeenCalled()
  })
})
