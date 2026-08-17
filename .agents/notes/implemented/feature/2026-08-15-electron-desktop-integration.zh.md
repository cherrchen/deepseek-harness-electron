# Agent Note: Electron 负责桌面集成

Status: implemented

[English](2026-08-15-electron-desktop-integration.md) | 中文

## Problem

Electron 包装层在默认浏览器窗口中显示上游 Web UI。操作系统窗口框架会挤压页面；关闭窗口会终止受监管的 Harness 进程；Chromium 拒绝剪贴板写入权限，使上游复制控件失效；包装层也没有桌面右键菜单、“关于”窗口或更新生命周期。如果在上游客户端包中实现这些行为，同步的源码树将与单一下游宿主耦合。

## Decision

`apps/electron` 负责桌面专用的窗口框架、生命周期、权限、菜单、应用元数据和更新行为。上游 Web 组合保持不变并继续在沙箱中运行。

主窗口在页面上方保留固定拖拽区域。macOS 使用隐藏标题栏和定位后的“交通信号灯”；Windows 和 Linux 使用 Window Controls Overlay。除非正在明确退出或安装更新，关闭事件只隐藏主窗口。托盘保留应用、重新打开窗口，并提供唯一的常规退出操作；单实例锁使再次启动时显示已有窗口。

默认 session（会话）仅在请求源和 `WebContents` 都属于活动环回 Harness 窗口时允许 `clipboard-sanitized-write`。原生右键菜单使用 Chromium 编辑标志，不通过渲染进程 IPC。“关于”文档是采用严格 Content Security Policy 的沙箱 data URL，只有从 `package.json` 解析出的仓库 URL 可以在外部打开。

`electron-updater` 在启动时以及通过应用菜单和托盘菜单检查 GitHub 提供方，自动下载，并且只在受监管的 Harness 进程停止后安装。`--allow-prerelease-updates` 控制是否接收 GitHub pre-release。release 工作流随安装包发布构建器元数据和 blockmap；合并步骤在创建 release 前组合独立构建的 x64 和 ARM64 元数据。

## Alternatives considered

- **修改上游 Web UI 包** — 会把 Electron 布局、权限和生命周期行为放入还需要服务普通浏览器的同步源码。
- **为每个桌面操作暴露 preload 桥接** — 对 Electron 已通过原生 role、session 权限和主进程事件提供的操作增加渲染进程 API 与 IPC 校验。
- **在最后一个窗口关闭时退出** — 保留原有生命周期，但无法支持后台任务或由托盘明确控制的退出。
- **只发布一个架构的更新器元数据** — 会让 release 发现选择错误的安装包或遗漏另一种架构；合并后的文件列表使 `electron-updater` 可以选择名称中包含当前运行架构的产物。

## Consequences

桌面行为与上游包保持隔离，渲染进程权限只增加现有复制控件所需的一项剪贴板写入权限。关闭窗口不再代表进程退出，因此崩溃处理、明确退出和更新安装必须统一协调受监管进程的停止。release 发布任务会安装 workspace 依赖以合并 YAML 元数据。未签名 CI 包可以证明更新元数据与发现机制，但 macOS 安装仍然需要分发签名。
