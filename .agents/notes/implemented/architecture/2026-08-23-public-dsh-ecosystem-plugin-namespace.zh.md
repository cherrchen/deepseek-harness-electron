# Agent Note: 公共 DSH 生态插件 namespace

Status: implemented

[English](2026-08-23-public-dsh-ecosystem-plugin-namespace.md) | 中文

## Problem

Desktop 产品功能需要独立 npm releases，同时不能创建 Electron-only plugin model，也不能让 portable behavior 依赖 Desktop runtime。下游 fork 还需要一条不会被 upstream synchronization 覆盖的路径。

## Decision

`packages/dsh-electron/**` 是位于默认上游拥有的 `packages/**` tree 中的下游 namespace island。每个 direct child 通过 Git subtree 镜像 canonical standalone repository，并保留自己的 npm version、registry semver dependencies 与预构建 Host 和 Client artifacts。

`@dsh-electron/dsh-plugin-*` 标识公共 DSH ecosystem features。Publisher scope 不表示 Electron requirement。Portable plugins 使用上游 DSH/Cordis services；Desktop-aware plugins 保持 main fiber portable，并在 optional `ctx.inject(['desktop'], ...)` child fiber 中针对实际消费的最小 structural interface 安装 native behavior。`@dsh-electron/dsh-electron-*` 继续保留给 `apps/electron/runtime/plugins/` 下的 Desktop-required adapters 与 infrastructure。

Upstream sync merge driver 在普通 conflicts 中保留该 namespace；upstream tree 首次声明 `packages/dsh-electron` 时，workflow 在 merge 前停止。Workspace check 向 pnpm 查询 resolved package graph，并拒绝任何被排除在该 graph 外的 downstream subtree package。

Electron 把标准 ecosystem packages 声明为 dependencies，发现其已安装 artifacts，将它们链接进受监督 Host profile，并通过 `runtime/host.patch.yml` 挂载。其 custom-scheme handler 将已知 Host 读取路径和所有非读取请求发往受监督进程，使插件自有的 Connection RPC channel 不会与 Renderer 文件路由冲突。Desktop runtime builder 继续只编译 `apps/electron/runtime/plugins/` 下 Electron 自有的 adapters。

## Alternatives considered

**Electron Plugin SDK。** 独立 manifest、loader、context 与 lifecycle 会重复 Cordis service injection、fibers、configuration、Host／Client composition 和 UI slots，并迫使一个产品功能发布两套不兼容 artifacts。

**全部下游功能都放在 `apps/electron/runtime/plugins/`。** 这会让 package location 暗示 Desktop ownership，并诱使原本 portable 的功能依赖 preload provider 或 Electron-specific build process。

**要求完整 Desktop contract package。** 公共插件会耦合到一个 provider 与所有无关 Desktop capabilities。Structural typing 允许其它 DSH desktop runtime 提供完全相同的 enhancement methods，而无需采用 Electron infrastructure。

## Consequences

Native DSH 与 Electron 加载同一个 package version 和同一套 artifacts。Desktop capability 缺失或卸载时只影响 optional child fiber。Repository checks 在接受 canonical registry ranges 与 standalone build configuration 的同时，验证每个 subtree package 的 invariant source 和 publication metadata。下游 fork 必须维护显式 sync protection、standalone dependency ranges、artifact compatibility tests，以及与每个 canonical plugin repository 的 subtree synchronization。Electron 协议路由由聚焦单元测试覆盖；keyless browser snapshot harness 无法执行 Electron custom-scheme 请求。
