import { describe, expect, it } from 'vitest'
import { stubSettingsScope } from '../harness.ts'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeStudioSettings } from '../../src/constants.ts'
import { BuiltinPresetRegistry } from '../../src/client/catalog.ts'
import {
  ACTIVE_SOURCE, PREVIEW_SOURCE, ThemeStudioRuntime,
} from '../../src/client/runtime.ts'

const GRAPHITE = 'dsh-theme-studio.graphite'
const NORDIC = 'dsh-theme-studio.nordic'
const OLED = 'dsh-theme-studio.oled'

function fakeTheme() {
  const layers = new Map<string, { tokens: ThemeTokenOverrides; seq: number }>()
  let seq = 0
  return {
    layers,
    has(source: string): boolean {
      return layers.has(source)
    },
    theme: {
      overrideTokens(source: string, tokens: ThemeTokenOverrides) {
        const layer = { tokens: structuredClone(tokens), seq: seq++ }
        layers.set(source, layer)
        return () => {
          if (layers.get(source) === layer) layers.delete(source)
        }
      },
      setTheme() {
        throw new Error('Theme Studio must not call setTheme')
      },
    },
  }
}

function durableHost(value: ThemeStudioSettings | undefined = undefined) {
  const host = stubSettingsScope<ThemeStudioSettings>()
  if (value !== undefined) {
    host.publish({ status: 'ready', value, revision: 1, writable: true })
  }
  host.set.mockImplementation((_field: string, next: unknown) => {
    host.publish({
      status: 'ready',
      value: { activeThemeId: next as string | null },
      revision: (host.scope.getSnapshot().revision ?? 0) + 1,
      writable: true,
    })
    return Promise.resolve()
  })
  return host
}

function make(host = durableHost({ activeThemeId: null })) {
  const overlay = fakeTheme()
  const runtime = new ThemeStudioRuntime({
    theme: overlay.theme,
    host: host.scope,
    catalog: new BuiltinPresetRegistry(),
  })
  return { runtime, overlay, host }
}

