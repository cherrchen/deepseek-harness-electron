# Agent Note: Packaged Electron ships declared ecosystem plugins as production dependencies

Status: implemented

[English](2026-09-04-electron-ecosystem-plugin-production-dependency.md) | 中文

## 问题

`dshElectron.ecosystemPlugins` 列出了 `@dsh-electron/dsh-plugin-git`，启动发现会在 Electron 应用的 `node_modules` 下查找该包（源码 checkout 还有 monorepo workspace 回退）。Electron 应用没有把它声明为 production 依赖，因此 electron-builder 不会把它打进安装包。打开 DeepSeek Harness `v0.1.2-beta.1` 会失败，报错 `ecosystem plugins: @dsh-electron/dsh-plugin-git is declared but not installed`。源码 `pnpm start` 与单测仍能通过，因为它们解析的是 `packages/dsh-electron/dsh-plugin-git`。

## 决策

`dshElectron.ecosystemPlugins` 中的每个名称都是 `@dsh-electron/dsh-electron` 的 production `workspace:` 依赖。`requiredDesktopWorkspaceDependencies()` 把这些名称与 `DESKTOP_ENTRY_WORKSPACE_DEPENDENCIES` 拼接，因此 `sync-version` 在重生 CLI workspace graph 时不能丢掉它们。发现仍然优先 `app/node_modules/<name>`，并保留 workspace 回退给未打包的 checkout。生态插件仍是标准 DSH 包这一公共 namespace 决策仍由[该 namespace 说明](../architecture/2026-08-23-public-dsh-ecosystem-plugin-namespace.zh.md)拥有。

## 考虑过的替代方案

**用 electron-builder `files` 或 `extraResources` 拷贝插件文件，而不声明 production 依赖。** 否决：发现、profile 链接与 Host 包解析都使用 `node_modules` 下的 npm 包名；第二条拷贝路径会与声明的 roster 漂移。

**把 Git 像 Details Host 与 Theme Studio 一样挂到 `runtime/plugins/`。** 否决：Git 是用户可禁用的生态 UI，不是必需 Desktop 基础设施。[必需 portable UI](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.zh.md) 已经拥有这一划分。

**只保留 monorepo workspace 回退。** 否决：打包后的 `.app` 没有 `packages/dsh-electron/` 树，而这正是 `v0.1.2-beta.1` 的崩溃原因。

## 后果

打包后的 Desktop 会把每个已声明的生态插件放进 `Contents/Resources/app/node_modules`。之后的 `sync-version` 会保留这些 workspace specifier。workspace 回退仍只用于开发，包装测试不再被缺失的 production 依赖掩盖。

## 测试

- 单测：每个 `dshElectron.ecosystemPlugins` 名称都是 production `workspace:^` 依赖；发现能读取打包后的 `node_modules` 布局，并在两个安装路径都不存在时拒绝已声明名称；`requiredDesktopWorkspaceDependencies()` 在同步时保留 Git。
- 手工：安装 Desktop artifact，确认启动不再对 `@dsh-electron/dsh-plugin-git` 抛出 `declared but not installed`。
