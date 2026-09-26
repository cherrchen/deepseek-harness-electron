# Agent Note: Electron 插件 pending 标记、profile 锁与启动恢复

Status: implemented
Archived: 2026-09-26

[English](2026-09-13-electron-plugin-pending-and-recovery.md) | 中文

## Problem

Desktop 的 package mutation 只在一个 Electron 进程内进行。`PluginRestartTracker` 只在内存中，`PluginMutationCoordinator` 只串行化本进程。`dsh plugin` 中途崩溃会留下半改的 web profile 且没有磁盘标记，下一实例会带着未修复状态启动 Host。Host 未能就绪时，Main 只调用 `dialog.showErrorBox` 然后退出。主窗口从该 Host 加载 `dsh-client-web`，Host 挂掉后用户没有可操作的修复界面。

## Decision

Main 拥有插件 desired state。`PluginPackageService` 在 spawn `dsh plugin` 之前写入 `$DSH_HOME/electron/packages-pending`，并以 `openSync(..., 'wx')` 持有 `$DSH_HOME/profiles/web/lock`。锁 owner 先是 Main PID，子进程期间换成 child PID，结束后写回 Main。新实例在 `process.kill(pid, 0)` 报告活 owner 时等待，ESRCH 后回收锁文件，超时进入恢复而不启动 Host。

启动对账是只读的：解析 profile 依赖、修复 hot-plugin symlink、重列 catalog，然后清除标记。它不回滚磁盘。锁只串行化 Desktop 进程；手工 `dsh plugin --profile web` 不参与该锁。

pending 对账失败、Host 就绪行超时，或无法读取 profile catalog 时，Main 打开双语 `data:text/html` 恢复窗，不加载 Host 也不加载 `dsh-client-web`。用户可以禁用全部可管理插件（system/required 行仍保留），或清空 `profileManaged`/`disabled` 而不删除 profile 依赖。两个动作都会从 `dsh.profile.bundles` 移除无法加载的 Bundle，但保留其 dependency entry，确保重试不会再次应用已知无效的 Bundle。其他启动失败仍走 error box。

崩溃注入钩子在 pending 写入后、命令结束后、inspect 后、或清除标记前中止，这样测试可以留下残留而不真杀 Electron。

命令执行器在向锁归属回调传递已启动的 PID 前注册 error 和 close 处理器。启动错误仅在 close 后报告。归属交接抛错时，Main 终止子进程并等待 close 后才报告失败，避免事务清理与所持有的子进程竞争。Reserved-name 自动回滚使用相同的子进程归属交接，并在 close 后把归属恢复给 Main。回调失败后立即返回会使包进程在释放锁后继续运行。命令执行器测试覆盖事件顺序和真实的可执行文件缺失；这些失败不产生 Session 事件，也不改变 GUI 展示。

恢复操作持有 profile 锁直至完成偏好写入、组合更新和 pending 标记删除。workspace 策略写入也在 pending 对账后取得该锁。超时 Host 必须完成关闭才提供恢复；关闭失败不可重试，否则另一个 Host 可能与仍存活的子进程重叠。修复后，启动流程重新加载并对账持久化偏好，用于组合配置与生命周期构造。YAML 策略合并使用解析后的映射，确保行内映射和带引号键保留用户覆盖值。

## Alternatives considered

**像 Desktop project-manager 那样遇到活 owner 直接抛错。** 拒绝：孤儿 pnpm 子进程仍是活 owner，新实例必须等待。

**对 pnpm 磁盘状态做 staging、journal 或 rollback。** 拒绝：Desktop 不拥有第二套 package manager；对账只修复链接与 catalog 事实。

**把恢复 UI 放进主 BrowserWindow。** 拒绝：该窗口加载的是受监督 Host 的内容。

## Consequences

install 与 mutatePackage 共用一次 pending/lock 事务。聚焦的 Electron 测试注入崩溃、等待活 PID、回收死 PID，并通过假 `createWindow` 驱动恢复窗，不依赖真实 GUI。手工 `dsh plugin` 残留仍靠启动对账或 Repair。
