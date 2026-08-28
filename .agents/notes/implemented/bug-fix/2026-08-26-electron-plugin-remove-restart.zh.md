# Agent Note: Electron 卸载插件时以重启替代 soft-refresh 崩溃

Status: implemented

[English](2026-08-26-electron-plugin-remove-restart.md) | 中文

## 问题

移除外部安装、带 client half 的 Bundle 时，Desktop 会先删除 package 文件，再 soft-refresh Renderer，而 Host 仍持有 startup Bundle composition。reload 会向已缺失文件请求 `/plugins/<name>/client.js`，导致整屏插件加载失败，而不是 Bundle 安装后那条“成功 + 需要重启”路径。

## 决策

Package removal 只对 hot-activated package soft-refresh Renderer。`profile-restart` removal 只更新磁盘状态、记录 pending restart tombstone，并在 Desktop relaunch 前保持 Host composition 不变。“已安装”页对齐安装 UX：需要重启的 removal 显示成功对话框；该对话框与 pending-restart banner 都通过 `ctx.desktop.app.relaunch()` 提供**立即重启**，先 drain Host，再调用 Electron `app.relaunch()` / `app.exit(0)`。

## 考虑过的替代方案

**每次移除带 client 的 package 都 soft-refresh。** 否决：Host 在进程重启前仍会提供 startup Bundle client module；文件删除后再 refresh 就是崩溃本身。

**只提示用户手动退出，不提供 relaunch API。** 否决：安装与移除都已要求重启；由 Main 拥有的 relaunch 与 updater install 一样会先 drain Host。

## 后果

Bundle 卸载不再把 Desktop 打进失败插件全屏。Pending composition 仍需 relaunch；Desktop 不会 hot-unload startup Bundle。更广的 mutation 与 restart-tracker 规则见 [profile package lifecycle](2026-08-25-electron-profile-plugin-package-lifecycle.md)。

## 必要验证

- 单测：Bundle remove 跳过 `refreshAfterPackageRemoval`；hot runtime remove 仍 refresh。
- UI：remove 成功对话框与 install/banner 的**立即重启**调用 `app.relaunch`。
- 手工：安装 Bundle → relaunch → 移除 Bundle → 成功 + banner → 立即重启，且不再出现失败插件全屏。
