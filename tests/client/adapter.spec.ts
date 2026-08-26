import { describe, expect, it } from 'vitest'
import { presetToOverrides, PresetAdapterError } from '../../src/client/adapter.ts'
import { BUILTIN_PRESETS } from '../../src/client/presets.ts'

const GRAPHITE = BUILTIN_PRESETS.find(preset => preset.id === 'dsh-theme-studio.graphite')!

describe('presetToOverrides', () => {
  it('converts matching light and dark palettes into ThemeTokenOverrides', () => {
    const overrides = presetToOverrides({
      tokens: {
        light: { '--dsw-alias-bg-base': '#ffffff', '--dsw-alias-label-primary': '#111111' },
        dark: { '--dsw-alias-bg-base': '#111111', '--dsw-alias-label-primary': '#eeeeee' },
      },
    })
    expect(overrides).toEqual({
      '--dsw-alias-bg-base': { light: '#ffffff', dark: '#111111' },
      '--dsw-alias-label-primary': { light: '#111111', dark: '#eeeeee' },
    })
  })

  it('converts every builtin preset', () => {
    for (const preset of BUILTIN_PRESETS) {
      const overrides = presetToOverrides(preset)
      expect(Object.keys(overrides).sort()).toEqual(Object.keys(preset.tokens.light).sort())
    }
  })

  it('rejects a token that exists only in light', () => {
    expect(() => presetToOverrides({
      tokens: {
        light: { '--dsw-alias-bg-base': '#fff', '--orphan': '#000' },
        dark: { '--dsw-alias-bg-base': '#111' },
      },
    })).toThrow(PresetAdapterError)
  })

  it('rejects a token that exists only in dark', () => {
    expect(() => presetToOverrides({
      tokens: {
        light: { '--dsw-alias-bg-base': '#fff' },
        dark: { '--dsw-alias-bg-base': '#111', '--orphan': '#000' },
      },
    })).toThrow(/dark value but no light/)
  })

  it('rejects a non-string token value', () => {
    expect(() => presetToOverrides({
      tokens: {
        light: { '--dsw-alias-bg-base': 1 as never },
        dark: { '--dsw-alias-bg-base': '#111' },
      },
    })).toThrow(/must be strings/)
  })

  it('does not mutate the source preset when the result is changed', () => {
    const before = GRAPHITE.tokens.light['--dsw-alias-bg-base']
    const overrides = presetToOverrides(GRAPHITE)
    overrides['--dsw-alias-bg-base']!.light = '#ff00ff'
    expect(GRAPHITE.tokens.light['--dsw-alias-bg-base']).toBe(before)
  })
})
