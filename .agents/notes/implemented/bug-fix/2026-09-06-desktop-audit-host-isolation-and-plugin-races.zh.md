# Agent Note: Desktop audit fixes for Host isolation and plugin races

Status: implemented

[English](2026-09-06-desktop-audit-host-isolation-and-plugin-races.md) | 中文

## Problem

2026-09-06 的桌面审计标出了现有测试未钉住的八项缺陷。带 scheme-relative 路径的渲染进程 URL 可以把 Main 的 Host cookie 送到 loopback 之外。Git 变更会在工作区已经换绑之后仍发布快照，而一个本身也是 Git pathspec magic 的文件名可以丢弃其他文件的修改。Porcelain v2 未合并记录会把多余的对象哈希写进路径。Desktop 在退出或更新前排空 Host 时，插件安装或启用仍可能在跑。Details Host 只在当前会话修剪已卸载的 surface。渲染进程 WebSocket 替身在原生回退上无法 `send`。就绪握手之后 Host stdout 仍被缓存并反复解析。

## Decision

`HarnessProxy` 把每个代理 HTTP URL 留在已就绪的 loopback origin 上，规则记在[客户端与 Host 认证说明](2026-08-31-electron-alpha2-client-host-authentication.zh.md)。Git Client 变更会捕获工作区代次和仓库 root，串行重叠的 RPC，并且只在该绑定仍有效时发布成功或失败。Git 子进程设置 `GIT_LITERAL_PATHSPECS=1`，使选中的路径就是一个文件名。Porcelain v2 的 `1` / `2` / `u` 记录按 Git 格式文档取路径，包括带空格的名字。`PluginMutationCoordinator.shutdown()` 拒绝后续变更并等待已接受队列结束；退出、重启和更新安装共用这一排空。Details Host 在 surface 卸载或崩溃时遍历每个保留会话，为这些实例发出 `surface-unload`，只向当前会话发布 UI，并在恢复标签前再次确认贡献仍在。非 Host WebSocket URL 返回原生实例。Host stdout 在进程存活期间继续转发，但就绪 URL 一旦找到或启动失败就丢弃握手缓存，并在此之前限制其大小。

## Alternatives considered

**在 Main 中跟随 Host 重定向，并在 origin 变化时丢掉 cookie。** 不予采用，因为代理没有追逐 `Location` 的产品需要，且 `redirect: 'manual'` 已与自定义 scheme 路径一致。

**工作区变化时取消进行中的 Git RPC。** 不予采用，因为当前 Git RPC 通道无法中止 Host 调用；在代次提升后忽略过期快照并跳过仍排队的工作已经足够。

**只在 discard 上传递 `:(literal)`。** 不予采用，因为 stage、unstage 和 diff 使用同一用户路径，仍会留下 magic pathspec 缺口。

**继续用 `pluginLifecycle.list()` 作为更新排空。** 不予采用，因为 `list()` 只读 inventory，并不等待 `PluginMutationCoordinator`。

**把原生 WebSocket 的 `send` 与 `readyState` 代理到 `DesktopWebSocketImpl`。** 不予采用，因为返回原生实例能保留标准对象；此前只复制部分方法，才让 `send` 仍绑定 Host-stream 实现。

## Consequences

Main 仍是唯一可以附加 Host cookie 的进程，并且只能把它附加到已就绪的 loopback origin。Git Details 操作不能再对用户已离开的仓库执行暂存、提交或丢弃，选中的 magic 文件名也不会扩大到其他路径。插件包变更会在拆掉 Host 之前结束或失败。卸载 Details surface 后，稍后切回会话时不会看到已移除的贡献。打开非 mux WebSocket 的客户端插件可以在 `open` 之后发送。长时间运行的 Host 日志不再为握手解析器在 Main 中无限累积。

## Testing

Electron 规格覆盖带伪造 cookie 的 scheme-relative 代理 URL、coordinator shutdown 对比 `list()`、原生 WebSocket 的 `open`/`send`，以及握手缓存丢弃与大小上限。Git 规格覆盖跨工作区绑定的延迟 stage、真实 `:(glob)*.txt` discard 且 `other.txt` 保持脏、porcelain `u` 记录，以及真实 UU 冲突路径。Details Host 规格在会话 A 打开标签、切到 B、卸载 surface，并断言 A 恢复时没有标签且收到 `surface-unload`。
