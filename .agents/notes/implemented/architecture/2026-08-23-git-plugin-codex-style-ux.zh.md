# Agent Note: Git Plugin Codex 风格 UX

Status: implemented

[English](2026-08-23-git-plugin-codex-style-ux.md) | 中文

Branch 选择属于 Composer，因为 branch 是 agent 工作上下文的一部分，而不是独立 app 入口。Changes、diff、commit 放在右侧 Git drawer，因为它们是当前上下文的检查与变更工具。

## Slot 选择

- `conversation.input.left` 承载 `GitBranchControl`（branch 菜单 + changed-files indicator）。
- `shell.overlay` 承载非 modal 的右侧 `GitDrawer`。
- 插件不再注册 `sidebar.footer.action`，也不再依赖 `dsh-client-ui-sidebar`。
- 插件不占用 `details`；该 slot 仍由 `ui-conversation` 的 tool-call details 持有。

## Controller 生命周期

Repository discovery 在 workspace path 变化时运行，与 drawer 是否打开无关。关闭 drawer 不会清除 repository state。Async discover/status 使用单调递增 generation counter，避免 stale response 覆盖较新的 workspace。

## Desktop 仍为 optional

Portable client fiber 注册 composer control 与 drawer。Native reveal 与 commit notification 仍在 child `ctx.inject(['desktop'], ...)` fiber 中。

## 本次变更范围外

Remote branches、fetch/pull/push、GitHub integration、stash 与 merge/rebase UI 仍属 deferred work。
