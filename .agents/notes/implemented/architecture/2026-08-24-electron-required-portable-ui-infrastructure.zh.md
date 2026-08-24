# Agent Note: Electron 必需的 portable UI 基础设施

Status: implemented

[English](2026-08-24-electron-required-portable-ui-infrastructure.md) | 中文

## Problem

AppFrame 的 `details` 栏是单一 slot，由上游 DetailsPanel 占用。Desktop 需要一个可供其他 client 插件占用的共享 details host：启动时不得抢走该栏，不得作为用户可禁用的生态成员，也不得做成 Electron-only overlay。该包必须仍是公共 portable DSH 插件，源码真源不能是 Electron monorepo。

## Decision

`@dsh-electron/dsh-client-ui-details-host` 是 Electron 必需的 portable DSH UI 基础设施。

源码真源是 `cherrchen/dsh-client-ui-details-host`。`apps/electron/runtime/plugins/ui-details-host` 是 git subtree 镜像。修改独立仓库，再执行 `git subtree pull`；不要把镜像当作真源来打补丁。Electron 从 subtree 源码重新构建 Host 与 Client artifacts。独立仓库的 `lib/` 是公共 npm 产物，不是 Electron 的加载真源。

该包是必需的 `runtime/host.patch.yml` 挂载项，不是 `dshElectron.ecosystemPlugins` 的成员。发现结果仍报告 `source: desktop-runtime`、`required: true`、`manageable: false`。

`ctx.shellDetails` 是 Cordis service。启动只注册该服务，不注册 `details` occupant。`open(id)` 以 `DETAILS_HOST_PRIORITY`（`-1`，低于上游默认 `0`）注册 DetailsHost，声明 `shell.details.surface`，要求该 id 存在，再调用 `ctx.layout.openDetails()`。id 不存在时释放 takeover 并抛错，第三栏不会显示空白。切换 id 时保持 DetailsHost 已挂载。`close()` 可幂等：`layout.closeDetails()`，清空 `activeId`，释放 takeover，恢复上游 occupant。活动 surface 卸载、surface crash、会话切换与 host 卸载也会 close。

此类是“每个 portable 公共插件都应放在 `packages/dsh-electron/`”的例外：Desktop 始终挂载它，用 runtime plugin builder 重建它，同时仍禁止 Electron、`ctx.desktop` 与 preload import。用户可禁用的产品功能留在生态 island（[公共 namespace](2026-08-23-public-dsh-ecosystem-plugin-namespace.zh.md)）。

## Alternatives considered

**包一加载就占用 `details`。** 拒绝：没有 surface 打开时，启动会抢走或清空第三栏。

**作为 `packages/dsh-electron/` 下的生态插件发布。** 拒绝：用户可以通过 Plugin Manager 禁用必需 UI 基础设施。

**先在 Electron 镜像里开发再拷回。** 拒绝：两棵树会争夺真源。

**DOM 查询、React portal、CSS overlay，或修改上游 DetailsPanel / `ui-layout` / `ui-conversation`。** 拒绝：单一 slot shadowing 与注册释放已经能恢复前一个 winner。

**由 Details Host 控制第三栏 geometry。** 拒绝：`ctx.layout.openDetails()` / `closeDetails()` 已经拥有栏宽与动画。

## Consequences

Electron 启动时加载 Details Host MUST 让上游 DetailsPanel 继续作为 `details` winner。`open` / `close` MUST 是真正的 slot shadowing。本次改动中 Git 不是 Details Host 的消费者。

独立包测试用 dummy `test.alpha` / `test.beta` surface 钉住公共 controller。Electron 测试针对 workspace SlotRegistry 钉住同一次 takeover，以及 required-vs-ecosystem 分类与 bootstrap overlay 成员资格。覆盖范围不包括 headed Electron 窗口对空闲第三栏的视觉检查。
