# Agent Note: Electron 在 0.1.5-rc.2 pin 中卸载 Details Host 与 Plugin Manager

Status: implemented

[English](2026-09-13-electron-unmount-details-host.md) | 中文

## Problem

上游 `dsh-v0.1.5-rc.2` 移除了 Client `details` 插槽。`@dsh-electron/dsh-client-ui-details-host` 仍会注册该插槽，directory picker 还会可选注入 `ctx.shellDetails`。唯一的产品消费者 Git 已经不再组合（[Git 卸载](2026-09-13-electron-unmount-git-plugin.zh.md)）。继续挂载 Details Host 会让 Host 加载失败。Electron Plugin Manager UI 还坐落在本次 pin 留给 Electron Main 的生命周期路径上，不应与上游 Desktop 安装模型混用。

## Decision

`apps/electron/runtime/host.patch.yml` 挂载 desktop-capabilities、Theme Studio、Electron directory-flow client、desktop brand，以及 `cordis:include` seat。它不挂载 `@dsh-electron/dsh-client-ui-details-host` 或 `@dsh-electron/dsh-electron-ui-plugin-manager`。

两个包仍留在 `runtime/plugins/` 下，仍会被发现、构建和链接。directory picker 不再注入 `shellDetails`，也不再把 Details Host 列入 `dsh.client.inject`。

重新引入 Details Host 需要 Client 占用插槽（Sidebar 或恢复的 Details 栏）以及消费者。重新引入 Installed tab 是后续组合选择，且不得把本次 pin 的 Main + generated-roster 路径与第二种安装模型混用。

## Alternatives considered

**在没有消费者的情况下继续挂载 Details Host。** 拒绝：该插件仍会注册 `details`，而上游已不再声明该插槽。

**把 Git 接到 Sidebar 以便保留 Details Host。** 拒绝：本次 pin 已卸载 Git。

**删除 Details Host 与 Plugin Manager 目录。** 拒绝：subtree 身份与后续组合仍需要这些源码。

**保留 directory picker 的可选 `shellDetails` inject。** 拒绝：这会让 Client inject 边继续指向未挂载的插件。

## Consequences

Desktop 启动时没有第三栏 details host，也没有 Electron Installed settings tab。Theme Studio、目录选择与品牌 occupant 仍然保留。Overlay 测试固定渲染后的 bootstrap patch 不包含这两个未挂载包名。
