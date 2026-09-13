/** Typed English and Chinese copy owned by the Electron Main process. */

export const en = {
  recoveryTitle: 'DeepSeek Harness could not start',
  recoveryPending: 'Desktop found an interrupted plugin change and could not repair it automatically.',
  recoveryLock: 'Another Desktop plugin change is still running. Wait for it to finish, or repair plugin state.',
  recoveryProfile: 'The web profile plugin list could not be read.',
  recoveryHost: 'The local Harness process did not become ready in time. A plugin may be blocking startup.',
  recoveryInstruction: 'You can disable every manageable plugin and retry, or reset Desktop plugin management without deleting installed packages.',
  recoveryDetails: 'Technical details',
  disableAll: 'Disable all plugins and restart',
  resetManagement: 'Reset plugin management',
  recoveryFailed: 'The repair did not start Harness. Try the other action, or quit and inspect the web profile.',
} as const

/** Every Main locale supplies the complete English key set. */
export type DesktopMainMessages = { readonly [Key in keyof typeof en]: string }

export const zh = {
  recoveryTitle: 'DeepSeek Harness 无法启动',
  recoveryPending: 'Desktop 发现一次中断的插件变更，且无法自动对账。',
  recoveryLock: '另一次 Desktop 插件变更仍在进行。请等待其结束，或修复插件状态。',
  recoveryProfile: '无法读取 web profile 的插件列表。',
  recoveryHost: '本地 Harness 进程未在时限内就绪。某个插件可能阻塞了启动。',
  recoveryInstruction: '你可以禁用全部可管理插件后重试，或重置 Desktop 插件管理（不会删除已安装的 package）。',
  recoveryDetails: '技术详情',
  disableAll: '禁用所有插件并重启',
  resetManagement: '重置插件管理',
  recoveryFailed: '修复未能启动 Harness。请尝试另一项操作，或退出后检查 web profile。',
} as const satisfies DesktopMainMessages

/** Locale payload used by Main-owned windows and dialogs. */
export interface DesktopMainLocale {
  readonly id: 'en' | 'zh-CN'
  readonly messages: DesktopMainMessages
}

/**
 * Resolve Electron's locale to one shipped Main dictionary.
 * @param locale - `app.getLocale()` value.
 * @returns English or Chinese dictionary.
 */
export function resolveDesktopMainLocale(locale: string): DesktopMainLocale {
  return locale.toLowerCase().startsWith('zh')
    ? { id: 'zh-CN', messages: zh }
    : { id: 'en', messages: en }
}
