# 当前架构总览

- **Status**: Current（以下均可用当前仓库与测试验证）

## 组成

```text
┌─ Host（Cordis plugin，src/index.ts + src/service.ts）──────────┐
│ requires ctx.subprocess，provides ctx.git                      │
│ 每条 git 命令 = 可执行文件 + 分离 argv，绝不 shell              │
│ 可选 Connection 子 fiber：注册 loopback /git RPC 通道           │
└──────────────┬─────────────────────────────────────────────────┘
               │ RPC（status / diff / log / stage / commit / branch …）
┌─ Client（src/client/）─────────────────────────────────────────┐
│ 主 fiber：全部 portable 贡献                                    │
│  · composer 分支选择器 + 变更文件指示器（slot 注入）             │
│  · 三个右侧边栏 tab type：git.changes / git.diff / git.graph   │
│  · git-commit-message 设置卡（有 ctx.settingsScope 时）         │
│  · commit message 生成（host LLM runtime，建议式）              │
│ 子 fiber ctx.inject(['desktop'])：reveal / openPath / 通知      │
└────────────────────────────────────────────────────────────────┘
```

## 关键结构事实

- **Host service**：通过 `ctx.subprocess` 启动 `git`（可执行名或绝对路径 + 分离 argv）。Status 用 porcelain v2 + NUL 路径分隔；branches 用 `for-each-ref`；commit 历史用固定字段数的分页 `git log`（`GIT_LOG_FORMAT`），Graph 据此增量加载。丢弃（discard）通过显式的 index / worktree / clean 操作序列实现，Client 侧强制两步确认。
- **RPC**：DSH Web 宿主存在时，Connection 子 fiber 注册 loopback `/git` 通道；过期输出（stale mutation）被丢弃，文件名按字面 pathspec 处理。
- **右侧边栏集成**：Client manifest 以 `inject` 声明运行时依赖 `ctx.sidebarRight` / `ctx.sidebarRightTabs`；对 sidebar 包只有 `import type`（动态 plugin 不得 import 其他包的运行时值），bundle 中类型被擦除，故无 `external`。阶段一向 `ctx.sidebarRightTabs.register` 注册三个 tab type（changes/graph 是 page type，diff 是 resource type，pattern `dsh-resource://git/diff/**`）；阶段二把 body 注入 `sidebar.right.pane.tab` 座（key 为 definition id）。导航统一走 `ctx.sidebarRight.openTab(kind)` 与 `openResource(address, { params })`：changes/graph 由侧栏按 kind 每 pane 去重，diff 以精确地址为 tab 身份，重复打开 reveal 既有 tab 并递增 `navigation.revision`；参数类型通过 `SidebarRightResourceParamsMap` 模块扩充。tab 栏、guide 页、停靠几何与面板宽度由右侧边栏（基于 ui-dockkit）拥有。Diff 结果是面板局部的：controller 只提供无状态的 `fetchDiff`，每个 Diff surface 持有自己的在途请求与结果（按仓库根 + tab 地址为键，乱序完成互相不可见），故分屏、浮动窗口与同文件的 staged/worktree 两个 tab 永不互串正文。changes/graph 另在 `sidebar.right.pane.tab.title` 座注册 live title（diff chip 是语言无关的文件名，不注册），已打开的 chip 随语言切换更新，而非冻结在打开时刻的文本。provider 卸载只移除 tab type 注册，保留 tab 记录：上游 body 座转为其 "unavailable" 兜底，重新注册后正文恢复。
- **可移植 / 原生分离**：主 fiber 不 require `desktop`；子 fiber `ctx.inject(['desktop'], ...)` 只接受 `shell.showItemInFolder`、`shell.openPath`、`notification.show`。缺 Desktop 时核心操作全部可用，仅原生动作不显示。
- **Graph layout engine**（`src/client/graph/`）：纯逻辑模块——不访问 Git、不依赖 React、不触碰 DOM，可独立测试；输出 geometry 与 Canvas 2D 绘制解耦。设计决策与不变量见 [Git Graph Layout Engine](../reference/git-graph-layout.md)、[ADR-0001](../decisions/ADR-0001-graph-lane-not-owned-by-branch.md)、[ADR-0002](../decisions/ADR-0002-graph-lane-cap-max-three-lanes.md)。
- **Commit message 生成**：Host 侧独立 LLM 请求（不经会话上下文，无 KV Cache 影响）；需要 LLM runtime 与可解析模型，否则 Client 报告 `git/generation-unavailable`。配置结构见根 README [Configuration](../../README.md#configuration)（canonical）。

## 验证方式

- `pnpm test`（单元 + 客户端规格，临时仓库与机器可读输出）；
- `pnpm test:artifact`（针对构建产物 lib/client.js 的 bundle/manifest 断言）；
- Graph 拓扑不变量：`tests/graph-layout.client.spec.ts`、`tests/graph-history.client.spec.ts`。

## 相关文档

- [requirements](../requirements/scope-and-requirements.md) —— 架构满足的需求与约束。
- [reference](../reference/README.md) —— Graph layout engine 等稳定技术参考。
