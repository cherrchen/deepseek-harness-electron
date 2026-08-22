# Agent Note: Drop stale Electron workspace specifiers during upstream sync

Status: implemented

[English](2026-08-20-drop-stale-electron-workspace-specifiers.md) | 中文

## Problem

[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 将 `upstream/master` 合并进 `develop`，然后 [`sync-version.mjs`](../../../../apps/electron/scripts/sync-version.mjs) 按合并后的 CLI（命令行界面）生产依赖图改写 `apps/electron/package.json`。上游删除或移动包会从 workspace 中去掉这些目录，而 Electron manifest（元数据清单）仍以 `workspace:^` 列出它们。同步会保留发现到的 workspace 集合之外的每一个现有名字，因此残留的 `workspace:` 声明被当成桌面端自有的 registry 依赖。[`assertResolvedWorkspaceDependencies`](../../../../apps/electron/scripts/sync-version-dependencies.mjs) 随后因这些声明仍使用 workspace 协议而中止，且 `pnpm install` 无法从 npm 获取 `workspace:`。锁文件冲突策略接受上游并重新生成；残留的 `workspace:` 声明仍会在该解析之后拦住定时同步。

## Decision

[`synchronizeDependencies`](../../../../apps/electron/scripts/sync-version-dependencies.mjs) 只在当前声明不是 `workspace:` 协议、且名字不是已发现的 workspace 包时保留它。由 CLI 图生成的 peer 集合替换全部 workspace 依赖。`assertResolvedWorkspaceDependencies` 仍会拒绝一份点名缺失 workspace 包的构造结果。面向操作者的表述写在 [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md)；[loopback-shell 决策](../architecture/2026-08-14-electron-loopback-shell.zh.md) 仍负责说明 Electron 为何列出这些 peer。

## Alternatives considered

**在残留的 `workspace:` 声明无法解析时中止同步。** 这就是拦住工作流的失败。上游删除与移动包是预期情况；Electron manifest 必须跟随合并后的图，而不是冻结上一份 peer 集合。

**把残留的 `workspace:` 声明当作 registry 依赖。** `workspace:` 协议无法从 npm 获取。即便去掉断言，`pnpm install --no-frozen-lockfile` 仍会失败。

**保留残留的 `workspace:` 声明并跳过断言。** 随后的安装仍会失败，并且 Electron manifest 会继续持有合并后的 workspace 中已不存在的名字。

## Consequences

一次删除或改放前 CLI workspace peer 的上游合并会更新 Electron manifest 并重新生成锁文件，无需手工解决冲突。若生成出的 peer 在合并后的 workspace 中缺失，仍然会响亮失败。聚焦的 Electron 测试固定：workspace 中已不存在的残留 `workspace:` 声明会被丢弃，同时保留 `electron-updater`。
