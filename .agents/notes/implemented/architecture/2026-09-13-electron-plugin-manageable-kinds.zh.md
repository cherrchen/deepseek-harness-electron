# Agent Note: Electron 将健康 runtime-plugin 视为可管理，不再以 profileManaged 为门槛

Status: implemented

[English](2026-09-13-electron-plugin-manageable-kinds.md) | 中文

## Problem

`ProfilePluginCatalog` 把 `profileManaged` 当作 manageable 门槛。用 `dsh plugin --profile web` 安装的 runtime-plugin 在 Electron 中被降成 `dependency`，Installed tab 无法 enable、disable、reload 或 remove，即使 Host 可以加载它。

## Decision

健康且 `activationMode === 'hot'` 的 `runtime-plugin` 一律 `manageable: true`，不论 Desktop 是否把它记入 `profileManaged`。CLI 安装的 runtime-plugin 保持 kind `runtime-plugin`。`profileManaged` 只作来源记账，并投影为 `desktopInstalled` 供 UI 文案与卸载确认使用。`plugin-state.json` 保持 version 2。

Desktop 安装仍会写入 `profileManaged`。Bundle 仍是共享 profile 组合层（`profile-restart`）。Runtime-plugin 仍通过 `plugins.cordis.yml` 作为 Electron 私有激活面。Plain dependency 保持惰性。若要在 `dsh web` 中也可用，作者应声明 `dsh.bundle.patch`。

## Alternatives considered

**继续用 `profileManaged` 作为启停门槛。** 拒绝：这会把 CLI 安装的 runtime-plugin 从唯一的 Desktop 管理 UI 中藏起来。

**把 `plugin-state.json` 升到 version 3 以单独存储来源。** 拒绝：现有 `profileManaged` 列表已经记录 Desktop 安装。

## Consequences

启动 roster 与 `activateAfterPackageMutation` 跟随 catalog 的 health 与 kind，而不是 Desktop 成员资格。Overlay 与 catalog 测试固定 `apps/cli` 与 `packages/boot` 不被修改。Installed tab 为 bundle 与 runtime-plugin 显示类别文案，并在 CLI 卸载时给出说明。
