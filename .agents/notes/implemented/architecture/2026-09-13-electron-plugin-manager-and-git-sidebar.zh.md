# Agent Note: Electron 重挂 Plugin Manager，并通过 sidebarRight 组合 Git

Status: implemented

[English](2026-09-13-electron-plugin-manager-and-git-sidebar.md) | 中文

## Problem

0.1.5-rc.2 pin 让 Plugin Manager 与 Git 都不进入组合，因为 Git 占用了已被移除的 Client `details` 插槽（[Git 卸载](2026-09-13-electron-unmount-git-plugin.zh.md)）。`settings.plugins.tab` 仍然存在，因此 Installed tab 可以在不挂 Details Host 的情况下重挂。Git 需要 Sidebar 移植后才能回到 `dshElectron.ecosystemPlugins`。

## Decision

`apps/electron/runtime/host.patch.yml` 插入 `@dsh-electron/dsh-electron-ui-plugin-manager`。

`@dsh-electron/dsh-plugin-git@0.2.1` 注入 `sidebarRight` / `sidebarRightTabs`，运行时不依赖 `details`、`shellDetails` 或 `@dsh-electron/dsh-client-ui-details-host`。Desktop 把该 package 列入 `dshElectron.ecosystemPlugins`，并按照 [npm-only ecosystem plugin 规则](2026-09-14-electron-npm-only-ecosystem-plugins.zh.md)保留其精确版本 production npm 依赖。

## Alternatives considered

**重挂 Details Host 以便加载旧的 Git Client。** 拒绝：上游仍然没有 `details` 插槽。

**Sidebar 移植落地后只重挂 Plugin Manager，继续不组合 Git。** 拒绝：该移植已不含 details，且 `sync-version` 可以保住 production 依赖。

**删除 Details Host 目录。** 当时拒绝：在插槽缺失期间，subtree 身份仍然有用。该镜像此后已被删除（[删除说明](2026-09-13-electron-remove-details-host.zh.md)）。

## Consequences

Desktop 设置会显示 Installed tab。Git UI 位于右侧边栏。Overlay 测试要求 bootstrap patch 包含 Plugin Manager。Git 不出现在 `host.patch.yml` 中，因为生态组合走生成的 include 文件。
