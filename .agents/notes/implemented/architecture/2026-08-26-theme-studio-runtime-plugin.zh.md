# Agent Note: 将 Theme Studio 作为必需 runtime plugin

Status: implemented

[English](2026-08-26-theme-studio-runtime-plugin.md) | 中文

## Problem

Desktop 需要在**设置 → 通用 → 主题**提供内置配色覆盖层，且不得替换官方外观（浅色 / 深色 / 跟随系统）。主题呈现已经属于 `ctx.theme`。再建一套 ThemeRuntime、直接写 DOM，或走 Electron-only theme IPC，都会拆开 token 权威。若把 Theme Studio 作为用户可禁用的 `packages/dsh-electron/` 生态插件发布，禁用后 General 会失去 Themes 行。

## Decision

`@dsh-electron/dsh-theme-studio` 是与 Details Host 同类的 Electron 必需 portable UI（[必需 portable UI](2026-08-24-electron-required-portable-ui-infrastructure.zh.md)）。源码真源是 `cherrchen/dsh-theme-studio`。本 monorepo 用 git subtree 镜像到 `apps/electron/runtime/plugins/dsh-theme-studio`。Electron 从该源码重新构建 Host 与 Client artifacts。该包是必需的 `runtime/host.patch.yml` 挂载项，不是 `dshElectron.ecosystemPlugins` 的成员。

Theme Studio 不自己呈现 CSS。它调用 `ctx.theme.overrideTokens()`，并使用两个固定 source：

* `@dsh-electron/dsh-theme-studio:active` 表示已持久化的覆盖层
* `@dsh-electron/dsh-theme-studio:preview` 表示从不写入设置的临时覆盖层

官方外观仍是 `settings.general.item`、`id = appearance`、`order = 10`。Theme Studio 注册 `id = themes`、`order = 20`。恢复 Default 只释放 Theme Studio 层；它从不调用 `ctx.theme.setTheme()`。

Host 半在存在 `ctx.settings` 时注册 `theme-studio` settings namespace（`activeThemeId: string | null`），否则 no-op，因此 Headless composition 可以启动。乐观视觉更新之后，durable Host snapshot 仍是权威。

## Alternatives considered

**把 Theme Studio 放到 `packages/dsh-electron/` 并列入 `dshElectron.ecosystemPlugins`。** 拒绝：Themes 是始终开启的 Desktop 产品 UI。用户能从 Plugin Manager 禁用覆盖层，使 General 失去 Themes 行。

**在 Electron Main、preload 或 renderer 中实现 Theme Studio。** 拒绝：覆盖层、持久化与 Themes 行是普通 DSH 插件工作；否则 Electron 会拥有标准 Web host 无法加载的产品 UI。

**替换或复制官方外观。** 拒绝：浅色 / 深色 / 跟随系统是 ThemeRuntime 已经解析的基础偏好，包括 `system` 的 `prefers-color-scheme`。覆盖层调色板必须跟随该基础，而不能拥有它。

**再建一套 ThemeRuntime，或由 Theme Studio 写 `document.documentElement`。** 拒绝：`overrideTokens()` 已经按后注册 source 覆盖先注册 source、按 source 原子替换，并根据当前 color scheme 选择 light/dark 值。

**在 Stage 1 暴露 `ctx.themeStudio`。** 拒绝：跨插件 catalog API 属于 Stage 3；在该 API 存在之前，Settings 行使用插件内部 runtime。

## Consequences

Desktop 对 Theme Studio 的分发是 package inclusion、必需的 `host.patch.yml` 成员资格，以及 Cordis 生命周期。覆盖层正确性、预览、持久化与 Themes 行留在独立包中。Stage 2 的导入导出与 Stage 3 的 agent/catalog 扩展该 runtime，而不是替换它。
