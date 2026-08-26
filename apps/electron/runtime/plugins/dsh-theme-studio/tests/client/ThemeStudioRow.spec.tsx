// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeStudioRow } from '../../src/client/ThemeStudioRow.tsx'
import type { ThemeStudioRowComponentProps } from '../../src/client/ThemeStudioRow.tsx'
import type { ThemeStudioCard, ThemeStudioRowState } from '../../src/client/store.ts'
import { DEFAULT_PREVIEW } from '../../src/client/presets.ts'
import { en } from '../../src/client/locales.ts'
import { bindSnapshotSelector } from '../harness.ts'

afterEach(cleanup)

const CARDS: ThemeStudioCard[] = [
  {
    id: null,
    nameKey: 'default.name',
    descriptionKey: 'default.description',
    preview: DEFAULT_PREVIEW,
  },
  {
    id: 'dsh-theme-studio.graphite',
    nameKey: 'graphite.name',
    descriptionKey: 'graphite.description',
    preview: {
      light: { background: '#e8eaed', surface: '#f4f5f6', foreground: '#2c3036', accent: '#5b6570' },
      dark: { background: '#1c1e22', surface: '#25282c', foreground: '#d5d8dc', accent: '#8b949e' },
    },
  },
  {
    id: 'dsh-theme-studio.nordic',
    nameKey: 'nordic.name',
    descriptionKey: 'nordic.description',
    preview: {
      light: { background: '#eceff4', surface: '#e5e9f0', foreground: '#2e3440', accent: '#5e81ac' },
      dark: { background: '#2e3440', surface: '#3b4252', foreground: '#eceff4', accent: '#88c0d0' },
    },
  },
]

function createRowState(cards: readonly ThemeStudioCard[]) {
  let state: ThemeStudioRowState = {
    activeThemeId: null,
    previewThemeId: null,
    previewing: false,
    settingsStatus: 'ready',
    revision: 0,
    cards,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    actions: {
      sync: (snapshot: Omit<ThemeStudioRowState, 'cards'>) => {
        if (snapshot.revision <= state.revision) return
        state = { ...state, ...snapshot, cards }
        for (const listener of [...listeners]) listener()
      },
    },
  }
}

function mount() {
  const store = createRowState(CARDS)
  const previewTheme = vi.fn()
  const activateTheme = vi.fn()
  const cancelPreview = vi.fn()
  const applyPreview = vi.fn()
  const props: ThemeStudioRowComponentProps = {
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    useStore: bindSnapshotSelector(store),
    actions: store.actions as never,
    t: key => en[key] ?? key,
    previewTheme,
    activateTheme,
    cancelPreview,
    applyPreview,
  }
  render(<ThemeStudioRow {...props} />)
  return { store, previewTheme, activateTheme, cancelPreview, applyPreview }
}

describe('ThemeStudioRow', () => {
  it('renders Themes, Default, and builtin cards with Preview and Apply', () => {
    mount()
    expect(screen.getByText('Themes')).toBeDefined()
    expect(screen.getByText('Default')).toBeDefined()
    expect(screen.getByText('Graphite')).toBeDefined()
    expect(screen.getByText('Nordic')).toBeDefined()
    expect(screen.getAllByRole('button', { name: /Preview / })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Apply / })).toHaveLength(3)
  })

  it('marks the active theme and does not persist on Preview', () => {
    const b = mount()
    act(() => {
      b.store.actions.sync({
        activeThemeId: 'dsh-theme-studio.graphite',
        previewThemeId: null,
        previewing: false,
        settingsStatus: 'ready',
        revision: 1,
      })
    })
    expect(screen.getByText('Current')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Nordic' }))
    expect(b.previewTheme).toHaveBeenCalledWith('dsh-theme-studio.nordic')
    expect(b.activateTheme).not.toHaveBeenCalled()
  })

  it('exposes Apply, Cancel, and preview status to assistive tech', () => {
    const b = mount()
    act(() => {
      b.store.actions.sync({
        activeThemeId: 'dsh-theme-studio.graphite',
        previewThemeId: 'dsh-theme-studio.nordic',
        previewing: true,
        settingsStatus: 'ready',
        revision: 2,
      })
    })
    expect(screen.getAllByText('Previewing Nordic').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(b.applyPreview).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(b.cancelPreview).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Preview Nordic' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('restores Default through Apply on the Default card', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Apply Default' }))
    expect(b.activateTheme).toHaveBeenCalledWith(null)
  })
})
