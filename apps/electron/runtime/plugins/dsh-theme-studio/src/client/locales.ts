/** `settings.theme-studio` namespace dictionaries for the Themes row. */

export const NS = 'settings.theme-studio'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '主题',
  'description': '为应用选择一套主题。外观仍控制使用浅色、深色还是跟随系统。',
  'default.name': '默认',
  'default.description': '官方外观，不叠加 Theme Studio 覆盖层。',
  'graphite.name': 'Graphite',
  'graphite.description': '低饱和、中低对比，适合长时间编码。',
  'oled.name': 'OLED',
  'oled.description': '接近纯黑的背景，高可辨识前景。',
  'nordic.name': 'Nordic',
  'nordic.description': '冷色蓝灰背景，青蓝强调色。',
  'paper.name': 'Paper',
  'paper.description': '浅色纸张风格。',
  'warm.name': 'Warm',
  'warm.description': '暖色中性，降低蓝色刺激。',
  'preview': '预览',
  'apply': '应用',
  'cancel': '取消',
  'current': '当前',
  'previewing': '正在预览 {name}',
  'previewNamed': '预览 {name}',
  'applyNamed': '应用 {name}',
  'status.loading': '正在读取已保存的主题…',
  'status.unavailable': '此连接不会保存主题选择。',
} satisfies Record<string, string>

/** The settings.theme-studio namespace key union. */
export type ThemeStudioKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Themes',
  'description': 'Choose a theme for the application. Appearance controls whether Light, Dark or System palette is used.',
  'default.name': 'Default',
  'default.description': 'Official appearance with no Theme Studio overlay.',
  'graphite.name': 'Graphite',
  'graphite.description': 'Low-saturation, mid-contrast palette for long coding sessions.',
  'oled.name': 'OLED',
  'oled.description': 'Near-black backgrounds with high-legibility foregrounds.',
  'nordic.name': 'Nordic',
  'nordic.description': 'Cool blue-gray surfaces with a cyan-blue accent.',
  'paper.name': 'Paper',
  'paper.description': 'Warm paper-like surfaces for light reading and writing.',
  'warm.name': 'Warm',
  'warm.description': 'Warm neutrals that reduce blue light.',
  'preview': 'Preview',
  'apply': 'Apply',
  'cancel': 'Cancel',
  'current': 'Current',
  'previewing': 'Previewing {name}',
  'previewNamed': 'Preview {name}',
  'applyNamed': 'Apply {name}',
  'status.loading': 'Loading saved theme…',
  'status.unavailable': 'Theme selection is not saved on this connection.',
} satisfies Record<ThemeStudioKey, string>

/**
 * Replace `{name}` placeholders in a locale template.
 * @param template - Locale string with optional placeholders.
 * @param values - Placeholder values keyed by name.
 * @returns Interpolated string.
 */
export function formatLocale(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
}
