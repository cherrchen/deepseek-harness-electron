/** Localized copy owned by the Git client experience. */

export const NS = 'git'

export const en = {
  'branch.label': 'Branches',
  'branch.create': 'Create new branch',
  'branch.createDialogTitle': 'Create branch',
  'branch.createTitle': 'New branch name',
  'branch.createAction': 'Create',
  'branch.cancel': 'Cancel',
  'branch.loading': '…',
  'branch.detached': 'HEAD@{hash}',
  'branch.unbornHint': 'No commits yet — the default branch exists after the first commit.',
  'branch.unbornCreate': 'Create a branch after the first commit. An empty repository has no commit for Git to branch from.',
  'branch.createFailed': 'Could not create the branch.',
  'changes.indicator': '{count} changes',
  'changes.indicatorCompact': '{count}',
  'details.tabs': 'Git details',
  'details.refresh': 'Refresh',
  'details.reveal': 'Reveal',
  'details.noWorkspace': 'Open a workspace to inspect its Git repository.',
  'details.notRepository': 'This workspace is not a Git repository.',
  'details.loading': 'Reading repository…',
  'details.clean': 'Working tree clean',
  'details.tab.changes': 'Changes',
  'details.tab.diff': 'Diff',
  'details.tab.commit': 'Commit',
  'details.staged': 'Staged Changes',
  'details.unstaged': 'Changes',
  'details.untracked': 'Untracked',
  'details.diff': 'Diff',
  'details.noDiff': 'Select a changed file to inspect its diff.',
  'details.noChangesDiff': 'No changes to compare.',
  'details.untrackedDiff': 'No Git diff available for an untracked file. Stage the file to inspect its staged diff.',
  'details.workingTree': 'Working Tree',
  'details.stagedLabel': 'Staged',
  'details.stage': 'Stage',
  'details.unstage': 'Unstage',
  'details.stageAll': 'Stage All',
  'details.unstageAll': 'Unstage All',
  'details.commitPlaceholder': 'Commit message',
  'details.commit': 'Commit',
  'details.stagedCount': '{count} staged files',
} as const

export const zh: Record<keyof typeof en, string> = {
  'branch.label': '分支',
  'branch.create': '创建新分支',
  'branch.createDialogTitle': '创建分支',
  'branch.createTitle': '新分支名称',
  'branch.createAction': '创建',
  'branch.cancel': '取消',
  'branch.loading': '…',
  'branch.detached': 'HEAD@{hash}',
  'branch.unbornHint': '尚无提交 — 默认分支会在首次提交后出现。',
  'branch.unbornCreate': '请先完成首次提交后再创建分支。空仓库还没有可供 Git 分叉的提交。',
  'branch.createFailed': '无法创建分支。',
  'changes.indicator': '{count} 处更改',
  'changes.indicatorCompact': '{count}',
  'details.tabs': 'Git 详情',
  'details.refresh': '刷新',
  'details.reveal': '在文件管理器中显示',
  'details.noWorkspace': '请先打开一个工作区以检查其 Git 仓库。',
  'details.notRepository': '当前工作区不是 Git 仓库。',
  'details.loading': '正在读取仓库…',
  'details.clean': '工作树无改动',
  'details.tab.changes': '更改',
  'details.tab.diff': '差异',
  'details.tab.commit': '提交',
  'details.staged': '已暂存的更改',
  'details.unstaged': '更改',
  'details.untracked': '未跟踪',
  'details.diff': '差异',
  'details.noDiff': '选择一个改动文件以查看差异。',
  'details.noChangesDiff': '没有可比较的更改。',
  'details.untrackedDiff': '未跟踪文件没有 Git 差异。暂存该文件后可查看其暂存差异。',
  'details.workingTree': '工作树',
  'details.stagedLabel': '已暂存',
  'details.stage': '暂存',
  'details.unstage': '取消暂存',
  'details.stageAll': '全部暂存',
  'details.unstageAll': '全部取消暂存',
  'details.commitPlaceholder': '提交信息',
  'details.commit': '提交',
  'details.stagedCount': '{count} 个已暂存文件',
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
