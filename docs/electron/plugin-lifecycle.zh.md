# Electron 插件生命周期

[English](plugin-lifecycle.md) | 中文

> 状态：**当前下游参考**
>
> 范围：`apps/electron/**`、`apps/electron/runtime/**`
>
> 读者：维护者、coding agent（编程智能体）、评审人与未来贡献者

## 目的

本文是 Desktop 插件 catalog、profile package lifecycle 与运行时生命周期的参考。

Electron 拥有插件的 desired state。DSH Host 拥有实际的 Cordis fiber state。运行时生命周期路径在不重启 Electron Main 与受监督 `dsh web` 进程的前提下桥接这两个事实。

## 受管理插件类别

`ProfilePluginCatalog` 会刷新并合并三种 ownership class：

* `runtime/plugins/` 下的 **system runtime 插件** 在 Host 启动前完成链接，且不允许用户管理。
* `dshElectron.ecosystemPlugins` 声明的 **bundled ecosystem 插件** 在 Host 启动前完成链接，允许用户管理，并通过 generated include file 进入组合。
* **Profile package** 是 `$DSH_HOME/profiles/web/package.json` 中通过 Desktop 安装或声明为 profile bundle 的 direct dependency。

链接本身不是启用状态信号。Electron 会把 bundled artifact 同时暴露到 `$DSH_HOME/profiles/node_modules` 与 `$DSH_HOME/electron/node_modules`；运行时启停仅由生成的 Cordis 组合控制。

同一真实 package name 重复时，system 与 bundled ownership 优先于 profile ownership。每个 entry 会分离 ownership、package kind（`runtime-plugin`、`bundle` 或 `dependency`）、installation source、activation mode、package health 与 Main-owned package action。只有采用 hot activation 的 package 带有 Host runtime state。

## 运行时拥有的文件

Electron 在 `$DSH_HOME/electron/` 下写入这些文件：

* `plugins.cordis.yml` 是 manageable 生态插件的生成 desired roster。
* `plugin-state.json` 保存持久化的 disabled runtime package name 与 Desktop-managed profile dependency membership。

Electron 还会在 Electron `userData` 下写入 `electron-host.patch.yml`，并将其传给 `dsh web --patch`。

bootstrap patch 只保留必需 runtime 插件行，为 `plugins.cordis.yml` 打开窄 HMR，并安装一个稳定的 `cordis:include` seat 指向该生成文件。bootstrap overlay 不列出各个生态插件。Details Host 与 Theme Studio 是必需行：它们不得进入 `dshElectron.ecosystemPlugins`。

## 启动顺序

Electron Main 以如下顺序启动 Host：

1. 解析 `DSH_HOME`；
2. 发现 distribution plugin，并刷新 `web` profile catalog；
3. 修复所有必需 symlink；
4. 加载 `plugin-state.json`；
5. 生成初始 `plugins.cordis.yml`；
6. 渲染 `electron-host.patch.yml`；
7. 启动 `dsh web --patch <electron-host.patch.yml>`。

启动阶段与后续生命周期变更都操作同一个生成的 `plugins.cordis.yml` 路径。

## 运行时操作

`PluginMutationCoordinator` 在 Electron Main 中串行化 install、update check、update、reinstall、remove、enable、disable 与 reload。每项 operation 都可能读取或修改 profile state，或重新生成完整 effective roster，因此不同 command 不使用独立 queue。`list()` 会在 operation 执行期间报告 Main 当前的 active operation。

`list()` 绕过 mutation queue，并发读取当前 Host inventory。因此 Renderer polling 能在 mutation 稳定期间观察 transition phase。在此期间，`desiredEnabled` 保持为最后一次成功持久化的状态；Renderer 会组合 Host runtime state 与当前 operation record，而不会把 desired state 当作进度信号。

这些操作通过重写 `plugins.cordis.yml` 来修改 desired state，然后轮询现有 Host `pluginInventory.list()` Remote 真相，直到目标状态稳定：

* **enable** 等待包出现且 fiber phase 为 `active`；
* **disable** 等待该包从 inventory 中消失；
* **reload** 移除该包、等待消失、恢复该包、再等待其变为 `active`。

若稳定失败，Electron 会先恢复上一份生成 roster，再向外报告失败。controller 还会在连续 mutation 之间等待一个 HMR quiet window，避免第二次生成文件写入落在前一次变更的 watcher debounce 窗口内。

## Desktop 管理 view

preload lifecycle group 通过 `@dsh-electron/dsh-electron-desktop-capabilities` 适配为 `ctx.desktop.plugins`。Desktop feature plugin 不直接读取 `window.deepseekDesktop.plugins`。

`@dsh-electron/dsh-electron-ui-plugin-manager` 在 upstream 拥有的 `settings.plugins.tab` slot 中注册 order 为 `20` 的 `installed` contribution。upstream Plugins section 继续拥有 navigation、tab chrome、selection、keyboard behavior 与 mount lifecycle；Electron 不注册另一个 `settings.section`。

