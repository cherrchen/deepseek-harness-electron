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
  | 'launcher.title'
  | 'launcher.hint'
  | 'launcher.empty'
  | 'tabs.aria'
  | 'tab.open'
  | 'tab.close'

/** English dictionary. */
export const en: Record<DetailsToggleKey, string> = {
  'toggle.label': 'Toggle details panel',
  'toggle.hide': 'Hide details panel',
  'toggle.show': 'Show details panel',
  'launcher.title': 'Open a tab',
  'launcher.hint': 'Choose a panel to open in the details dock.',
  'launcher.empty': 'No panels are available. Plugins contribute panels here.',
  'tabs.aria': 'Details tabs',
  'tab.open': 'Open a tab',
  'tab.close': 'Close {label}',
}

/** Chinese dictionary. */
export const zh: Record<DetailsToggleKey, string> = {
  'toggle.label': '切换详情面板',
  'toggle.hide': '隐藏详情面板',
  'toggle.show': '显示详情面板',
  'launcher.title': '打开标签页',
  'launcher.hint': '选择要打开到详情栏的面板。',
  'launcher.empty': '暂无可用面板。插件可在此处贡献面板。',
  'tabs.aria': '详情标签页',
  'tab.open': '打开标签页',
  'tab.close': '关闭 {label}',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'shell-details-toggle': DetailsToggleKey
  }
}
