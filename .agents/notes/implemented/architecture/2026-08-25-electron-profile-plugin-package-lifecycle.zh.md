# Agent Note: Electron profile 插件 package lifecycle

Status: implemented

[English](2026-08-25-electron-profile-plugin-package-lifecycle.md) | 中文

## Problem

仅支持 profile package installation 时，Desktop 无法检查兼容 update、刷新 Git 或 local source、repair incomplete dependency，或安全移除 package。把 Bundle 的 startup activation mechanism 当作当前 restart state，还会使每个 healthy Bundle 永久显示为未应用。直接 update 或 delete active runtime plugin 可能在 Host 仍执行旧代码时替换文件，而 ordinary disable 不能用于 temporary quiescence，因为它会持久化用户的 disabled preference。

## Decision

`PluginLifecycleEntry` 将 `activationMode` 与 `health` 分离。`activationMode` 描述 `hot`、`profile-restart` 或无 activation；`health` 报告 installed entry 是 healthy 还是需要 reconciliation。Main 还会提供 `packageActions`，因此 Renderer 永远不会根据 source、ownership 或 kind 推导 update 或 removal authority。

System 与 distribution-bundled package 不具有 package action。Registry-owned direct profile dependency 支持 explicit update check、遵循 range 的 update、reinstall 与 removal。Git 与本地 `file:` dependency 从 recorded `requestedSpec` refresh。Healthy `link:` dependency 使用 runtime reload；incomplete link 可以 repair。Unknown direct profile dependency 允许 removal，但不允许 source operation。通过 CLI 安装的 profile dependency 遵循相同 package policy，而 `profileManaged` 继续决定 ordinary runtime dependency 是否进入 Desktop hot lifecycle。

所有 package command 仍是由 Main 创建的 closed tagged value，并通过 `dsh plugin --profile web` 执行；Renderer 不会获得 pnpm argument 或 generic subprocess access。Registry 与 Git update 使用 `update <name>`，copied local refresh 与 reinstall 使用 `add <requestedSpec> --force`，removal 使用 `remove <name>`，update check 使用 `outdated --format json`。Registry result 同时保留 `wanted` 与 `latest`；ordinary update 遵循现有 dependency range，不会选择新的 major version。上游 dsh 仍负责 profile initialization 与 Bundle reconciliation。

`PluginMutationCoordinator` 串行化 package 与 runtime operation，并通过 lifecycle snapshot 暴露当前 descriptor。在 update、reinstall 或 removal 前，`PluginLifecycleController` 会从 runtime composition 临时移除 active hot plugin，并等待 Host absent，且不编辑 `plugin-state.json`。Runtime-to-runtime mutation 成功后会激活重新 inspect 的 package。Runtime-to-Bundle 与 Bundle transition 会保持 unloaded，直至 restart。Bundle-to-runtime 不会 hot-load，因为 running Host 仍包含 startup Bundle composition。

Reactivation 会为 installed Host entry 分配 Main 生成的 file-URL revision。如果不改变 request，Node ESM cache 会在 package file 改变后继续执行旧 module。Lifecycle settlement 除了 revisioned module request，还会跟踪 stable nested loader entry id。

Package recovery 会比较 command 前 capture 的 dependency manifest、pnpm lockfile 与 installed package manifest。未发生变化的 failure 会在之前处于 active 时 restore 原 runtime。任何 captured disk change 都会让 plugin 保持 unloaded 并报告 `profile-changed`；Desktop 不会执行可能处于 partial 状态的 artifact。Removal 成功后会同时清理 `profileManaged` 与 `disabled` membership。Removal 后的 soft Renderer refresh 仅适用于 hot-activated package；`profile-restart` removal 会保持 Host composition 不变，直到 Desktop 通过 `ctx.desktop.app.relaunch()` relaunch。

`PluginRestartTracker` 会在 Host 启动前 capture profile package，并在 Main memory 中保存 Bundle composition difference。Bundle install、update、reinstall、removal 与 kind transition 会出现在 `pendingRestart`；catalog row 消失后，removal 仍以 tombstone 保留。Same-version source refresh 仍保持 pending，因为 package version 不能标识 source content。安装一个 startup baseline 中不存在的 Bundle 后再将其移除，会取消该 change。新的 Desktop process 会 capture 新 baseline，因此不需要新的 persisted state version。

“已安装”view 只在用户请求时检查 update。存在 Registry update 时，它会提升为 row primary action；其他 package action 位于 overflow menu。Removal 需要 confirmation，pending restart change 显示在独立 banner 中。Healthy Bundle 显示“已安装”，除非 tracker 记录了 Host startup 后的 change。Desktop 不会自动 restart Host。

## Alternatives considered

**在 install service 旁创建 update 与 removal service。** 未采用，因为每项 operation 共享相同 catalog authority、package command adapter、runtime quiescence、recovery classification 与 mutation coordinator。

**由 Electron 直接运行 pnpm。** 未采用，因为 Electron 会重复实现上游 Bundle reconciliation，并可能与 CLI-managed profile 产生差异。

**在 `plugin-state.json` 中持久化 restart-required flag。** 未采用，因为 restart state 属于当前 Host composition，在 crash 或 process 成功 restart 后会变为 stale。

**Package mutation 前使用 ordinary disable。** 未采用，因为 disable 会记录 durable user preference，而 package replacement 只需要 temporary runtime quiescence。

**每次 package-manager failure 后都 restore runtime。** 未采用，因为 failed command 可能已经改变 dependency 或 installed package file；执行该 artifact 不安全。

**打开 Settings 时自动检查 Registry。** 未采用，因为它会在没有用户意图时增加 view latency、network traffic 与 private-registry authentication failure。

## Consequences

Desktop 为 GUI 与 CLI 安装的 dependency 提供同一套 profile package lifecycle，且不会扩大 Renderer privilege。Package file 改变前 runtime code 已经 absent，recovery state 会表明 runtime 已恢复还是 disk profile 已改变。Bundle restart status 只反映与 running Host baseline 的差异，并能在 removal row 消失后继续保留，且不增加 durable state。

Package rollback 有意保持有限：只有 captured profile 与 installed-manifest state 未变化时，Desktop 才会 restore runtime。它不保留 historical package version，也不会自动 reverse partially successful pnpm transaction。Update All、background check、major-version selection 与 automatic Host restart 不在本决策范围内。
