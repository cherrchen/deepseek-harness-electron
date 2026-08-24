# Agent Note: Electron runtime plugin client bundles emit automatic JSX

Status: implemented

[English](2026-08-25-electron-runtime-plugin-automatic-jsx.md) | 中文

## Problem

Electron 用 [`build-runtime-plugins.mjs`](../../../../apps/electron/scripts/build-runtime-plugins.mjs) 重新构建 runtime 插件的 Client artifacts。esbuild 的默认 JSX 变换是经典的 `React.createElement`，除非最近的 `tsconfig.json` 设置 `jsx: react-jsx`。Details Host 包内的 `tsconfig.json` 是一份 `"files": []` 且没有 `jsx` 设置的 solution 文件，并且 [`DetailsHost.tsx`](../../../../apps/electron/runtime/plugins/ui-details-host/src/client/DetailsHost.tsx) 没有 React 值导入。因此构建出的 `lib/client.js` 会调用 `React.createElement`，而 `React` 不在作用域内。首次渲染抛出 `ReferenceError: React is not defined`；slot 错误边界 abdicate DetailsHost；上游 DetailsPanel 仍是 `details` 的 winner。Git 的 composer chip 仍能工作，因为它的 Client bundle 以 automatic JSX 预构建。点击该 chip 仍会调用 `ctx.shellDetails.open('git')`，所以第三栏会打开，但其标题是 DetailsPanel 的空状态文案，而不是 Git。Brand 与 Plugin Manager 各自有 `src/client/tsconfig.json` 并 extends `tsconfig.runtime-client.json`，因而掩盖了同一构建默认值。[必需 portable UI 基础设施](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.zh.md) 决策仍负责说明 Electron 为何从 subtree 源码重新构建 Details Host。

## Decision

`buildClientHalf` 在 esbuild client 构建上设置 `jsx: 'automatic'`，使每个 runtime 插件 Client bundle 都发出 `react/jsx-runtime`，而不论最近的 `tsconfig.json` 如何。[`runtime-plugins.spec.ts`](../../../../apps/electron/tests/runtime-plugins.spec.ts) 中的 fixture 构建器使用同一选项。聚焦的 Electron 测试固定该构建器选项，并固定生产环境 Details Host 的 `lib/client.js` 依赖 `react/jsx-runtime` 且不发出 `React.createElement`。`react/jsx-runtime` 仍是基线 client external。

## Alternatives considered

**在 `DetailsHost.tsx` 中加入 `import React from 'react'`。** 经典 JSX 随后能在该文件中找到 `React`。之后任何没有附近 `jsx: react-jsx` tsconfig、也没有 React 值导入的 runtime 插件 TSX，仍会在首次渲染时抛出同样的 `ReferenceError`。

**给 Details Host 增加 `src/client/tsconfig.json`，与 Brand 一致。** esbuild 会为该包拾取 `react-jsx`。对最近的 `tsconfig.json` 是 solution 文件或未设置 `jsx` 的任何插件，构建器仍会默认使用经典 JSX。

**加载 Details Host 独立 tsdown Client artifact，而不是用 runtime 插件构建器重新构建。** Electron 的 runtime 插件清单用同一构建器从 subtree 源码重建 Host 与 Client。为单个包开特例会拆开该清单。

## Consequences

消费者 `open(id)` 在加载重建后的 `lib/client.js` 之后会渲染 DetailsHost 占用的栏。覆盖范围是构建出的 Client artifact，而不是 headed Electron 窗口。Git 仍是 `ctx.shellDetails` 的 ecosystem 消费者；此变更不向 Details Host 添加 Git 专用 API。
