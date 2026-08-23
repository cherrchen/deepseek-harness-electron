# 公共 DSH 生态插件

[English](README.md) | 中文

此下游自有的 namespace island 下的包是标准 DSH/Cordis 插件，通过 Git subtree 从各自的 canonical repository 镜像。Canonical repository 是 NPM 发布的真源；此 monorepo 副本针对同步的 Harness 源码验证集成。

`@dsh-electron/dsh-plugin-*` 命名 portable 或 Desktop-aware 产品功能。Publisher scope 不表示 Electron requirement。Portable 行为只能依赖上游 DSH 服务；可选的原生增强使用 `ctx.inject(['desktop'], ...)` child fiber，并以包内 structural interface 声明它实际消费的确切方法。

`@dsh-electron/dsh-electron-*` 命名 Desktop-required 适配器与 infrastructure。此类包属于 `apps/electron/runtime/plugins/`，不应放在本目录。

每个 subtree 包拥有一个 NPM 版本，以及一套由 Native DSH 与 Electron 原样使用的 Host 和 Client 产物。此处不得引入 Electron import、preload global、Electron provider dependency、`workspace:` 发布范围或第二个 Desktop-specific 包变体。

在此 mirror 中制作的紧急集成修复必须在下游改动合入前拆分到 canonical plugin repository 的 review branch。Upstream sync 在上游声明 `packages/dsh-electron` 时停止；维护者必须决定所有权，不得让自动化覆盖任一来源。