“已安装”tab 仅在 mount 后读取第一份 catalog snapshot。它在主列表中展示 manageable plugin、bundle 与 plain dependency，并在默认折叠、只读的“系统组件”折叠区中展示必需 runtime 插件。搜索会在 client 侧过滤 package name、display name 与 description。

## Profile package 安装

“已安装”header 会打开一个包含 Registry、GitHub/Git 与 Local source 的对话框。本地安装使用 Electron native directory picker，并支持 `file:` 或 development `link:` 语义。Renderer 发送 typed request，不会获得 filesystem、child-process、shell-command 或 arbitrary pnpm access。

Electron Main 校验请求，把它转换成一个 pnpm-compatible spec，再调用 `dsh plugin --profile web add <spec>`。未指定版本的 Registry 请求会显式使用 `@latest`，从而替换已有 Git 或 local spec，而不是继续保留原 source。上游 dsh 仍负责 profile 初始化与 bundle 协调。Catalog identity 与 package kind 由 pnpm 写入的 installed dependency name 与 manifest 决定，而不是 request text；未发生变化的 Git 与 local spec 通过 pnpm 已写入的 dependency value 解析。

打包后的 Desktop 包含仓库 package-manager version 对应的 pnpm。`$DSH_HOME/electron/bin` 下的 generated platform shim 会通过 Electron Node mode 启动 bundled pnpm，Main 把该目录放到 child PATH 最前。用户不需要全局 Node.js、Corepack 或 pnpm。

普通 runtime 插件会进入 `plugins.cordis.yml`，并通过既有 lifecycle controller 热激活。Client-bearing 插件会在 Host 稳定后刷新 Renderer。Healthy Bundle 显示**已安装**，因为 `profile-restart` 是其 activation mode，并不表示存在未应用的变更。Plain dependency 显示**已作为依赖安装**且不提供 runtime lifecycle control。只有 patch 能够解析，并且 manifest 声明的 Host 与 client package export 都存在时，上游协调才会把 Bundle 加入 profile stack。Electron 还会在激活前校验普通 runtime 的 Host 与 client target。pnpm 失败后留下的 direct dependency、因无效而未进入 profile stack 的 Bundle、缺失的 installed package，以及缺少声明产物的 runtime 插件，都会显示为**安装未完成**，并提供可用于 repair 或 remove 的 package action。Electron 不会自动重启 Host。

System 与 bundled package name 是 reserved name，因为 Host 解析 package 时 profile 的 `node_modules` tree 具有优先权。针对这些名称的 Registry request 会在安装前失败。如果 Git 或 local source 解析为 reserved name，Electron 会在报告冲突前移除新加入的依赖。Profile 中已存在的冲突依赖必须先通过 `dsh plugin --profile web remove <package-name>` 移除，Desktop 才能启动。

安装会使用 Harness process permission 执行 third-party package 与 plugin code，位于 agent sandbox 之外。对话框会提醒用户只安装可信 package。Stable error category 会区分 invalid request、missing package 或 path、Git failure、blocked install-time build script、profile reconciliation 与 activation failure，同时保留 technical details。Blocked-build 诊断会列出从 pnpm 输出解析出的实际 package，不会把已有 dependency 的脚本归因给本次请求的插件。如果 pnpm 在失败前改写了 profile dependencies，错误会记录这一事实，Renderer 也会刷新 catalog，而不会声称已回滚。

## Profile package update、repair 与 removal

Renderer 只按 direct dependency name 请求 package lifecycle operation。Main 会重新读取 catalog entry、requested dependency spec、source、kind、ownership、health 与 permitted action；Renderer field 永远不会授权 mutation。System 与 bundled package 不能 update、reinstall 或 remove。Profile Registry package 支持遵循 range 的 update check、update、reinstall 与 remove。Git 与本地 `file:` dependency 从其 recorded source refresh。Healthy 本地 `link:` dependency 使用 runtime reload 而不是 package update；incomplete link 可以 repair。Unknown profile dependency 默认只允许 remove。

只有用户选择**检查更新**时才会执行 update check。Main 通过 `dsh plugin --profile web outdated --format json` 调用 bundled pnpm，将结果过滤到 Registry-owned direct dependency，并保持 `wanted` 与 `latest` 的区别。Registry 与 Git update 调用 `dsh plugin --profile web update <name>`；Registry target 因此由现有 dependency range 选择，且不会选择新的 major version。Copied local package 与 explicit reinstall 调用 `add <requestedSpec> --force`，remove 调用 `remove <name>`。上游 dsh 仍是 `dsh.profile.bundles` reconciliation 的唯一 owner。

在 update、reinstall 或 removal 修改 package file 之前，`PluginLifecycleController.quiesceForPackageMutation()` 会从 generated roster 中移除 active hot plugin，并等待 Host inventory 报告 absent。此 temporary quiescence 不会编辑 persisted disabled preference。如果 package command 失败，且 dependency manifest、lockfile 与 installed package manifest 均未变化，controller 会恢复之前的 runtime。如果任何 captured disk state 已变化，Electron 会让插件保持 unloaded、刷新 catalog 并报告 `profile-changed`；它不会执行可能处于 partial 状态的 artifact。Removal 成功后会从 `profileManaged` 与 `disabled` 同时删除 package name。

