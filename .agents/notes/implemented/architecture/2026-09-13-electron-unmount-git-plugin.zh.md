# Agent Note: Electron 在 0.1.5-rc.2 pin 中卸载 Git

Status: implemented

[English](2026-09-13-electron-unmount-git-plugin.md) | 中文

## Problem

`@dsh-electron/dsh-plugin-git` 占用 `ctx.shellDetails` 与 Client `details` 插槽。上游 `dsh-v0.1.5-rc.2` 已移除该插槽。即使包仍在 workspace 中，只要把它写进 `dshElectron.ecosystemPlugins`，Client typecheck 与 Host 加载都会失败。

## Decision

Desktop 不组合 Git。`apps/electron/package.json` 将 `dshElectron.ecosystemPlugins` 保持为 `[]`。因此 `sync-version` 会从 Electron production 依赖中去掉 `@dsh-electron/dsh-plugin-git`。

该包仍作为 workspace 成员留在 `packages/dsh-electron/dsh-plugin-git`，供 subtree 维护。Host 与 Client 聚合排除 `packages/dsh-electron/**`，这样仓库 `tsc` 不会用已移除的插槽去检查未组合的 Client。

重新引入是后续改动：先把 Client 接到 `ctx.sidebarRight` / `sidebarRightTabs`，再把包名写回 `dshElectron.ecosystemPlugins`。本次 pin 不做该移植。

Hot-plug 与打包仍把 `ecosystemPlugins` 当作组合列表；空列表有效。Fixture 测试仍可用 Git 包名作为假 roster 条目。

## Alternatives considered

**在同一次 pin 中把 Git 接到 Sidebar。** 拒绝：本次要求是停止组合 Git，而不是用 Sidebar 替换 Details。

**继续组合 Git 并私有分叉 `details` 插槽。** 拒绝：上游 Client 已没有该插槽，私有分叉会与本次 pin 冲突。

**删除 `packages/dsh-electron/dsh-plugin-git`。** 拒绝：subtree 身份与后续 Sidebar 工作仍需要这棵树。

**让 Git 源码留在 host/client 聚合中。** 拒绝：未组合的 Client 源码引用 `details` 时，`pnpm run build` 会失败。

## Consequences

Desktop 启动时没有 Git UI。需要仓库控件的用户必须等待 Sidebar 移植，或在仍提供 Details 的 host 上单独安装该插件。

`requiredDesktopWorkspaceDependencies()` 只保留已声明的生态插件名称；空列表不是打包缺陷。聚焦的 Electron 测试固定发现结果中不包含 Git，并允许空的 `ecosystemPlugins` 数组。
