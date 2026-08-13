# Agent Note: Package the Web composition through a supervised loopback process

Status: implemented

[English](2026-08-14-electron-loopback-shell.md) | 中文

## Problem

桌面发行版必须保留上游 Web 前端、RPC 路由、插件清单、profile 初始化和持久化语义，同时保持易于合并上游。若在 Electron 中重新实现这些职责，就会产生第二套应用组合，并使每项上游变更都需要手工移植。

## Decision

[`apps/electron`](../../../../apps/electron) 是一个私有 workspace 应用，它通过 Electron 的 Node 兼容子进程模式监管已构建的 `dsh web` 入口。该应用启用上游配置 watcher 所需的 Node 内部模块，请求端口零，等待上游就绪日志，并加载日志报告的 `127.0.0.1` URL。子进程使用应用专属的 `DSH_HOME`，初始工作区则是当前用户的主目录。

渲染进程启用上下文隔离和 Chromium 沙箱，不启用 Node 集成，也不授予权限。导航限定在就绪 URL 的源内；新开的 HTTP 和 HTTPS 窗口交给系统浏览器。Electron 在自身退出前终止子进程，并通过原生错误对话框报告启动失败或子进程意外退出。

应用包依赖上游 CLI（命令行界面）workspace，并显式提供遍历 CLI 生产依赖图后发现的每项对等依赖（peer dependency）。[`sync-version.mjs`](../../../../apps/electron/scripts/sync-version.mjs) 会在合并上游后重新生成这组根级 peer，因为 `electron-builder` 在收集 pnpm 应用时不会自动安装 workspace peer。应用不向上游包添加 Electron 专属代码。`electron-builder` 不使用 asar，直接打包已构建的依赖闭包，并从同一应用 manifest（元数据清单）生成原生安装格式。这里必须保留真实包目录，因为上游 profile 启动过程会从用户数据目录的模块 fallback 创建指向已安装依赖图的文件系统 symlink；外部 symlink 无法穿过 Electron 的虚拟 asar 文件系统。

聚焦测试固定可执行模块路径与就绪日志解析器。桌面 CI 还会构建完整上游应用并打包各操作系统目标，从而覆盖真实的生产依赖闭包。

## Alternatives considered

**通过 `file://` 加载 `apps/web/dist` 并添加 IPC 传输。** 这符合上游文档中的未来 Electron 传输设计，但当前客户端连接、插件 bundle 加载与 host API 都使用 Web 服务器。在上游尚未提供该传输前实现 IPC 会改动多个上游 package，并扩大合并冲突面。

**启动 `dsh web` 后打开系统浏览器。** 这能保留服务器，但无法提供桌面应用或可安装的原生窗口。

**打包单独复制的 Web 应用与服务器。** 副本会偏离上游 workspace 图，使日常上游发版变成人工对账。

## Consequences

桌面应用继承上游 Web 行为，并通过普通 Git 合并更新，保留很小的下游专属覆盖层。本地 HTTP 监听仍会增加一个进程和一跳传输；它被限制在随机环回端口，并继续使用上游现有的 Host 检查。

发行包包含 Electron 和上游生产依赖闭包，因此比浏览器发行版更大。原生依赖必须兼容 Electron 的 Node ABI，跨平台打包 CI 是发布时验证该兼容性的证据。
