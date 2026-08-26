/** Compiled Stage 1 builtin themes. Default is the absence of an overlay. */

import type { BuiltinThemePreset, ThemePreview, ThemeTokenPalette } from './types.ts'

interface Palette {
  bgBase: string
  bgLayer1: string
  bgLayer2: string
  bgOverlay: string
  borderL1: string
  borderL2: string
  brand: string
  labelPrimary: string
  labelSecondary: string
  error: string
  success: string
  warn: string
  sidebar: string
}

function tokens(palette: Palette): ThemeTokenPalette {
  return {
    '--dsw-alias-bg-base': palette.bgBase,
    '--dsw-alias-bg-layer-1': palette.bgLayer1,
    '--dsw-alias-bg-layer-2': palette.bgLayer2,
    '--dsw-alias-bg-overlay': palette.bgOverlay,
    '--dsw-alias-border-l1': palette.borderL1,
    '--dsw-alias-border-l2': palette.borderL2,
    '--dsw-alias-brand-primary': palette.brand,
    '--dsw-alias-label-primary': palette.labelPrimary,
    '--dsw-alias-label-secondary': palette.labelSecondary,
    '--dsw-alias-state-error-primary': palette.error,
    '--dsw-alias-state-success-primary': palette.success,
    '--dsw-alias-state-warn-primary': palette.warn,
    '--dsw-specific-sidebar-fill': palette.sidebar,
  }
}

function previewOf(palette: Palette): ThemePreview {
  return {
    background: palette.bgBase,
    surface: palette.bgLayer1,
    foreground: palette.labelPrimary,
    accent: palette.brand,
  }
}

function preset(
  id: string,
  name: string,
  description: string,
  light: Palette,
  dark: Palette,
): BuiltinThemePreset {
  return Object.freeze({
    id,
    name,
    description,
    tokens: Object.freeze({
      light: Object.freeze(tokens(light)),
      dark: Object.freeze(tokens(dark)),
    }),
    preview: Object.freeze({
      light: Object.freeze(previewOf(light)),
      dark: Object.freeze(previewOf(dark)),
    }),
  })
}

const GRAPHITE_LIGHT: Palette = {
  bgBase: '#e8eaed',
  bgLayer1: '#f4f5f6',
  bgLayer2: '#dde0e4',
  bgOverlay: '#f7f8f9',
  borderL1: 'rgba(44, 48, 54, 0.08)',
  borderL2: 'rgba(44, 48, 54, 0.16)',
  brand: '#5b6570',
  labelPrimary: '#2c3036',
  labelSecondary: '#5c6570',
  error: '#b42318',
  success: '#067647',
  warn: '#b54708',
  sidebar: '#dfe2e6',
}

const GRAPHITE_DARK: Palette = {
  bgBase: '#1c1e22',
  bgLayer1: '#25282c',
  bgLayer2: '#2e3238',
  bgOverlay: '#32363c',
  borderL1: 'rgba(213, 216, 220, 0.08)',
  borderL2: 'rgba(213, 216, 220, 0.16)',
  brand: '#8b949e',
  labelPrimary: '#d5d8dc',
  labelSecondary: '#9aa1a9',
  error: '#f97066',
  success: '#47cd89',
  warn: '#fdb022',
  sidebar: '#16181b',
}

const OLED_LIGHT: Palette = {
  bgBase: '#f7f7f7',
  bgLayer1: '#ffffff',
  bgLayer2: '#ececec',
  bgOverlay: '#ffffff',
  borderL1: 'rgba(0, 0, 0, 0.08)',
  borderL2: 'rgba(0, 0, 0, 0.16)',
  brand: '#155eef',
  labelPrimary: '#111111',
  labelSecondary: '#4d4d4d',
  error: '#d92d20',
  success: '#079455',
  warn: '#dc6803',
  sidebar: '#efefef',
}

const OLED_DARK: Palette = {
  bgBase: '#000000',
  bgLayer1: '#0a0a0a',
  bgLayer2: '#141414',
  bgOverlay: '#1a1a1a',
  borderL1: 'rgba(255, 255, 255, 0.08)',
  borderL2: 'rgba(255, 255, 255, 0.18)',
  brand: '#84adff',
  labelPrimary: '#f2f2f2',
  labelSecondary: '#b3b3b3',
  error: '#f97066',
  success: '#3ccb7f',
  warn: '#fdb022',
  sidebar: '#000000',
}

const NORDIC_LIGHT: Palette = {
  bgBase: '#eceff4',
  bgLayer1: '#e5e9f0',
  bgLayer2: '#d8dee9',
  bgOverlay: '#eceff4',
  borderL1: 'rgba(46, 52, 64, 0.08)',
  borderL2: 'rgba(46, 52, 64, 0.16)',
  brand: '#5e81ac',
  labelPrimary: '#2e3440',
  labelSecondary: '#4c566a',
  error: '#bf616a',
  success: '#a3be8c',
  warn: '#d08770',
  sidebar: '#e5e9f0',
}

