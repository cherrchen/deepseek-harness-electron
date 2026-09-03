# Agent Note: Electron 遵循 alpha.4 客户端与 Host 认证 API

Status: implemented

[English](2026-08-31-electron-alpha2-client-host-authentication.md) | 中文

## Problem

桌面组合通过已移除的 `dsh-client-runtime` 包加载客户端扩展，并把 Web 就绪行当作无需认证的源。当前 Web Host 输出启动 token URL，要求 HTTP 与 WebSocket 流量携带绑定访问主体的 cookie，并通过 Cordis 上下文及各自所属包暴露客户端服务。保留旧假设会使初始进程看似启动成功，但 Electron 渲染进程仍未认证，运行时插件测试也会解析到陈旧的已发布包。

## Decision

Electron 客户端扩展直接使用 Cordis `Context`。存储辅助函数来自 `dsh-client-store`，slot 注册来自 `dsh-client-ui-renderer`，session 列表类型与服务来自 `dsh-api-session-controller`。Details Host 将 session controller 声明为注入的客户端依赖，Git 的独立 fixture 则打包兼容 alpha.4 的 Details Host 产物。下游包的对等依赖声明所属客户端包，开发依赖使用 `workspace:`，使仓库测试覆盖已同步的源码。

Electron 监管器保留完整的环回就绪 URL。`HarnessProxy` 只交换一次启动 token，仅保存返回的 cookie 键值对，并把该 cookie 附加到每个代理 HTTP 请求和 `/api/remote.mux` WebSocket 握手。preload 持有的 `MessagePort` 会双向传递文本帧，使远程 mux 能够发送客户端请求并接收 Host 响应。渲染进程既不接收启动 token，也不接收 cookie。bootstrap 提取器会先解码 Host 的 HTML 属性实体，再加载组合脚本 URL。

独立插件锁文件通过精确的最短发布时间豁免接纳已同步的 alpha.4 DSH 包。除非构建或测试会执行某个包的安装脚本，否则仍拒绝该脚本；当前所需的 `dsh-subprocess-local`、`node-pty` 与 `koffi` 构建均获明确允许。

## Verification

Electron 测试覆盖 token 解析、token 到 cookie 的交换、已认证 HTTP 请求、已认证 WebSocket 创建、Details Host 组合以及运行时插件热重载。Git 与 Details Host 独立套件解析 alpha.4 已发布客户端产物。完整构建以及真实的 `pnpm dsh web` 与 Electron 启动会覆盖组装后的应用。

## Alternatives considered

**为已移除的包保留兼容垫片。** 这会保留陈旧的职责划分，并使下游插件依赖同步源码不再提供的 API。

**通过每个代理 URL 传递启动 token。** Host 只接受 token 用于根路径交换，把它暴露给渲染进程还会无必要地扩大进程凭据的可访问范围。

**使用浏览器 session 作为 Host cookie jar。** Electron 在 Main 中终止自定义 scheme，因此 Host HTTP 与 WebSocket 连接都从 Main 发起，需要由 Main 统一持有凭据。

## Consequences

桌面插件遵循与 Web 应用相同的客户端服务职责划分，Main 仍是唯一可以访问已认证 Host 源的进程。WebSocket 传输增加一个直接 `ws` 依赖，使 Main 可以提供 cookie 请求头。Host 认证机制发生变化时，必须同时更新就绪解析器、HTTP 代理、WebSocket 工厂及其测试。
