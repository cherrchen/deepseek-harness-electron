# Agent Note: Git client declares Details Host as a module-table request

Status: implemented

[English](2026-08-25-git-details-host-client-external.md) | 中文

## Problem

Git 的 Client factory 从 `@dsh-electron/dsh-client-ui-details-host/client` 值导入 `DETAILS_SURFACE_SLOT`。独立 tsdown 配置把该 specifier 留作 `require`。`dsh.client.inject` 是 informational 的 package-name 边，不会填入启动图的 `external` 列表。因此 `ClientModuleSystem.import` 会在尚未 arrive Details Host 的情况下物化 Git，而同步的 factory `require` 会 miss 模块表。Desktop 对 `@dsh-electron/dsh-plugin-git` 报告 `Failed to load plugins`。[必需 portable UI 基础设施](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.zh.md) 决策仍负责说明 Details Host 为何是 runtime 插件行；[共享模块](../../../../packages/client/AGENTS.md#shared-modules-and-the-module-graph) 规则仍负责说明非基座值导入为何需要 `dsh.client.external`。

## Decision

Git 的 `dsh.client.external` 列出精确导入 specifier `@dsh-electron/dsh-client-ui-details-host/client`。client-modules Host 随后把 Details Host 排在 Git 之前，并在 Git 的 factory `require` 它之前登记 Details Host 的 factory。[`verify-client-packages`](../../../../scripts/verify-client-packages.ts) 读取 Details Host 的 runtime-plugin manifest，使该请求具有 supplier。Package 测试固定该声明；Client artifact 仍将 Details Host 保持为 external，而不是内联它。

## Alternatives considered

**在 Git 中内联 `'shell.details.surface'` 并去掉值导入。** Git 将在没有模块表边的情况下加载。Cordis `shellDetails` inject 与 `slots.inject` 仍会等待 Details Host。slot 名称会从拥有它的 package 上被复制出去。

**将 Details Host 标为 `immediately: true`。** Parser preload 会更早登记 Details Host，但 Git 的 factory `require` 仍需要图上的 `external` 边；`inject` 不会创建它。

## Consequences

Desktop 插件启动会在 Git 之前物化 Details Host 的 Client factory。覆盖范围是 Git 的 `dsh.client.external` 声明、client-packages 的 supplier 图，以及构建出的 Client artifact 对该 specifier 仍保留的 `require`。Git 仍不向 Details Host 添加 API。
