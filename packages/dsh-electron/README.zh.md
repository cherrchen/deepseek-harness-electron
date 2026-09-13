---
description: "面向 DeepSeek Harness Desktop 镜像的公共下游 DSH 生态插件组，包含 portable Host 与 Client 功能。"
kind: "package-group"
---

# 公共 DSH 生态插件

[English](README.md) | 中文

<a id="summary"></a>
## 概述

从此组安装 portable 或 Desktop-aware 产品功能，它们是标准 DSH 插件。每个包都是其 canonical npm 仓库的 Git subtree；本树只针对同步后的 Harness 验证该插件。

`@dsh-electron/dsh-plugin-*` 名称并不表示必须使用 Electron。Portable 工作使用上游 DSH 服务；可选的原生增强通过 `ctx.inject(['desktop'], ...)` child fiber 接入。

把 Desktop-required 适配器以及始终挂载的 UI（例如 Theme Studio）放在 `apps/electron/runtime/plugins/`。此处不要加入 Electron import、preload global 或第二个 Desktop-specific 变体。紧急的 mirror 修复拆到 canonical 仓库；若上游声称拥有 `packages/dsh-electron`，则停止 upstream sync。

<a id="table-of-contents"></a>
## 目录

- [概述](#summary)
- [开发备注](#dev-note)

<a id="dev-note"></a>
## 开发备注

无。
