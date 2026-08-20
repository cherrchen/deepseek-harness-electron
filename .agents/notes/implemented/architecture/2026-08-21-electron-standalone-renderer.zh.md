# Agent Note: Electron 自有 Renderer 与 Main 端 Harness 兼容代理

Status: implemented

English | [中文](2026-08-21-electron-standalone-renderer.md)

## Problem

桌面壳层此前把受监督的 `dsh web` 就绪 URL（`http://127.0.0.1:<port>`）直接载入 `BrowserWindow`。Host HTML、Vite 资源与 localhost 传输因此成为页面源，Electron 应用仍是 Web 组合的薄容器，而不是 Renderer 进程边界的所有者。

## Decision

[`apps/electron`](../../../../apps/electron) 拥有基于 `@deepseek-ai/dsh-client-web` 构建的独立 Renderer，并通过特权自定义协议 `dsh-electron://localhost/` 提供。Electron Main 在 Milestone 1 仍监督 loopback 上的 `dsh web` 作为兼容后端，但该 URL 仅 Main 可见。Renderer 通过类型化 preload IPC 获取 Host bootstrap；插件经典脚本与一元 `/api` 经自定义协议代理；`/api/events.mux` / `/api/events.host` 经 MessagePort WebSocket 替身，由 Main 桥接到真实 Host WebSocket。

Renderer 主机名保持 `localhost`，以便上游客户端 loopback 门闸（`isLoopbackHostname`）在不修改 `packages/` 的情况下仍视桌面页为本地。安全配置保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，仅暴露 `window.deepseekDesktop`（无通用 `invoke`）。

本决策更新了 [loopback shell 说明](2026-08-14-electron-loopback-shell.md) 中窗口加载的一半：Harness 监督与 `$DSH_HOME` 保留；`BrowserWindow` 不再导航到 Harness HTTP 源。桌面操作系统能力所有权（目录选择、剪贴板、shell、通知、updater 桥、主题、窗口控制）记录于 [桌面能力说明](2026-08-21-electron-desktop-capability-ownership.md)。

## Alternatives considered

**继续加载 Harness 就绪 URL。** 保留今日 boot 注入，但不满足 Milestone 1「BrowserWindow 不得再作为 Web 页面容器、Renderer DevTools 不得直接访问 `127.0.0.1`」的验收。

**经自定义协议 fetch 的 SSE WebSocket 替身。** 网络侧 GET `/api/events.*` 返回 HTTP 426；SSE 仅存在于进程内 `toFetchHandler`。Milestone 1 仍使用派生 Host 进程，因此 Main 必须打开真实 WebSocket。

**修改上游 connection/web 包以提供原生 Electron transport。** 长期正确（Milestone 2），但会把下游 fork 面扩大到 `apps/electron/**` 之外。

**使用 `dsh-electron://app/` 作为源。** 在不改包的情况下破坏上游 loopback 主机名检查。

## Consequences

打包与开发构建都必须在 `lib/` 之外产出 `dist/renderer`，并由 `electron-builder` files 收录。运行时仍需要就绪的 Harness 进程以提取 bootstrap、提供 `/plugins` 与 `/api`。Windows 打包冒烟由 desktop CI 覆盖；macOS 打包冒烟在本地验证。
