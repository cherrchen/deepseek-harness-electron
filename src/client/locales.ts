/**
 * Locale dictionaries for the Details Toggle header entry.
 * Registered under {@link SHELL_DETAILS_LOCALE_NS} at plugin mount.
 */
export const NS = 'shell-details-toggle' as const

/** Dictionary keys of the Details Toggle namespace. */
export type DetailsToggleKey =
  | 'toggle.label'
  | 'toggle.hide'
  | 'toggle.show'

/** English dictionary. */
export const en: Record<DetailsToggleKey, string> = {
  'toggle.label': 'Toggle details panel',
  'toggle.hide': 'Hide details panel',
  'toggle.show': 'Show details panel',
}

/** Chinese dictionary. */
export const zh: Record<DetailsToggleKey, string> = {
  'toggle.label': '切换详情面板',
  'toggle.hide': '隐藏详情面板',
  'toggle.show': '显示详情面板',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'shell-details-toggle': DetailsToggleKey
  }
}
