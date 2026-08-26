// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ThemeStudioSettings } from '../../src/constants.ts'
import { BuiltinPresetRegistry } from '../../src/client/catalog.ts'
import { presetToOverrides } from '../../src/client/adapter.ts'
import { BUILTIN_PRESETS } from '../../src/client/presets.ts'
import { ACTIVE_SOURCE, PREVIEW_SOURCE, ThemeStudioRuntime } from '../../src/client/runtime.ts'
import { stubSettingsScope } from '../harness.ts'
import { ThemeRuntime } from './official-theme-runtime.ts'

const NORDIC = BUILTIN_PRESETS.find(preset => preset.id === 'dsh-theme-studio.nordic')!
const GRAPHITE = BUILTIN_PRESETS.find(preset => preset.id === 'dsh-theme-studio.graphite')!

interface ThemeSettings {
  preference: 'light' | 'dark' | 'system'
}

function durableStudio(value: ThemeStudioSettings) {
  const host = stubSettingsScope<ThemeStudioSettings>()
  host.publish({ status: 'ready', value, revision: 1, writable: true })
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

describe('ThemeRuntime + Theme Studio integration', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('folds Nordic light tokens into the official light base', () => {
    const themeHost = stubSettingsScope<ThemeSettings>()
    themeHost.publish({ status: 'ready', value: { preference: 'light' }, revision: 1, writable: true })
    const ctx = new Context()
    const theme = new ThemeRuntime(ctx, themeHost.scope)
    const studio = new ThemeStudioRuntime({
      theme,
      host: durableStudio({ activeThemeId: NORDIC.id }).scope,
      catalog: new BuiltinPresetRegistry(),
    })
    const expected = presetToOverrides(NORDIC)
    expect(theme.getTheme().preference).toBe('light')
    expect(theme.getTheme().active.colorScheme).toBe('light')
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(expected['--dsw-alias-bg-base']!.light)
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe(expected['--dsw-alias-brand-primary']!.light)
    studio.dispose()
  })

  it('selects Nordic dark tokens when Appearance is dark', () => {
    const themeHost = stubSettingsScope<ThemeSettings>()
    themeHost.publish({ status: 'ready', value: { preference: 'light' }, revision: 1, writable: true })
    const ctx = new Context()
    const theme = new ThemeRuntime(ctx, themeHost.scope)
    new ThemeStudioRuntime({
      theme,
      host: durableStudio({ activeThemeId: NORDIC.id }).scope,
      catalog: new BuiltinPresetRegistry(),
    })
    theme.setTheme('dark')
    const expected = presetToOverrides(NORDIC)
    expect(theme.getTheme().active.colorScheme).toBe('dark')
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(expected['--dsw-alias-bg-base']!.dark)
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe(expected['--dsw-alias-brand-primary']!.dark)
  })

  it('keeps the Theme Studio id when Appearance switches to system', () => {
    const media = { matches: false, addEventListener() {}, removeEventListener() {} }
    vi.stubGlobal('matchMedia', () => media)
    const themeHost = stubSettingsScope<ThemeSettings>()
    themeHost.publish({ status: 'ready', value: { preference: 'dark' }, revision: 1, writable: true })
    const ctx = new Context()
    const theme = new ThemeRuntime(ctx, themeHost.scope)
    const studioHost = durableStudio({ activeThemeId: NORDIC.id })
    const studio = new ThemeStudioRuntime({
      theme,
      host: studioHost.scope,
      catalog: new BuiltinPresetRegistry(),
    })
    theme.setTheme('system')
    expect(theme.getTheme().preference).toBe('system')
    expect(studio.getSnapshot().activeThemeId).toBe(NORDIC.id)
    expect(themeHost.set).toHaveBeenCalledWith('preference', 'system')
    expect(studioHost.set).not.toHaveBeenCalled()
  })

  it('lets preview tokens win over the active overlay in the composed snapshot', () => {
    const themeHost = stubSettingsScope<ThemeSettings>()
    themeHost.publish({ status: 'ready', value: { preference: 'light' }, revision: 1, writable: true })
    const ctx = new Context()
    const theme = new ThemeRuntime(ctx, themeHost.scope)
    const studio = new ThemeStudioRuntime({
      theme,
      host: durableStudio({ activeThemeId: GRAPHITE.id }).scope,
      catalog: new BuiltinPresetRegistry(),
    })
    studio.previewTheme(NORDIC.id)
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary'])
      .toBe(presetToOverrides(NORDIC)['--dsw-alias-brand-primary']!.light)
    studio.cancelPreview()
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary'])
      .toBe(presetToOverrides(GRAPHITE)['--dsw-alias-brand-primary']!.light)
  })

  it('removes Theme Studio layers from ThemeRuntime on dispose', () => {
    const themeHost = stubSettingsScope<ThemeSettings>()
    const ctx = new Context()
    const theme = new ThemeRuntime(ctx, themeHost.scope)
    const studio = new ThemeStudioRuntime({
      theme,
      host: durableStudio({ activeThemeId: GRAPHITE.id }).scope,
      catalog: new BuiltinPresetRegistry(),
    })
    studio.previewTheme(NORDIC.id)
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBeDefined()
    studio.dispose()
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBeUndefined()
    expect(theme.getTheme().active.tokens).toEqual({})
  })
})

describe('overlay source identity', () => {
  it('uses the documented Theme Studio source names', () => {
    expect(ACTIVE_SOURCE).toBe('@dsh-electron/dsh-theme-studio:active')
    expect(PREVIEW_SOURCE).toBe('@dsh-electron/dsh-theme-studio:preview')
  })
})
