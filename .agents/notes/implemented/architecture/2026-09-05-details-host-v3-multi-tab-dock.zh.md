# Agent Note: Details Host v3 作为多标签右侧工作区 Dock

Status: implemented

[English](2026-09-05-details-host-v3-multi-tab-dock.md) | 中文

## Problem

Details Host v2 只承载一个激活 surface，用单一全局 close 控件关闭，隐藏即遗忘。Git 插件需要三个可同时到达的 surface（changes、diff、graph）以及发现它们的入口，而当时可选的路径要么是上游 `apps/web` 布局改动，要么是再做一个下游插件去重新打开 host——两者都不对。详情 surface 也没有故障隔离：一个坏掉的插件 surface 会拖垮整个 dock。

## Decision

`@dsh-client-ui-details-host`（canonical `cherrchen/dsh-client-ui-details-host`，镜像于 `apps/electron/runtime/plugins/ui-details-host`）演进为 **API version 3**：一个完全由插件内部拥有的应用级多标签右侧工作区 dock。

* **标签页，而非单一 surface。** 注册表驱动的标签模型按 `dedupeKey` 创建或复用标签页，按最近使用排序以支持 back 手势，并在固定上限之外逐出最旧者。关闭是逐标签的；隐藏 dock 会保留标签页及其状态。全局 close 已移除。
* **Launcher。** 注册表驱动的 Launcher 页面（零硬编码卡片）在 dock 没有标签页时打开；feature 插件通过 `ctx.shellDetails.registerLauncher(contribution)` 贡献卡片。
* **隔离。** 每个 surface 渲染在 error boundary 内，抛错的占用者无法拖垮 dock 或应用框架。
* **导航。** 统一的 `details.open()` API 取代零散的 surface 调用；payload 经由既有 `DetailsSurfacePayloadMap` declaration merge 获得类型。
* **Toggle 留在 host 内。** 详情 toggle 由 Details Host 包自身注册进 `conversation.session.header.utilities`；dock 可见性由 host 根节点上的 `ResizeObserver` 自测——零上游改动。
* **归属保持分离。** AppFrame 拥有布局与可见性，Details Host 拥有注册表、标签页与 Launcher，插件只拥有自己的领域 surface。AppFrame 与 Details Host 都不含 Git 专属代码。

Git 插件是参考消费者：它贡献 `git.changes`、`git.diff`、`git.graph` 三个 surface 与两张 Launcher 卡片，peer 范围钉住 Details Host `>=0.3.0 <0.4.0`。

## Alternatives considered

**独立的下游 `ui-details-toggle` 插件。** 拒绝：toggle 是 host chrome，且第二个插件在不新增上游 seam 的前提下无法观测 dock 可见性。

**让上游 `apps/web` 布局 store 感知 dock。** 拒绝：对下游工作而言 `packages/**` 属于上游所有；ResizeObserver 自测在不动上游的情况下拿到同样的信号。

**保留单一 surface，让 Git 渲染自己的内部标签。** 拒绝：标签身份、去重、MRU 排序与 Launcher 都是 host 关注点；每个插件各自重实现会成倍增加代码并割裂 UX。

## Consequences

公共 client API 版本以破坏性方式从 2 升到 3；消费者钉住 `>=0.3.0 <0.4.0`。标签状态仅存于内存——隐藏 dock 会保留，但重载 client 半不会。标签上限是固定值，不可配置。Launcher 卡片文案由插件自带，尚未本地化。在 ModuleLoader host 之外直接 require client bundle 现在也可行（bundle 会回退到普通 CJS exports），这使 canonical 仓库与 monorepo 的 fixture 驱动测试都保持真实。
