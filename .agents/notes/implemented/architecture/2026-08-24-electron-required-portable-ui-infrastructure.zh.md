# Agent Note: Electron 必需的 portable UI 基础设施

Status: implemented

[English](2026-08-24-electron-required-portable-ui-infrastructure.md) | 中文

## Problem

Desktop 需要内置的 Client UI：它必须 portable（不含 Electron、`ctx.desktop`、preload import），必须不可被用户通过 Plugin Manager 禁用，且源码真源不是 Electron monorepo。上游 DSH 把这类功能放在 `packages/` 与公共插件仓库；Desktop 必须把它们重建进自己的 runtime plugin 清单，同时不把它们变成 ecosystem 插件。

## Decision

`runtime/plugins/` 可以承载 Electron 必需的 portable DSH UI 基础设施：一个 `platform: web` 公共包，其 canonical 仓库独立，本仓库中的目录是 git subtree 镜像。修改独立仓库，再执行 `git subtree pull`；不要把镜像当作真源来打补丁。Electron 从 subtree 源码重新构建 Host 与 Client artifacts；独立仓库的 `lib/` 是公共 npm 产物，不是 Electron 的加载真源。

该包只使用上游 DSH client 服务，进入组合时是 `host.patch.yml` 的必需挂载行，永不加入 `dshElectron.ecosystemPlugins`。发现结果报告 `source: desktop-runtime`。在消费者调用已发布服务之前，加载该包 MUST NOT 占用产品 UI。

`@dsh-electron/dsh-theme-studio` 是当前成员：它通过 `ctx.theme.overrideTokens()` 叠加内置配色，并注册 设置 → 通用 → 主题。前一个成员 Details Host 在上游移除 Client `details` 插槽后已被删除（[删除说明](2026-09-13-electron-remove-details-host.zh.md)）。

此类是"每个 portable 公共插件都应放在 `packages/dsh-electron/`"的例外：Desktop 用 runtime plugin builder 重建它，同时仍禁止 Electron、`ctx.desktop` 与 preload import。用户可禁用的产品功能留在生态 island（[组说明](../../../../packages/dsh-electron/README.zh.md)）。

## Alternatives considered

**作为 `packages/dsh-electron/` 下的生态插件发布。** 拒绝：用户可以通过 Plugin Manager 禁用必需 UI 基础设施。

**先在 Electron 镜像里开发再拷回。** 拒绝：两棵树会争夺真源。

**打包 Desktop 专用变体而非 portable 包。** 拒绝：portable 构建必须与独立 `dsh` 用户安装的产物保持一致。

## Consequences

Desktop 的 required-UI 清单只靠 `host.patch.yml` 行区分已挂载成员与缺席插件；添加成员而不挂载会静默发布死代码。

Theme Studio 的 subtree 测试与 Electron 发现/分类测试钉住类别事实：`platform: web`、无 Electron 或 desktop import、system 所有权、required、不可管理、且不在 `dshElectron.ecosystemPlugins` 中。覆盖范围不包括 headed Electron 窗口的空闲 UI 视觉检查。