const NORDIC_DARK: Palette = {
  bgBase: '#2e3440',
  bgLayer1: '#3b4252',
  bgLayer2: '#434c5e',
  bgOverlay: '#4c566a',
  borderL1: 'rgba(236, 239, 244, 0.08)',
  borderL2: 'rgba(236, 239, 244, 0.16)',
  brand: '#88c0d0',
  labelPrimary: '#eceff4',
  labelSecondary: '#d8dee9',
  error: '#bf616a',
  success: '#a3be8c',
  warn: '#ebcb8b',
  sidebar: '#2e3440',
}

const PAPER_LIGHT: Palette = {
  bgBase: '#f6f1e7',
  bgLayer1: '#efe8d8',
  bgLayer2: '#e4d9c4',
  bgOverlay: '#fbf6ec',
  borderL1: 'rgba(63, 58, 50, 0.08)',
  borderL2: 'rgba(63, 58, 50, 0.16)',
  brand: '#8c5a3c',
  labelPrimary: '#3f3a32',
  labelSecondary: '#6b6256',
  error: '#b42318',
  success: '#3b7d4a',
  warn: '#b54708',
  sidebar: '#efe8d8',
}

const PAPER_DARK: Palette = {
  bgBase: '#1c1915',
  bgLayer1: '#26221c',
  bgLayer2: '#322c24',
  bgOverlay: '#3a332a',
  borderL1: 'rgba(237, 230, 216, 0.08)',
  borderL2: 'rgba(237, 230, 216, 0.16)',
  brand: '#d4a574',
  labelPrimary: '#ede6d8',
  labelSecondary: '#c4b8a4',
  error: '#f97066',
  success: '#75b798',
  warn: '#fdb022',
  sidebar: '#17140f',
}

const WARM_LIGHT: Palette = {
  bgBase: '#f7f0e8',
  bgLayer1: '#efe6da',
  bgLayer2: '#e4d6c6',
  bgOverlay: '#fbf4ec',
  borderL1: 'rgba(58, 50, 41, 0.08)',
  borderL2: 'rgba(58, 50, 41, 0.16)',
  brand: '#c4784a',
  labelPrimary: '#3a3229',
  labelSecondary: '#6b5d4e',
  error: '#b42318',
  success: '#3b7d4a',
  warn: '#b54708',
  sidebar: '#efe6da',
}

const WARM_DARK: Palette = {
  bgBase: '#1f1a16',
  bgLayer1: '#2a241f',
  bgLayer2: '#352d26',
  bgOverlay: '#3d342c',
  borderL1: 'rgba(240, 230, 218, 0.08)',
  borderL2: 'rgba(240, 230, 218, 0.16)',
  brand: '#e0a070',
  labelPrimary: '#f0e6da',
  labelSecondary: '#c9b7a4',
  error: '#f97066',
  success: '#75b798',
  warn: '#fdb022',
  sidebar: '#191511',
}

/** Builtin overlays in Settings card order. Default is not a member. */
export const BUILTIN_PRESETS: readonly BuiltinThemePreset[] = Object.freeze([
  preset(
    'dsh-theme-studio.graphite',
    'Graphite',
    'Low-saturation, mid-contrast palette for long coding sessions.',
    GRAPHITE_LIGHT,
    GRAPHITE_DARK,
  ),
  preset(
    'dsh-theme-studio.oled',
    'OLED',
    'Near-black backgrounds with high-legibility foregrounds.',
    OLED_LIGHT,
    OLED_DARK,
  ),
  preset(
    'dsh-theme-studio.nordic',
    'Nordic',
    'Cool blue-gray surfaces with a cyan-blue accent.',
    NORDIC_LIGHT,
    NORDIC_DARK,
  ),
  preset(
    'dsh-theme-studio.paper',
    'Paper',
    'Warm paper-like surfaces for light reading and writing.',
    PAPER_LIGHT,
    PAPER_DARK,
  ),
  preset(
    'dsh-theme-studio.warm',
    'Warm',
    'Warm neutrals that reduce blue light.',
    WARM_LIGHT,
    WARM_DARK,
  ),
])

/** Official-theme mosaic for the Default card; not applied as an overlay. */
export const DEFAULT_PREVIEW: { light: ThemePreview; dark: ThemePreview } = Object.freeze({
  light: Object.freeze({
    background: '#ffffff',
    surface: '#f5f6f7',
    foreground: '#1f1f1f',
    accent: '#111111',
  }),
  dark: Object.freeze({
    background: '#151517',
    surface: '#232324',
    foreground: '#f1f3f5',
    accent: '#f1f3f5',
  }),
})
