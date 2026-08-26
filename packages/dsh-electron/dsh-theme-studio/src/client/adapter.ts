/** Convert a builtin palette pair into ThemeRuntime override layers. */

import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { BuiltinThemePreset } from './types.ts'

/** Thrown when a palette pair cannot become a ThemeRuntime overlay. */
export class PresetAdapterError extends Error {
  /**
   * @param message - why the conversion was rejected.
   */
  constructor(message: string) {
    super(message)
    this.name = 'PresetAdapterError'
  }
}

/**
 * Convert `{ light, dark }` palettes into `{ [token]: { light, dark } }`.
 * Rejects missing counterpart keys and non-string values. Does not mutate
 * `preset`.
 * @param preset - compiled theme whose `tokens` hold per-scheme maps.
 * @returns ThemeRuntime overlay dictionary.
 */
export function presetToOverrides(preset: Pick<BuiltinThemePreset, 'tokens'>): ThemeTokenOverrides {
  const light = preset.tokens.light
  const dark = preset.tokens.dark
  const lightKeys = Object.keys(light)
  const darkKeys = Object.keys(dark)
  const lightSet = new Set(lightKeys)
  const darkSet = new Set(darkKeys)
  for (const key of lightKeys) {
    if (!darkSet.has(key)) {
      throw new PresetAdapterError(`token ${JSON.stringify(key)} has a light value but no dark value`)
    }
  }
  for (const key of darkKeys) {
    if (!lightSet.has(key)) {
      throw new PresetAdapterError(`token ${JSON.stringify(key)} has a dark value but no light value`)
    }
  }
  const overrides: ThemeTokenOverrides = {}
  for (const key of lightKeys) {
    const lightValue = light[key]
    const darkValue = dark[key]
    if (typeof lightValue !== 'string' || typeof darkValue !== 'string') {
      throw new PresetAdapterError(`token ${JSON.stringify(key)} values must be strings`)
    }
    overrides[key] = { light: lightValue, dark: darkValue }
  }
  return overrides
}
