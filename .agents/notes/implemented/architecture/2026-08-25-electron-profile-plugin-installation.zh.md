# Agent Note: Electron profile 插件安装

Status: implemented

[English](2026-08-25-electron-profile-plugin-installation.md) | 中文

## Problem

Electron Plugin Manager 只能控制应用启动时组装的、由发行版拥有的插件 inventory。把包安装到 `web` profile 不会使它进入该 inventory，因此仅添加安装对话框无法把新的普通插件接入启用、停用、重载、Host 真相或 client 刷新行为。打包后的 Desktop 用户也不能依赖全局 Node.js 或 pnpm 安装。

## Decision

Electron 将 profile 插件安装暴露为类型化 Desktop capability，同时保留 [profile 插件组合包](2026-08-05-profile-plugin-bundles.zh.md)规定的上游 profile 与 bundle 模型。

`ProfilePluginCatalog` 是当前 inventory authority。每次读取都会合并 Electron 必需 runtime 插件、bundled ecosystem 插件和安装在 `$DSH_HOME/profiles/web` 中的直接依赖，并由 system 与 bundled entry 按真实 package name 取得优先权。Catalog entry 分离 ownership、package kind、installation source、activation behavior 与可选 Host runtime state。普通 runtime 插件使用热激活，`dsh.bundle` 包需要下一次 profile 启动，没有可加载 root entry 的包则作为 plain dependency 保持可见但不提供 lifecycle control。

`plugin-state.json` version 2 保存 disabled runtime package name，并记录哪些 profile direct dependency 属于 Desktop 管理。Version 1 会在不丢失 disabled set 的情况下迁移。依赖 spec 仍以 profile `package.json` 为真源；Electron 不会把它复制到自身 state file。

Renderer 发送三种 closed request 之一：registry package 加可选 version、Git repository 加可选 ref，或 absolute local path 加 `file`/`link` mode。Electron Main 校验请求，并把它规范化为一个 pnpm-compatible spec。Renderer 不会获得 filesystem、child-process、shell-command 或 pnpm argument 接口。

`PluginPackageService` 调用上游 `dsh plugin --profile web add <spec>` 接口。它不会直接运行 `pnpm add`，因为上游命令拥有 profile 初始化和 `dsh.profile.bundles` 协调。Electron 在更新 Desktop state 或选择 activation behavior 前，会检查 pnpm 写入的真实 dependency name 与 installed manifest；用户输入绝不会被当作 installed package identity。

打包后的 Electron 携带仓库 package-manager version 对应的 pnpm。Main 在 `$DSH_HOME/electron/bin` 下写入平台专用 `pnpm`/`pnpm.cmd` shim，通过 Node mode 下的 packaged Electron executable 启动 bundled pnpm entrypoint，再把该目录放到 child PATH 最前。上游 dsh 继续通过既有接口调用 `pnpm`，Desktop 安装则不依赖全局 Node.js、Corepack、pnpm 或用户 PATH 顺序。

`PluginMutationCoordinator` 在一个由 Main 拥有的 queue 下串行化 install、enable、disable 与 reload。普通插件成功安装后会先持久化再执行热激活，并进入与 bundled ecosystem 插件相同的 generated `plugins.cordis.yml`、Host inventory polling、rollback 与 client-bearing Renderer refresh 路径。若激活失败，package 与 Desktop-managed membership 保持已安装，错误会明确说明 activation failed；Electron 不会声称执行了实际不存在的 installation rollback。Bundle 安装不会重写 runtime include 或重启 Host，UI 会报告 restart requirement。

“已安装”view 拥有三来源对话框。它对本地 repository 使用既有 native directory picker，在 Main mutation 期间禁止重复提交，显示 third-party-code trust warning，保留带可展开 technical details 的稳定 error category，并在完成后刷新既有 catalog。本决策不包含 profile selector、marketplace、update、removal、automatic Host restart、credential UI 或 plugin sandbox。

## Alternatives considered

**创建 Electron-only 插件目录与 dependency resolver。** 拒绝：这会形成第二套插件生态，其安装、bundle、解析与 lifecycle 语义均不同于 DSH profile。

**从 Electron 直接运行 `pnpm add`。** 拒绝：Electron 将不得不复制上游 bundle inspection 与 `dsh.profile.bundles` 协调逻辑，并且两套实现可能在 package update 后产生分歧。

**要求用户全局安装 pnpm 或使用 Corepack。** 拒绝：打包后的 Desktop 必须能在干净用户环境中安装插件，并使用由应用发行版控制的 package-manager version。

**把每个 installed package 都视为可热加载 Cordis 插件。** 拒绝：bundle 只在 profile 启动时进入 profile composition，而 plain dependency 可能不暴露 Cordis entrypoint。为任一类别展示 lifecycle control 都会错误描述 runtime behavior。

**安装 bundle 后自动重启 Host。** 拒绝：重启 active profile 会中断范围更广的 session 与 agent state。安装只报告该边界，把 restart ownership 留给后续 graceful-restart 设计。

**为 installation 与 runtime lifecycle 使用独立 mutation queue。** 拒绝：两条路径都可能重写 Desktop state 与 generated runtime roster；Renderer button state 不是 concurrency protection。

## Consequences

Profile package installation 与 runtime lifecycle 共享一个 refreshable catalog 和一个 mutation authority。Bundled Git 插件保留 bundled ownership 与 hot lifecycle behavior，同名 profile dependency 不会创建重复 card。

安装路径使用 Harness process permission 执行 third-party package 与 plugin code，位于 agent sandbox 之外。UI 会明确说明这一点。Git install-time build script 仍可能需要 pnpm `allowBuilds`；Main 会对该 diagnostic 分类，同时保留 upstream details。

聚焦的 Electron coverage 固定 state migration、catalog precedence 与 classification、包含 Windows path 的 registry/Git/local normalization、packaged pnpm shim generation、install-state reconciliation、activation dispatch、capability forwarding、dialog behavior 和既有 hot-plug regression path。
