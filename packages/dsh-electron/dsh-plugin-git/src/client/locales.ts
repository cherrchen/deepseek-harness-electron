/** Localized copy owned by the Git client experience. */

export const NS = 'git'

export const en = {
  'action.open': 'Source control',
  'panel.title': 'Source control',
  'panel.close': 'Close source control',
  'panel.noWorkspace': 'Open a workspace to inspect its Git repository.',
  'panel.notRepository': 'The current workspace is not inside a Git repository.',
  'panel.loading': 'Reading repository…',
  'panel.refresh': 'Refresh',
  'panel.reveal': 'Reveal repository',
  'panel.clean': 'Working tree clean',
  'panel.staged': 'Staged changes',
  'panel.unstaged': 'Working tree changes',
  'panel.untracked': 'Untracked files',
  'panel.diff': 'Diff',
  'panel.noDiff': 'Select a changed file to inspect its diff.',
  'panel.stage': 'Stage',
  'panel.unstage': 'Unstage',
  'panel.stageAll': 'Stage all',
  'panel.unstageAll': 'Unstage all',
  'panel.commitPlaceholder': 'Commit message',
  'panel.commit': 'Commit staged changes',
  'panel.branch': 'Branch',
  'panel.switch': 'Switch',
  'panel.createBranchPlaceholder': 'New branch name',
  'panel.createBranch': 'Create branch',
} as const

export const zh: Record<keyof typeof en, string> = {
  'action.open': '源代码管理',
  'panel.title': '源代码管理',
  'panel.close': '关闭源代码管理',
  'panel.noWorkspace': '请先打开一个工作区以检查其 Git 仓库。',
  'panel.notRepository': '当前工作区不在 Git 仓库中。',
  'panel.loading': '正在读取仓库…',
  'panel.refresh': '刷新',
  'panel.reveal': '在文件管理器中显示',
  'panel.clean': '工作树无改动',
  'panel.staged': '已暂存的更改',
  'panel.unstaged': '工作树更改',
  'panel.untracked': '未跟踪文件',
  'panel.diff': '差异',
  'panel.noDiff': '选择一个改动文件以查看差异。',
  'panel.stage': '暂存',
  'panel.unstage': '取消暂存',
  'panel.stageAll': '全部暂存',
  'panel.unstageAll': '全部取消暂存',
  'panel.commitPlaceholder': '提交信息',
  'panel.commit': '提交已暂存的更改',
  'panel.branch': '分支',
  'panel.switch': '切换',
  'panel.createBranchPlaceholder': '新分支名称',
  'panel.createBranch': '创建分支',
}

export type GitLocaleKey = keyof typeof en
