/** Electron-owned Installed tab for the upstream Plugins settings section. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import { PluginManagerTab, type PluginManagerTabInjected } from './PluginManagerTab.tsx'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Electron-owned plugin lifecycle management copy. */
    'settings.pluginManagerElectron': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by the Electron Plugin Manager. */
export const NS = 'settings.pluginManagerElectron'

/** Services required by the Settings contribution. */
export const inject = ['slots', 'locale', 'desktop']

/** Register the Installed view in the canonical upstream Plugins tab slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-manager-electron: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): PluginManagerTabInjected => ({
    plugins: ctx.desktop.plugins,
    dialog: ctx.desktop.dialog,
    app: ctx.desktop.app,
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'installed',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginManagerTab))
}
