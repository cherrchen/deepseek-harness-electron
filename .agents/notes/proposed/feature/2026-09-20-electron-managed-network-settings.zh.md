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

Main-only secret store 使用 Electron `safeStorage` 加密值，拒绝 Linux `basic_text`，在 preferences 中只存储 branded reference，并只向 Renderer consumer 返回 `hasPassword`。One-shot override 只接受 Default，并在使用前删除。

环境策略是纯 mode 决策。Default 原样复制输入；Direct 删除所有大小写代理变量和 `NODE_USE_ENV_PROXY`；System 和 Manual 通过环回 Gateway 路由 Desktop 自有子进程；除非用户选择启用，Agent 进程保留现有环境，但 Direct 始终删除代理变量。Desktop Host 用子类替换上游本地 subprocess provider，将 Main 单独提供的 Agent 策略应用于可执行文件查找、普通 spawn 和 PTY spawn。关闭 Agent 代理时，策略合并 Main 原有继承的代理值与 CLI 接受的 `.env` 层，因为 Host 在 CLI 读取这些文件前已继承 Gateway 值。此做法保留上游 provider 的进程约束与关闭行为，同时处理 Host 的 Gateway 环境。

[Rust Network Runtime](../../../../docs/electron/network-runtime.zh.md) 绑定临时 IPv4 环回 Gateway，支持版本化 JSONL 协商、经过验证的配置替换、HTTP/HTTPS/SOCKS5 Manual 路由和有界关闭。Main 客户端不搜索 PATH，直接启动准备好或已打包的可执行程序，通过 stdin 传递凭据，并在协议或进程失败时阻断网络。本地 fixture 通过三种 Manual 协议验证真实 DSH HTTP dispatcher。Electron Main 在 Harness 启动前配置 Runtime，将 Gateway 应用于 Electron app 与 Session，并向 Harness 和插件命令提供不含凭据的 Gateway 环境。Release 查询与 updater 元数据、下载共用 updater Session。

Main 负责 epoch 和 incident 的生命周期，不让 Gateway 持有 UI 状态。指纹变化会更新 System epoch；Manual 凭据应用和用户重载会创建显式 epoch。真实流量故障按 epoch、路由、错误类别和重试代去重。除非用户选择单次 Default 或二次确认永久 Default，原生对话框保留已选路由；Runtime 崩溃后仅在用户重试时重启 Desktop。独立的环回 listener 让 updater 流量使用同一所选路由，但不发布全局 incident。Manual Basic 凭据可保存到 Desktop 加密存储；System Basic 凭据仅限单个 Runtime 配置代和匹配的所选端点。不支持的认证方案会明确失败。

System provider 使用当前用户 WinHTTP、CFNetwork 及 GNOME/KDE 设置。每次解析都在有时限的 helper 进程中运行，Linux PAC 使用限制内存且不提供文件系统或环境变量 API 的 QuickJS context。原生设置通知和网络指纹使现有连接失效。macOS 原生测试覆盖有序 PAC 输出、畸形首项、可重复快照及重新加载；Desktop CI 负责 Windows WinHTTP 和隔离 GNOME/KDE 设置的执行验证。Windows 安装包冒烟检查要求存在已打包的 Runtime 可执行文件。签名 macOS 启动、企业 WPAD 实验环境和集成认证仍由操作者检查。

网络页面作为必需的 Desktop Client 插件注册到共享 Settings section。页面控件来自 `@deepseek-ai/dsh-client-ui-primitives`。它只使用封闭的 `ctx.desktop.network` capability；Main 将其接到受信任 IPC handler 和类型化 preload bridge。Main 再次验证配置，且只返回脱敏状态。连接测试使用 updater Session 中不产生 incident 的 Gateway；测试结果不影响保存，目标站点的 HTTP 响应表示可达，而 Gateway 错误单独标识。Client 用固定占位符表示已保存密码，只提交替换或移除动作，并在安全存储不可用时先询问是否丢弃新密码。页面列出已注册的 LLM provider，并要求显式填写 health URL；它不发送模型请求。原生对话框的导航请求经脱敏 Network 状态传递，并操作现有 Settings 控件，使下游快捷入口无需修改上游包。

## Alternatives considered

**使用 Chromium system proxy 配置作为共享 authority。** Chromium 可能应用 proxy-list fallback，且无法管理 Node 或普通子进程 transport。它无法跨 Desktop 网络平面强制所需的第一路由失败行为。

**把平台网络放入 Electron Main 或 N-API addon。** 这避免了另一个进程，但平台 API、PAC 执行、tunnel 和认证将共享 Electron Main 的 crash 和 ABI 边界。Helper 隔离 native 失败，且不耦合 Electron 或 Node ABI。

**把代理凭据写入环境变量。** 这会让 Harness、工具、诊断和模型控制的子进程读取上游 secret。Gateway 把凭据保留在 Main/runtime 内存中，只暴露无凭据的环回 endpoint。

**复用仓库 atomic-write package。** Electron TypeScript program 使用 package-local `rootDir`；经仓库 path map 解析 workspace source 会把该 package 拉到 compiler program 之外。Desktop-local writer 添加所需文件和目录 flush，并只限于单实例 Desktop 持久化边界。

**自行实现 HTTP、SOCKS 和 TLS。** Hyper 负责 HTTP framing 与流式传输，tokio-socks 负责 SOCKS5 协商，Rustls 与平台验证器负责 TLS 和系统证书验证。Runtime 负责路由选择与生命周期；复制这些协议库只会增加解析器及密码学维护负担，不会改变路由保证。

**把全部自动路由交给通用代理解析器。** 跳过畸形 PAC 条目、自动发现失败后回退静态设置或尝试后续代理的解析器会违反首路由规则。平台 API 提供策略；严格结果校验和单路由 connector 仍由 Runtime 负责。进程时限约束原生 PAC 和阻塞 DNS，避免阻塞 Gateway 控制循环。CFNetwork HTTPS 字典表示目标协议，因此映射到 HTTP CONNECT，而非到代理的 TLS 连接。

## Acceptance criteria

Preferences migration、不覆盖的 partial update、validation、secret isolation、环境策略、one-shot override 和 controller lifecycle 测试通过，且 Default 不修改子进程环境或 Electron 代理状态时，M1 完成。

只有在 Gateway 支持 Manual HTTP、HTTPS 和 SOCKS5，system provider 通过 native Windows、macOS、GNOME 和 KDE 测试，PAC 和认证 capability matrix 有可执行证据，每个 managed 网络平面使用相同严格所选路由，Settings UI 不暴露 secret，且发布检查覆盖环回绑定、混合端口 HTTP 代理和已打包的 Windows Runtime 路径后，整个功能才验收。

## Risks

PAC engine 和集成代理认证是平台专属的代码执行与凭据边界。不可用的实现必须 fail closed 并报告不支持的 capability，而不是宣称支持或选择 Direct。

Desktop CI 在 macOS、Windows 和 Linux 上运行 Network Runtime。仓库测试验证环回 Gateway、混合端口 HTTP 行为和已打包的 Runtime 路径。它们不能取代签名 macOS 启动、企业 WPAD 实验环境或集成认证。