每次 update 或 reinstall 成功后都会重新 inspect package kind。Managed runtime package 会 hot-activate，但 startup kind 为 Bundle 时除外。从 running Bundle transition 后绝不 hot-load 新 runtime entry，因为 Host 仍包含 startup Bundle composition。进入或离开 Bundle 的任何 transition 都会建立 pending restart change。

Runtime reactivation 会在 package Host entry 上使用 Main 生成的 revision query。如果只是移除并恢复同一 bare package request，Node ESM cache 会继续执行上一 package version。Host settlement 同时匹配 stable nested loader entry id 与 module request，因此 cache-busted request 仍会投影到 canonical package name。

`PluginRestartTracker` 会在 Host 启动前 capture profile package baseline，并在 Electron Main memory 中保存 pending Bundle install、update、reinstall 与 removal change。Catalog row 消失后仍保留 removal tombstone，并把 same-version source refresh 视为 change。安装一个 baseline 中不存在的 Bundle 后再将其移除，会取消 pending change。新的 Main process 会 capture 新 baseline，因此 Desktop restart 后 pending restart state 会自动清零，无需修改 `plugin-state.json` version 2。

一项 mutation 进行期间，该 view 会短周期轮询 `list()`，并禁用所有插件的 conflicting action。搜索、滚动与“系统组件”折叠操作仍可使用。命令稳定后，view 停止轮询，读取一份最终 snapshot，并使用 Main 与 Host 真相替换本地 lifecycle state。Package action 位于 overflow menu；存在 Registry update 时，该 update 会成为 row primary action。Removal 必须确认。即使 removal 已删除 package row，pending Bundle change 仍会显示在 banner 中。Runtime command failure 会报告 operation 与 rollback，但不会向用户渲染原始 rejection；package failure 会显示其 stable recovery outcome。

## Renderer refresh 边界

Electron 只会在 Host 稳定之后，并且仅当 manageable 插件分发产物带有 client half（`hasClient === true`）时刷新 BrowserWindow。

纯 Host 插件不会触发 Renderer reload。

该边界是刻意的：

* Host 插件生命周期保持为真正的 Cordis hot plug。
* Renderer 插件图协调仍是由 Electron 拥有的整页 reload。
* Electron 不尝试对上游模块图做 client 侧热协调。

## 状态文件行为

`plugin-state.json` 保存带 version 的当前格式对象：

```json
{
  "version": 2,
  "disabled": ["@dsh-electron/dsh-plugin-git"],
  "profileManaged": ["@example/dsh-plugin-example"]
}
```

行为规则：

* 缺失文件表示空 `disabled` 与 `profileManaged` set；
* version 1 会迁移到 version 2，且不会丢失 disabled name；
* 非法 JSON 记录 warning 并回退，不会导致启动崩溃；
* 重复名称会被去重；
* stale disabled 与 profile-managed name 会在协调时移除。

## 嵌套 include 限制

生成的 `plugins.cordis.yml` 位于 `$DSH_HOME/electron/` 下，而嵌套 `cordis:include` 会从该目录解析 bare package name。

因此 Electron 除了保留 `$DSH_HOME/profiles/node_modules` 这一现有 profile fallback 外，还会在 `$DSH_HOME/electron/node_modules` 下保留 bundled 插件链接。

若上游未来提供能在嵌套 include 间保留包解析上下文的原生运行时组合 API，这一额外链接面可以移除。

## 验证

聚焦的 `apps/electron` 覆盖验证：

* runtime overlay 渲染与占位符替换；
* plugin-state migration、解析、持久化与 stale-name 协调；
* catalog precedence 与 runtime-plugin/bundle/dependency classification；
* Registry、Git 与 local request normalization，覆盖 POSIX 与 Windows path；
* bundled pnpm shim generation、update-result parsing、install-service reconciliation 与 package mutation recovery；
* runtime config 的确定性生成；
* lifecycle controller 的成功路径、回滚、串行 mutation、并发读取与 client-refresh 分支；
* lazy `ctx.desktop.plugins` forwarding 与 Plugin Manager slot redeclaration；
* install-dialog source switching、native directory selection、update check 与 badge、package menu、removal confirmation、pending restart tombstone、mutation polling 与 global locking；
* 通过 fixture 插件与 bundled Git 插件验证真实 Host 的 disable/enable/reload，并确认 PID 保持不变；
* 验证真实 Host 中 local package 从 v1 refresh 到 v2 再 removal 时 PID 保持不变，以及 pinned pnpm 通过带空格路径刷新 copied source；
* 针对当前 SlotRegistry 验证 Details Host 空闲启动、dummy surface 接管 `details`、close 后恢复上游 occupant，以及 host unload/reload。
