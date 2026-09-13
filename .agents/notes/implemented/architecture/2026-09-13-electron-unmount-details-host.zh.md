# Agent Note: Electron 在 0.1.5-rc.2 pin 中卸载 Details Host

Status: implemented

[English](2026-09-13-electron-unmount-details-host.md) | 中文

## Problem

上游 `dsh-v0.1.5-rc.2` 移除了 Client `details` 插槽。`@dsh-electron/dsh-client-ui-details-host` 仍会注册该插槽，directory picker 还会可选注入 `ctx.shellDetails`。继续挂载 Details Host 会让 Host 加载失败。

## Decision

`apps/electron/runtime/host.patch.yml` 挂载 desktop-capabilities、Theme Studio、Electron directory-flow client、desktop brand、Electron Plugin Manager，以及 `cordis:include` seat。它不挂载 `@dsh-electron/dsh-client-ui-details-host`。

Details Host 仍留在 `runtime/plugins/` 下，仍会被发现、构建和链接。directory picker 不注入 `shellDetails`，也不把 Details Host 列入 `dsh.client.inject`。Plugin Manager 重挂由[组合说明](2026-09-13-electron-plugin-manager-and-git-sidebar.zh.md)拥有。

重新引入 Details Host 需要 Client 占用插槽（Sidebar 或恢复的 Details 栏）以及消费者。

## Alternatives considered

**在没有消费者的情况下继续挂载 Details Host。** 拒绝：该插件仍会注册 `details`，而上游已不再声明该插槽。

**把 Git 接到 Sidebar 以便保留 Details Host。** 对 Details Host 拒绝：Git 现在占用 `sidebarRight`，不再需要本插件（[组合说明](2026-09-13-electron-plugin-manager-and-git-sidebar.zh.md)）。

**删除 Details Host 目录。** 拒绝：subtree 身份与后续组合仍需要这些源码。

**保留 directory picker 的可选 `shellDetails` inject。** 拒绝：这会让 Client inject 边继续指向未挂载的插件。

## Consequences

Desktop 启动时没有第三栏 details host。Overlay 测试固定渲染后的 bootstrap patch 不包含 `@dsh-electron/dsh-client-ui-details-host`。
