# Agent Note: Desktop audit fixes for Host isolation and plugin races

Status: implemented

[English](2026-09-06-desktop-audit-host-isolation-and-plugin-races.md) | 中文

## Problem

一次桌面审计标出了现有测试未钉住的缺陷。带 scheme-relative 路径的渲染进程 URL 可以把 Main 的 Host cookie 送到 loopback 之外。Git 变更会在工作区已经换绑之后仍发布快照，而一个本身也是 Git pathspec magic 的文件名可以丢弃其他文件的修改。失效的 Graph 请求会使 loading latch 保持设置，迟到的 Diff、生成与能力结果仍能替换更新的状态。暂存后再次编辑的新增或重命名无法丢弃，取消暂存可能在 index 中留下重命名的删除侧。被截断的 Git 输出可能被当作完整结果解析。Porcelain v2 未合并记录会把多余的对象哈希写进路径。Desktop 在退出或更新前排空 Host 时，插件安装或启用仍可能在跑。Details Host 只在当前会话修剪已卸载的 surface，其 Launcher inject 也可能在插件变更后保留旧条目。渲染进程 WebSocket 替身在原生回退上无法 `send`。就绪握手之后 Host stdout 仍被缓存并反复解析。

## Decision

`HarnessProxy` 把每个代理 HTTP URL 留在已就绪的 loopback origin 上，规则记在[客户端与 Host 认证说明](2026-08-31-electron-alpha2-client-host-authentication.zh.md)。Git Client 变更会捕获工作区代次和仓库 root，串行重叠的 RPC，并且只在该绑定仍有效时发布成功或失败。Diff、Graph、生成和能力请求还会捕获绑定及各自单调递增的请求 id，因此只有最新请求可以更新状态；Graph 失效会清除 loading latch，使 surface 能请求替代页。Git 变更操作在 Client、RPC 与服务中携带 porcelain status、目标路径和重命名原路径；强制移除 index 能丢弃暂存后再次编辑的新增和重命名，而重命名取消暂存会重置两个路径。Git 子进程拒绝 lossy stdout 或 stderr，而不是解析截断结果，并设置 `GIT_LITERAL_PATHSPECS=1`，使选中的路径就是一个文件名。Porcelain v2 的 `1` / `2` / `u` 记录按 Git 格式文档取路径，包括带空格的名字。`PluginMutationCoordinator.shutdown()` 拒绝后续变更并等待已接受队列结束；退出、重启和更新安装共用这一排空。Details Host 在 surface 卸载或崩溃时遍历每个保留会话，为这些实例发出 `surface-unload`，只向当前会话发布 UI，并在恢复标签前再次确认贡献仍在。Launcher 条目通过 Details Host observable 发布，因此注册和释放会更新已经挂载的渲染器。非 Host WebSocket URL 返回原生实例。Host stdout 在进程存活期间继续转发，但就绪 URL 一旦找到或启动失败就丢弃握手缓存，并在此之前限制其大小。

## Alternatives considered

**在 Main 中跟随 Host 重定向，并在 origin 变化时丢掉 cookie。** 不予采用，因为代理没有追逐 `Location` 的产品需要，且 `redirect: 'manual'` 已与自定义 scheme 路径一致。

**工作区变化时取消进行中的 Git RPC。** 不予采用，因为当前 Git RPC 通道无法中止 Host 调用；在代次提升后忽略过期快照并跳过仍排队的工作已经足够。

**只用路径和暂存状态标识 Diff。** 不予采用，因为同一文件与同一侧的第二个请求可以在这两个字段不变时取代第一个请求。

**把 Launcher 卡片保留在 slot inject 结果中。** 不予采用，因为渲染器会缓存该结果；贡献注册表必须通过 observable hook 发布实时列表。

**只在 discard 上传递 `:(literal)`。** 不予采用，因为 stage、unstage 和 diff 使用同一用户路径，仍会留下 magic pathspec 缺口。

**继续用 `pluginLifecycle.list()` 作为更新排空。** 不予采用，因为 `list()` 只读 inventory，并不等待 `PluginMutationCoordinator`。

**把原生 WebSocket 的 `send` 与 `readyState` 代理到 `DesktopWebSocketImpl`。** 不予采用，因为返回原生实例能保留标准对象；此前只复制部分方法，才让 `send` 仍绑定 Host-stream 实现。

## Consequences

Main 仍是唯一可以附加 Host cookie 的进程，并且只能把它附加到已就绪的 loopback origin。Git Details 操作不能再对用户已离开的仓库执行暂存、提交或丢弃，选中的 magic 文件名也不会扩大到其他路径，过期异步读取也无法替换更新结果或让 Graph 永久 loading。丢弃和取消暂存会保留复杂 Git 变更的两个路径，包括暂存路径再次编辑后的已确认丢弃，不完整 Git 输出会失败而不是展示缺失的仓库状态。插件包变更会在拆掉 Host 之前结束或失败。卸载 Details surface 后，稍后切回会话时不会看到已移除的贡献，Launcher 卡片会在插件变更后更新。打开非 mux WebSocket 的客户端插件可以在 `open` 之后发送。长时间运行的 Host 日志不再为握手解析器在 Main 中无限积累。

## Testing

Electron 规格覆盖带伪造 cookie 的 scheme-relative 代理 URL、coordinator shutdown 对比 `list()`、原生 WebSocket 的 `open`/`send`，以及握手缓存丢弃与大小上限。Git 规格覆盖延迟 stage 与 Graph refresh、跨工作区绑定的 Diff、同一文件的重复 Diff 请求、暂存后再次编辑的新增和重命名、重命名取消暂存、lossy 输出、真实 `:(glob)*.txt` discard 且 `other.txt` 保持脏、porcelain `u` 记录，以及真实 UU 冲突路径。Details Host 规格在会话 A 打开标签、切到 B、卸载 surface，并断言 A 恢复时没有标签且收到 `surface-unload`，还确认 Launcher 注册和释放会发布给已挂载 Host。