describe('ThemeStudioRuntime', () => {
  it('starts at Default with no active overlay', () => {
    const { runtime, overlay } = make()
    expect(runtime.getSnapshot()).toMatchObject({
      activeThemeId: null,
      previewThemeId: null,
      previewing: false,
      settingsStatus: 'ready',
    })
    expect(overlay.has(ACTIVE_SOURCE)).toBe(false)
    expect(overlay.has(PREVIEW_SOURCE)).toBe(false)
  })

  it('applies Graphite as ACTIVE_SOURCE', async () => {
    const { runtime, overlay, host } = make()
    runtime.activateTheme(GRAPHITE)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(runtime.getSnapshot().activeThemeId).toBe(GRAPHITE)
    await Promise.resolve()
    expect(host.set).toHaveBeenCalledWith('activeThemeId', GRAPHITE)
  })

  it('replaces Graphite with Nordic on the same source', () => {
    const { runtime, overlay } = make()
    runtime.activateTheme(GRAPHITE)
    runtime.activateTheme(NORDIC)
    expect(overlay.layers.get(ACTIVE_SOURCE)?.tokens['--dsw-alias-brand-primary']?.light)
      .toBe('#5e81ac')
    expect(runtime.getSnapshot().activeThemeId).toBe(NORDIC)
  })

  it('restores Default and removes ACTIVE_SOURCE', async () => {
    const { runtime, overlay, host } = make()
    runtime.activateTheme(NORDIC)
    runtime.restoreDefault()
    expect(overlay.has(ACTIVE_SOURCE)).toBe(false)
    expect(runtime.getSnapshot().activeThemeId).toBeNull()
    await Promise.resolve()
    expect(host.set).toHaveBeenCalledWith('activeThemeId', null)
  })

  it('preview overlays Nordic on Graphite without writing settings', async () => {
    const { runtime, overlay, host } = make()
    runtime.activateTheme(GRAPHITE)
    host.set.mockClear()
    runtime.previewTheme(NORDIC)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(overlay.has(PREVIEW_SOURCE)).toBe(true)
    expect(overlay.layers.get(PREVIEW_SOURCE)!.seq)
      .toBeGreaterThan(overlay.layers.get(ACTIVE_SOURCE)!.seq)
    expect(runtime.getSnapshot()).toMatchObject({
      activeThemeId: GRAPHITE,
      previewThemeId: NORDIC,
      previewing: true,
    })
    await Promise.resolve()
    expect(host.set).not.toHaveBeenCalled()
  })

  it('cancel preview restores Graphite', () => {
    const { runtime, overlay } = make()
    runtime.activateTheme(GRAPHITE)
    runtime.previewTheme(NORDIC)
    runtime.cancelPreview()
    expect(overlay.has(PREVIEW_SOURCE)).toBe(false)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(runtime.getSnapshot().previewing).toBe(false)
  })

  it('replaces preview without dropping the active overlay', () => {
    const { runtime, overlay } = make()
    runtime.activateTheme(GRAPHITE)
    runtime.previewTheme(NORDIC)
    const activeSeq = overlay.layers.get(ACTIVE_SOURCE)!.seq
    runtime.previewTheme(OLED)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(overlay.layers.get(ACTIVE_SOURCE)!.seq).toBe(activeSeq)
    expect(overlay.layers.get(PREVIEW_SOURCE)?.tokens['--dsw-alias-bg-base']?.dark).toBe('#000000')
    expect(runtime.getSnapshot().previewThemeId).toBe(OLED)
  })

  it('apply preview promotes Nordic and drops PREVIEW_SOURCE', async () => {
    const { runtime, overlay, host } = make()
    runtime.activateTheme(GRAPHITE)
    runtime.previewTheme(NORDIC)
    runtime.applyPreview()
    expect(overlay.has(PREVIEW_SOURCE)).toBe(false)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(runtime.getSnapshot()).toMatchObject({
      activeThemeId: NORDIC,
      previewThemeId: null,
      previewing: false,
    })
    await Promise.resolve()
    expect(host.set).toHaveBeenLastCalledWith('activeThemeId', NORDIC)
  })

  it('restores a durable theme on a new runtime', () => {
    const host = durableHost({ activeThemeId: NORDIC })
    const overlay = fakeTheme()
    const runtime = new ThemeStudioRuntime({
      theme: overlay.theme,
      host: host.scope,
      catalog: new BuiltinPresetRegistry(),
    })
    expect(runtime.getSnapshot().activeThemeId).toBe(NORDIC)
    expect(overlay.has(ACTIVE_SOURCE)).toBe(true)
  })

  it('repairs an unknown persisted id to Default', async () => {
    const host = durableHost({ activeThemeId: 'removed-theme' })
    const overlay = fakeTheme()
    const runtime = new ThemeStudioRuntime({
      theme: overlay.theme,
      host: host.scope,
      catalog: new BuiltinPresetRegistry(),
    })
    expect(runtime.getSnapshot().activeThemeId).toBeNull()
    expect(overlay.has(ACTIVE_SOURCE)).toBe(false)
    await Promise.resolve()
    expect(host.set).toHaveBeenCalledWith('activeThemeId', null)
  })

  it('reconverges to durable Graphite when a Nordic write does not stick', async () => {
    const host = durableHost({ activeThemeId: GRAPHITE })
    const overlay = fakeTheme()
    const runtime = new ThemeStudioRuntime({
      theme: overlay.theme,
      host: host.scope,
      catalog: new BuiltinPresetRegistry(),
    })
    host.set.mockImplementation(() => Promise.resolve())
    runtime.activateTheme(NORDIC)
    expect(runtime.getSnapshot().activeThemeId).toBe(NORDIC)
    await Promise.resolve()
    expect(runtime.getSnapshot().activeThemeId).toBe(GRAPHITE)
    expect(overlay.layers.get(ACTIVE_SOURCE)?.tokens['--dsw-alias-brand-primary']?.light)
      .toBe('#5b6570')
  })

  it('drops both overlays on dispose', () => {
    const { runtime, overlay } = make()
    runtime.activateTheme(GRAPHITE)
    runtime.previewTheme(NORDIC)
    runtime.dispose()
    expect(overlay.has(ACTIVE_SOURCE)).toBe(false)
    expect(overlay.has(PREVIEW_SOURCE)).toBe(false)
    expect(overlay.layers.size).toBe(0)
  })
})
