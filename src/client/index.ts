/**
 * Theme Studio plugin, browser half: overlay runtime plus the General
 * Themes settings row. Presentation stays with `ctx.theme`.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { THEME_STUDIO_SETTINGS_NAMESPACE, type ThemeStudioSettings } from '../constants.ts'
import { BuiltinPresetRegistry } from './catalog.ts'
import { en, NS, zh, type ThemeStudioKey } from './locales.ts'
import { DEFAULT_PREVIEW } from './presets.ts'
import { ThemeStudioRuntime } from './runtime.ts'
import { createThemeStudioRowStore, type ThemeStudioCard } from './store.ts'
import { ThemeStudioRow, type ThemeStudioRowInjected } from './ThemeStudioRow.tsx'

export { ThemeStudioRuntime } from './runtime.ts'
export type { ThemeStudioSnapshot, ThemeOverrideSurface } from './runtime.ts'
export { presetToOverrides, PresetAdapterError } from './adapter.ts'
export { BuiltinPresetRegistry } from './catalog.ts'
export { BUILTIN_PRESETS, DEFAULT_PREVIEW } from './presets.ts'
export { createThemeStudioRowStore } from './store.ts'
export type { ThemeStudioCard, ThemeStudioRowState } from './store.ts'
export type { BuiltinThemePreset, ThemeCatalog, ThemePreview } from './types.ts'
export { NS as SETTINGS_NS } from './locales.ts'
export type { ThemeStudioKey } from './locales.ts'
export { ACTIVE_SOURCE, PREVIEW_SOURCE, THEME_STUDIO_SETTINGS_NAMESPACE } from '../constants.ts'
export type { ThemeStudioSettings } from '../constants.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Themes settings row's copy. */
    'settings.theme-studio': ThemeStudioKey
  }
}

/** Required services: ThemeRuntime overlays, settings transport, slots, locale. */
export const inject = ['theme', 'settingsScope', 'slots', 'locale', 'connection', 'remote']

function cardsOf(catalog: BuiltinPresetRegistry): ThemeStudioCard[] {
  return [
    {
      id: null,
      nameKey: 'default.name',
      descriptionKey: 'default.description',
      preview: DEFAULT_PREVIEW,
    },
    ...catalog.list().map((preset) => ({
      id: preset.id,
      nameKey: nameKeyOf(preset.id),
      descriptionKey: descriptionKeyOf(preset.id),
      preview: preset.preview,
    })),
  ]
}

function nameKeyOf(id: string): string {
  const short = id.replace(/^dsh-theme-studio\./, '')
  return `${short}.name`
}

function descriptionKeyOf(id: string): string {
  const short = id.replace(/^dsh-theme-studio\./, '')
  return `${short}.description`
}

/**
 * Client plugin body: restore the durable overlay, then register the Themes row.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const catalog = new BuiltinPresetRegistry()
  const host = ctx.settingsScope.bind<ThemeStudioSettings>({ namespace: THEME_STUDIO_SETTINGS_NAMESPACE })
  const runtime = new ThemeStudioRuntime({ theme: ctx.theme, host, catalog })
  ctx.effect(() => () => { runtime.dispose() }, 'theme-studio: runtime')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'theme-studio: settings row dictionaries')

  const store = createThemeStudioRowStore(cardsOf(catalog))
  let bound: BoundActions<typeof store> | undefined
  const sync = (): void => {
    bound?.sync(runtime.getSnapshot())
  }
  ctx.effect(() => runtime.subscribe(sync), 'theme-studio: store projection')
  const injected = (actions: BoundActions<typeof store>): ThemeStudioRowInjected => {
    bound = actions
    sync()
    return {
      previewTheme: (id) => { runtime.previewTheme(id) },
      activateTheme: (id) => {
        if (id === null) runtime.restoreDefault()
        else runtime.activateTheme(id)
      },
      cancelPreview: () => { runtime.cancelPreview() },
      applyPreview: () => { runtime.applyPreview() },
    }
  }
  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'themes',
    order: 20,
    store,
    locale: NS,
    inject: injected,
  }, ThemeStudioRow)), 'theme-studio: themes row')
}
