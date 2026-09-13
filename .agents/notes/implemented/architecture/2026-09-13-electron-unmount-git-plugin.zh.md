# Agent Note: Electron 不组合基于 Details 的 Git Client

Status: implemented

[English](2026-09-13-electron-unmount-git-plugin.md) | 中文

## Problem

占用 `ctx.shellDetails` 与 Client `details` 插槽的 Git Client 无法在上游 `dsh-v0.1.5-rc.2` 上加载，因为该插槽已被移除。把这样的 Client 写入 `dshElectron.ecosystemPlugins` 会让 Client typecheck 与 Host 加载失败。

## Decision

Desktop 不组合基于 Details 的 Git Client。进入组合的是 Sidebar 移植（[组合说明](2026-09-13-electron-plugin-manager-and-git-sidebar.zh.md)）。

私有分叉 `details` 插槽，或把基于 Details 的源码留在 host/client 聚合中，仍然被拒绝。

## Alternatives considered

**继续组合基于 Details 的 Git Client 并私有分叉 `details` 插槽。** 拒绝：上游 Client 已没有该插槽，私有分叉会与本次 pin 冲突。

**删除 `packages/dsh-electron/dsh-plugin-git`。** 拒绝：subtree 身份与 Sidebar 移植仍需要这棵树。

**让基于 Details 的 Git 源码留在 host/client 聚合中。** 拒绝：引用 `details` 的 Client 源码会让 `pnpm run build` 失败。

## Consequences

依赖 Details Host 的 Git UI 不可用。仓库控件走 `ctx.sidebarRight`。Overlay 测试仍禁止 `@dsh-electron/dsh-plugin-git` 出现在 `host.patch.yml` 中，因为生态组合走生成的 include 文件。
