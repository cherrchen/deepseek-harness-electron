# Agent Note: Electron 拥有的运行时插件热插拔

Status: implemented

[English](2026-08-24-electron-runtime-plugin-hot-plug.md) | 中文

## Problem

Electron 过去使用静态 `apps/electron/runtime/host.patch.yml` overlay 启动 Host，并始终挂载 `@dsh-electron/dsh-plugin-git` 之类的 bundled ecosystem 插件。用户无法在不重启受监督 `dsh web` 进程的前提下禁用、重新启用或 reload 某个 bundled 插件，Electron 也没有一个持久化的 desired-state owner 来承载插件生命周期意图。

## Decision

Electron Main 拥有 bundled ecosystem 插件的 runtime desired state。

`apps/electron/src/runtime-plugins.ts` 仍负责发现并校验每个 bundled 插件 artifact，且仍在 Host 启动前完成全部链接，但现在会把它们划分为：

* 必需的桌面运行时适配器，它们保持为不可管理；
* 可管理的 bundled ecosystem 插件，其运行时存在性由生成的 Cordis 组合控制。

Electron 在 `$DSH_HOME/electron/` 下写入 `plugin-state.json` 与 `plugins.cordis.yml`。`plugin-state.json` 仅保存持久化的 disabled package-name 集合。`plugins.cordis.yml` 是 manageable ecosystem 插件的生成 desired roster，使用 package name 作为稳定 entry id，并保留打包时的 ecosystem 顺序。

Host bootstrap 现在来自运行时渲染的 `electron-host.patch.yml`。该 overlay 保留桌面必需基础设施行，为 `plugins.cordis.yml` 打开窄 HMR，并安装一个稳定的 `cordis:include` seat 指向该生成 roster。静态 ecosystem 行不再位于 bootstrap overlay 中。

Electron 通过 `PluginLifecycleController` 应用运行时变更，该 controller 串行化 `list()`、`enable(name)`、`disable(name)` 与 `reload(name)`。controller 重写 `plugins.cordis.yml`，然后轮询现有 Host `pluginInventory.list()` Remote 真相，直到目标包消失或进入 `active`。失败时，它会先恢复上一份生成 roster，再向外报告错误。controller 还会在连续的生成文件写入之间等待一个 HMR quiet window，避免后续 mutation 落在前一个 watcher 的 debounce 窗口内。

生成的 include 文件位于 `$DSH_HOME/electron/` 下，而嵌套 `cordis:include` 会从该目录解析 bare package name。因此 Electron 除了保留现有 `$DSH_HOME/profiles/node_modules` fallback 外，还会在 `$DSH_HOME/electron/node_modules` 下保留 bundled 插件 symlink。运行时启用状态仍由生成组合拥有；这一额外链接位置仅用于为嵌套 include 子树保留包解析能力。

Renderer refresh 仍是 Electron 拥有的边界。只有在 Host 稳定之后，并且仅当受管理插件的 artifact 带有 client half（`hasClient === true`）时，Electron 才会 reload BrowserWindow。纯 Host 插件仅通过 Cordis 生命周期完成热插拔；Electron 不尝试在现有页面内协调 client 图。

## Alternatives considered

**保留 bootstrap patch 中的静态 ecosystem 行，并把 symlink 存在性当作启用状态。** 拒绝：链接属于分发关注点，而不是运行时意图；把 symlink 存在性当作状态会把生命周期控制耦合到文件系统修复。

**为插件生命周期变更重启受监督 Host 进程。** 拒绝：该需求要求 Host 侧的真正 Cordis hot plug，而不是把进程级重启伪装成 reload。

**在证明下游路径之前，先把运行时组合所有权推到上游包。** 拒绝：该里程碑适合放在下游拥有面中完成，而且下游实现已经证明了当前仍重要的上游限制：嵌套 include 的包解析需要额外的 `$DSH_HOME/electron/node_modules` 链接面。

**对每次 client 插件变更都做 Renderer 模块图热协调。** 拒绝：上游 client 图仍期待一条全新的 bootstrap 路径；Electron 拥有的整页 reload 是更窄且已发货的边界。

## Consequences

Electron 运行时生命周期现在拥有一个 desired-state owner 与一个 runtime truth source。启动阶段与后续生命周期 mutation 都操作同一个生成的 `plugins.cordis.yml` 路径，因此首次 Host 挂载与后续运行时变更保持一致。

已发货行为由聚焦的 `apps/electron` 覆盖固定：overlay 渲染、plugin-state 解析、确定性 runtime config 生成、lifecycle controller 的回滚与串行化、bridge 暴露，以及通过 fixture 插件与 bundled Git 插件验证真实 Host disable/enable/reload 且 PID 保持不变。

如果上游未来提供能在嵌套 include 间保留包解析语境的原生运行时组合 API，或提供 client 图协调路径，Electron 可以替换生成文件后端并移除额外的 `electron/node_modules` 链接面，而无需改变公开桌面 bridge 的语义。
