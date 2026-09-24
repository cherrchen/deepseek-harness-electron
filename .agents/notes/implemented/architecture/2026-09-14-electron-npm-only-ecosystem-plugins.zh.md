# Agent Note: Electron 仅从 npm 安装生态插件

Status: implemented

[English](2026-09-14-electron-npm-only-ecosystem-plugins.md) | 中文

## Problem

Desktop 需要每个 bundled ecosystem 插件都存在于 production `node_modules` 中，以便 electron-builder 纳入该包，并让运行时发现逻辑把它链接进 profile。把独立发布的插件镜像到 `packages/dsh-electron/` 会产生第二棵源码树，需要仓库范围的 workspace 与验证例外，还会让源码 checkout 通过打包应用无法使用的 workspace fallback 成功。依赖同步还会把每个 `dshElectron.ecosystemPlugins` 条目转换为 `workspace:^`，因此 registry pin 无法在上游合并后保留。

## Decision

Bundled ecosystem 插件是 `@dsh-electron/dsh-electron` 的精确版本 production npm 依赖。当前 Git 插件依赖是 `@dsh-electron/dsh-plugin-git@0.2.3`；本仓库不保存其源码副本。`dshElectron.ecosystemPlugins` 仍然拥有发行清单与运行时生命周期分类，但不代表 workspace 成员资格。

`synchronizeDependencies()` 只重新生成上游 CLI graph 与明确要求的 Desktop workspace import。它保留现有的非 workspace registry 依赖，包括 ecosystem plugin pin。运行时发现只从 `apps/electron/node_modules` 解析每个 roster 条目，并在安装包缺失时失败。Electron 链接已发布的 Host 与 Client artifacts，不重新构建它们。

仓库只在 `apps/electron/runtime/plugins/` 下保留必需的 Desktop runtime 源码：Desktop Capabilities、Theme Studio、UI Brand、UI Directory Picker 与 UI Plugin Manager。标准 workspace、TypeScript、lint、文档、翻译、hook 与上游同步规则直接生效，不保留 `packages/dsh-electron/` 例外。

## Alternatives considered

**保留 subtree 作为开发 fallback。** 拒绝：fallback 会产生两个 package 权威，并可能隐藏 production 安装缺失，直到打包应用启动时才暴露。

**把 Git 移到 `runtime/plugins/`。** 拒绝：Git 是用户可管理的生态功能；runtime inventory 成员由系统拥有，用户不能通过 Plugin Manager 禁用。

**对 npm 依赖使用 semver range。** 拒绝：每个 Desktop release 必须绑定其测试和打包时使用的精确插件 artifacts。

## Consequences

源码 checkout 与打包应用使用相同的 npm artifact 路径。安装依赖需要访问 registry 中的 pin 版本；更新 Git 需要显式修改 dependency pin 与 lockfile。该包仍位于 `Contents/Resources/app/node_modules`，而缺失安装会在发现阶段失败，不会回退到仓库源码。

Focused tests 会确保依赖同步保留精确 registry pin、从已安装的 `node_modules` package 完成发现、拒绝缺失安装，并禁止重新引入 workspace fallback。仓库门禁扫描正常的 `packages/**` corpus，不保留 subtree exclusion。
