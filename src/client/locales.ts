/** Localized copy owned by the Git client experience. */

export const NS = 'git'

export const en = {
  'branch.label': 'Branches',
  'branch.create': 'Create new branch',
  'branch.createTitle': 'New branch name',
  'branch.createAction': 'Create',
  'branch.cancel': 'Cancel',
  'branch.loading': '…',
  'branch.detached': 'HEAD@{hash}',
  'changes.indicator': '{count} changes',
  'changes.indicatorCompact': '{count}',
  'drawer.title': 'Git',
  'drawer.close': 'Close Git drawer',
  'drawer.refresh': 'Refresh',
  'drawer.reveal': 'Reveal',
  'drawer.noWorkspace': 'Open a workspace to inspect its Git repository.',
  'drawer.notRepository': 'This workspace is not a Git repository.',
  'drawer.loading': 'Reading repository…',
  'drawer.clean': 'Working tree clean',
  'drawer.tab.changes': 'Changes',
  'drawer.tab.diff': 'Diff',
  'drawer.tab.commit': 'Commit',
  'drawer.staged': 'Staged Changes',
  'drawer.unstaged': 'Changes',
  'drawer.untracked': 'Untracked',
  'drawer.diff': 'Diff',
  'drawer.noDiff': 'Select a changed file to inspect its diff.',
  'drawer.noChangesDiff': 'No changes to compare.',
  'drawer.untrackedDiff': 'No Git diff available for an untracked file. Stage the file to inspect its staged diff.',
  'drawer.workingTree': 'Working Tree',
  'drawer.stagedLabel': 'Staged',
  'drawer.stage': 'Stage',
  'drawer.unstage': 'Unstage',
  'drawer.stageAll': 'Stage All',
  'drawer.unstageAll': 'Unstage All',
  'drawer.commitPlaceholder': 'Commit message',
  'drawer.commit': 'Commit',
  'drawer.stagedCount': '{count} staged files',
} as const

export const zh: Record<keyof typeof en, string> = {
  'branch.label': '分支',
  'branch.create': '创建新分支',
  'branch.createTitle': '新分支名称',
  'branch.createAction': '创建',
  'branch.cancel': '取消',
  'branch.loading': '…',
  'branch.detached': 'HEAD@{hash}',
  'changes.indicator': '{count} 处更改',
  'changes.indicatorCompact': '{count}',
  'drawer.title': 'Git',
  'drawer.close': '关闭 Git 抽屉',
  'drawer.refresh': '刷新',
  'drawer.reveal': '在文件管理器中显示',
  'drawer.noWorkspace': '请先打开一个工作区以检查其 Git 仓库。',
  'drawer.notRepository': '当前工作区不是 Git 仓库。',
  'drawer.loading': '正在读取仓库…',
  'drawer.clean': '工作树无改动',
  'drawer.tab.changes': '更改',
  'drawer.tab.diff': '差异',
  'drawer.tab.commit': '提交',
  'drawer.staged': '已暂存的更改',
  'drawer.unstaged': '更改',
  'drawer.untracked': '未跟踪',
  'drawer.diff': '差异',
  'drawer.noDiff': '选择一个改动文件以查看差异。',
  'drawer.noChangesDiff': '没有可比较的更改。',
  'drawer.untrackedDiff': '未跟踪文件没有 Git 差异。暂存该文件后可查看其暂存差异。',
  'drawer.workingTree': '工作树',
  'drawer.stagedLabel': '已暂存',
  'drawer.stage': '暂存',
  'drawer.unstage': '取消暂存',
  'drawer.stageAll': '全部暂存',
  'drawer.unstageAll': '全部取消暂存',
  'drawer.commitPlaceholder': '提交信息',
  'drawer.commit': '提交',
  'drawer.stagedCount': '{count} 个已暂存文件',
}

export type GitLocaleKey = keyof typeof en

/**
 * Replace `{name}` placeholders in a locale template.
 * @param template - Locale string with optional placeholders.
 * @param values - Placeholder values keyed by name.
 * @returns Interpolated string.
 */
export function formatLocale(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
}
