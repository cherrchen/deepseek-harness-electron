/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '已安装',
} satisfies Record<string, string>

/** Plugin Manager locale key union. */
export type PluginManagerLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Installed',
} satisfies Record<PluginManagerLocaleKey, string>
