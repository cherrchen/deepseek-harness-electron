# Agent Note: Electron 托管的网络设置

Status: proposed

[English](2026-09-20-electron-managed-network-settings.md) | 中文

## Problem

Desktop 当前分别继承 Chromium、Electron Main、受监督的 Harness 进程、包管理子进程和 Agent 进程的网络行为。代理环境变量能覆盖部分 Harness HTTP 客户端，但它们不提供操作系统代理发现、PAC 或 WPAD 执行、SOCKS5、跨这些进程边界的单一严格路由，也没有安全保存上游代理凭据的位置。

Default 行为必须保持不变，显式 Direct 模式则必须从 Desktop 控制的子进程中删除代理环境变量。Managed 模式绝不能把所选代理失败转换为隐式备选路由或直连。

## Proposal

Electron Main 将拥有唯一的 `DesktopNetworkController`。该控制器将应用版本化 preferences、加密 secret、Electron 代理配置、子进程环境、重启决策、诊断和失败展示。Runtime plugin 将消费类型化 `ctx.desktop.network` capability，不会获得 Electron 对象、原始 IPC、上游凭据或环境修改 API。

打包的 Rust helper 将拥有环回 HTTP Gateway、操作系统代理 provider、PAC 执行、connector、认证 adapter、路由失败分类和系统策略 watcher。Main 将从应用自有资源路径启动 helper，并通过 stdio 协商版本化 JSON Lines 协议。Managed Harness 和 Desktop 自有子进程只能看到环回 Gateway URL。

System 解析可以为诊断返回有序路由，但执行只接受第一条最终路由。显式 `DIRECT` 结果是有效的已选路由；connector 失败不授权检查列表剩余项。

## Foundation

Preferences 文档使用 schema version 1，并保留更新通道、一份 Manual draft、Agent 选择和诊断 URL。Writer 在 Desktop 单实例 writer queue 中重新读取并合并，flush 随机独占 sibling，再原子 rename，并在平台支持时 flush 父目录。无效 Network 数据回退到 Default，但不丢弃有效更新通道。

Main-only secret store 使用 Electron `safeStorage` 加密值，拒绝 Linux `basic_text`，在 preferences 中只存储 branded reference，并只向未来 Renderer consumer 返回 `hasPassword`。One-shot override 只接受 Default，并在使用前删除。

环境策略是纯 mode 决策。Default 原样复制输入；Direct 删除所有大小写代理变量和 `NODE_USE_ENV_PROXY`；System 和 Manual 通过环回 Gateway 路由 Desktop 自有子进程；除非用户选择启用，Agent 进程保留现有环境，但 Direct 始终删除代理变量。

Bootstrap Rust helper 绑定临时 IPv4 环回 socket，支持有上限的 JSON Lines `hello` 和 `shutdown`，将所有未实现 capability 报告为 false，并用本地 fixture 证明 CONNECT 字节中继。打包把已编译可执行文件复制到 `resources/network-runtime`；路径解析绝不搜索 `PATH`。Desktop CI 在 Linux 和 Windows 上运行 Rust 测试，每个 native release job 都在 `electron-builder` 收集资源前构建 helper。

macOS 可行性探测在 arm64 开发主机上成功调用 `CFNetworkCopySystemProxySettings` 和 `CFNetworkCopyProxiesForURL`。Windows WinHTTP/SSPI、Linux GNOME/KDE 与 PAC sandbox 行为、macOS PAC 与变更通知、签名包启动和安装程序收录仍属平台验收工作；在这些路径拥有可执行证据前，capability flag 保持 false。

## Alternatives considered

**使用 Chromium system proxy 配置作为共享 authority。** Chromium 可能应用 proxy-list fallback，且无法管理 Node 或普通子进程 transport。它无法跨 Desktop 网络平面强制所需的第一路由失败行为。

**把平台网络放入 Electron Main 或 N-API addon。** 这避免了另一个进程，但平台 API、PAC 执行、tunnel 和认证将共享 Electron Main 的 crash 和 ABI 边界。Helper 隔离 native 失败，且不耦合 Electron 或 Node ABI。

**把代理凭据写入环境变量。** 这会让 Harness、工具、诊断和模型控制的子进程读取上游 secret。Gateway 把凭据保留在 Main/runtime 内存中，只暴露无凭据的环回 endpoint。

**复用仓库 atomic-write package。** Electron TypeScript program 使用 package-local `rootDir`；经仓库 path map 解析 workspace source 会把该 package 拉到 compiler program 之外。Desktop-local writer 添加所需文件和目录 flush，并只限于单实例 Desktop 持久化边界。

## Acceptance criteria

Preferences migration、不覆盖的 partial update、validation、secret isolation、环境策略、one-shot override 和 controller lifecycle 测试通过，且 Default 不修改子进程环境或 Electron 代理状态时，M1 完成。

只有在 Gateway 支持 Manual HTTP、HTTPS 和 SOCKS5，system provider 通过 native Windows、macOS、GNOME 和 KDE 测试，PAC 和认证 capability matrix 有可执行证据，每个 managed 网络平面使用相同严格所选路由，且 Settings UI 不暴露 secret 后，整个功能才验收。

## Risks

PAC engine 和集成代理认证是平台专属的代码执行与凭据边界。不可用的实现必须 fail closed 并报告不支持的 capability，而不是宣称支持或选择 Direct。

Release 验收需要 native runner、签名身份、安装程序和真实桌面代理环境。仓库测试可以验证路径和 artifact，但不能取代这些平台观测。
