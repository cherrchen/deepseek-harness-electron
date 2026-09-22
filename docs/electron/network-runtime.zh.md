# Desktop Network Runtime

[English](network-runtime.md) | 中文

## 概要

Desktop Network Runtime 通过唯一 Manual 代理或 System 策略选择的首个最终路由转发 HTTP 和 CONNECT 流量。失败绝不授权改用第二个代理或 Direct。Runtime 与 Main 客户端是可独立使用的基础设施；Desktop 启动、Electron session、updater、插件命令和 Settings UI 尚未启用它们。

## 目录

- [验证](#verification)
- [控制与路由](#control-and-routing)
- [系统策略](#system-policy)
- [凭据与 TLS](#credentials-and-tls)
- [生命周期与限制](#lifecycle-and-limits)
- [局限](#limitations)

<a id="verification"></a>

## 验证

安装仓库要求的 Node.js、pnpm 和 Rust 工具链后，在仓库根目录执行：

```sh
pnpm --filter @dsh-electron/dsh-electron test:network-runtime
```

该命令运行 Rust 组件和可执行程序测试，准备 release 二进制，并用该二进制测试 Main 客户端。DSH transport fixture（测试前置数据）使用真实的源码 HTTP 代理库、无法解析的目标域名，以及本地 HTTP、TLS 和 SOCKS5 fixture。测试需要已安装 workspace 依赖，不调用模型或公网测试端点。TLS fixture 使用独立测试信任根，不修改操作系统信任库。Desktop CI 运行 macOS、Windows 和 Linux 原生测试。GNOME 构建需要 GLib 开发库和桌面 schema。安装程序收录、企业 WPAD 环境及签名 macOS 包启动仍属于发布验收工作。

<a id="control-and-routing"></a>

## 控制与路由

[NetworkRuntimeClient](../../apps/electron/src/network/runtime-client.ts) 使用私有 stdio 从固定应用路径启动可执行程序，协商协议版本 1，关联请求 ID，并在传输或协议失败时终止进程。它持续读取 native stderr，但不发布其中内容。Runtime 仅向 stdout 写 JSONL 帧，向 stderr 写固定的脱敏诊断。

支持的命令为 `hello`、`configure`、`get_system_snapshot`、`reload_system`、`get_diagnostics` 和 `shutdown`。`configure` 接受 `{ config, limits?, system? }`，配置使用 [RuntimeNetworkConfig](../../apps/electron/src/network/domain.ts) 联合类型。Direct 显式允许直连。System 声明已编译的原生后端；不支持的桌面环境拒绝配置。不支持的命令和无效 payload 返回错误响应；格式错误的 envelope 发出 `runtime_warning`。它们均不改变活动配置。

Gateway 仅在 `127.0.0.1` 上监听操作系统分配的临时端口。配置成功前，它关闭传入连接。Manual HTTP 和 HTTPS 使用 absolute-form HTTP 请求或 CONNECT 隧道；HTTPS 加密到代理的连接。SOCKS5 使用无认证协商，并将域名目标直接交给代理，不在本地解析。转发前会移除传入的代理凭据和逐跳 header；只有活动 Manual 凭据能够认证上游代理。

代理失败产生脱敏 `proxy_failure` 事件和 HTTP 502 响应。HTTP 407 区分 `PROXY_AUTH_REQUIRED` 与 `PROXY_AUTH_REJECTED`，并发出对应凭据事件。目标 CONNECT 被拒绝属于目标失败，不属于代理 incident。普通 origin HTTP 状态码原样传递。事件包含路由元数据，绝不包含请求 URL、用户名、密码或认证 header。

<a id="system-policy"></a>

## 系统策略

Provider 提供快照、目标路由解析、重新加载和监听操作。Windows 读取当前用户的 WinHTTP 设置，并通过 WinHTTP 执行 PAC/WPAD。macOS 读取 CFNetwork 字典并使用 CFNetwork 执行 PAC。Linux 通过 `proxy-watch` 读取 GNOME GSettings 或 KDE5/6 kioslaverc；拒绝环境变量和 portal 回退。无法读取的设置、不支持的桌面、畸形路由及 PAC 失败均产生明确错误。

只有首个最终路由会传入 connector。剩余有序条目仅在 `alternativeRoutes` 中用于诊断。显式 bypass 和 `DIRECT` 允许直连；代理不可用绝不允许直连。CFNetwork 用于 HTTPS 目标的代理使用 HTTP CONNECT。macOS 拒绝不支持的 PAC `HTTPS` 传输指令，避免原生解析器丢弃它。System 代理凭据和集成认证不被接受。

每次解析都在固定 Runtime 可执行程序的私有子进程中运行，并受执行时限约束。Linux PAC 在 QuickJS 中执行，提供标准 PAC helper、DNS 和本地地址查询，不提供文件系统、环境变量或模块加载 API。PAC 下载使用经过证书验证的 HTTP/HTTPS，不使用环境代理、不跟随重定向，并限制响应大小。QuickJS 还限制堆内存和执行时间。原生 PAC 引擎依赖操作系统隔离及 worker 时限；`pacMemoryBytes` 仅作用于 QuickJS。

快照暴露 SHA-256 策略、网络和所选路由指纹，绝不暴露原始设置、PAC 源码、PAC URL 或目标 URL。原生设置通知触发读取；有界轮询同时检测接口变化、macOS 网络状态及 Linux 解析器和路由变化。指纹变化会取消旧连接，并发出 `system_policy_changed` 或 `network_changed`。`get_system_snapshot` 只读取；`reload_system` 读取并使连接失效。两者均不测试连通性或选择备用路由。

`system` 必须同时提供四个字段；省略时使用以下默认值。Main 请求时限必须长于 `resolveTimeoutMs`。

| 字段 | 默认值 | 接受范围 |
| --- | --- | --- |
| `resolveTimeoutMs` | 10000 | 100–30000 |
| `pollIntervalMs` | 5000 | 200–300000 |
| `pacMaxBytes` | 1048576 | 1024–4194304 |
| `pacMemoryBytes` | 67108864 | 1048576–268435456 |

<a id="credentials-and-tls"></a>

## 凭据与 TLS

Main 在 `configure` stdin payload 中提供可选 Manual 凭据。客户端绝不将其放入 argv 或环境变量。Runtime 仅在内存中保留凭据，并在释放时清零自己持有的凭据字符串和认证缓冲区。替换配置会取消其连接并释放该代凭据；关闭流程释放活动配置。JavaScript 字符串和 HTTP 库内部缓冲区副本不提供取证级内存擦除保证。

Rustls 通过 `rustls-platform-verifier` 使用操作系统证书验证器。证书验证始终启用，包括主机名验证。无效证书报告 `PROXY_CERT_INVALID`；其他 TLS 握手失败报告 `PROXY_TLS_FAILED`。产品没有额外 CA 证书、关闭验证或客户端证书的输入选项。

<a id="lifecycle-and-limits"></a>

## 生命周期与限制

配置在替换前完成验证；被拒绝的配置保留活动路由。替换会取消现有 HTTP 连接和隧道。关闭流程停止接收连接，让活动工作在配置的时间内完成，再取消剩余工作，并仅在全部跟踪任务结束后确认。Stdin EOF 同样关闭 Gateway。崩溃使 Gateway 端点消失；客户端报告失败，不自动重启或选择其他路由。

`limits` 必须同时提供四个字段；省略时使用以下默认值。无效限制会导致配置被拒绝。

| 字段 | 默认值 | 接受范围 |
| --- | --- | --- |
| `connectTimeoutMs` | 30000 | 1–300000 |
| `headerTimeoutMs` | 30000 | 1–300000 |
| `shutdownTimeoutMs` | 5000 | 1–300000 |
| `maxConnections` | 256 | 1–4096 |

TCP/DNS 建连和代理握手各自受连接超时限制。传入 header 和上游响应 header 受 header 超时限制。已建立的隧道和响应 body 持续流式传输，直到完成、配置取消或关闭。每代配置限制准入连接数，包括已升级的隧道。控制帧上限为 1 MiB，HTTP header 上限为 64 KiB。诊断事件使用有界队列；饱和时丢弃事件，不累积内存或阻塞流量。Main 请求和关闭超时是构造参数，必须长于配置的 drain 时限。

<a id="limitations"></a>

## 局限

实现覆盖 Network Settings 的 Runtime 和 System provider 里程碑。生产网络平面接入属于 M4；全局 incident 和交互式凭据恢复属于 M5；Settings 和诊断测试命令属于 M6。因此应用 Default 行为保持不变。不支持 SOCKS5 认证、任意 HTTP Upgrade、UDP、自定义代理 CA 配置、客户端证书、Manual bypass 和集成代理认证。

[网络设置提案](../../.agents/notes/proposed/feature/2026-09-20-electron-managed-network-settings.zh.md) 负责整体架构及剩余接入工作。
