# Agent Note: Electron 在不改上游 pnpm workspace 默认值的前提下加固 web profile 安装

Status: implemented

[English](2026-09-13-electron-plugin-install-hardening.md) | 中文

## Problem

上游 `PROFILE_PNPM_WORKSPACE` 不能为 Desktop 单独加上 `strictDepBuilds` / `allowBuilds`，否则就要改 `packages/boot`。Electron 启动时只链接发行插件，因此缺少 symlink 的 profile hot plugin 会一直无法加载，直到某次 enable 回调。`install()` 把 exit 0 且 dependencies 未变的命令当成成功，因此 `--force` 空装看起来已经完成。

## Decision

Electron 在启动时以及每次 spawn `dsh plugin` 前 ensure `$DSH_HOME/profiles/web/pnpm-workspace.yaml`。它保留 CLI 已写的 `packages` / `nodeLinker` / `autoInstallPeers`，强制 `strictDepBuilds: true`，并合并一份已评审的 `allowBuilds` 种子（`esbuild: true`；`@google/genai`、`protobufjs`、`node-addon-require-builtin` 为 false），同时不丢用户已有键。第三方插件的 native 不会被自动批准。被拦截的 build 诊断指向该文件。

`install()` 在 `exitCode === 0` 且没有任何 dependency 名称变化时失败。`reinstall` 与 `update --force` 仍可在不新增 dependency 键的情况下刷新。

启动时遍历 catalog 中所有 `activationMode === 'hot'` 且 `rootPath` 存在的条目，对 profile 与 electron `node_modules` 执行 `ensureSymlink`。pending 对账复用同一入口。

## Alternatives considered

**改 `packages/boot` 里的 `PROFILE_PNPM_WORKSPACE`。** 拒绝：Desktop 不得修改上游 boot。

**批准 pnpm 打印出的每一个 native。** 拒绝：这会信任未经评审的第三方安装脚本。

## Consequences

聚焦测试覆盖 workspace 合并、缺文件写入、空安装失败，以及 hot-plugin symlink 巡检。上游 CLI 与 boot 树保持未改。
