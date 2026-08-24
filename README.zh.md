# `@dsh-electron/dsh-client-ui-details-host`

[English](README.md) | 中文

标准 DSH/Cordis Client 插件，在 AppFrame 详情栏中承载一个活动详情 surface。该包是可移植的 `platform:web` UI 基础设施：不依赖 Electron、Node 或 Desktop。npm scope 标识发布者，不是运行时要求。

## 组合

Host 插件是空的 Loader 席位。Client 插件需要 `slots`、`layout` 与 `sessions`，并提供 `ctx.shellDetails`。加载插件不会占用 `details`；在 `open()` 成功之前，上游 DetailsPanel 仍是 winner。

`ctx.shellDetails.open(id)` 以低于上游占位者的 shadowing priority 把 DetailsHost 注册进单一 `details` slot，声明 `shell.details.surface`，等待该 id materialize，然后调用 `ctx.layout.openDetails()`。缺少 id 时会在抛出前 dispose takeover，因此第三栏不会渲染空白。切换到另一个已注册 id 时 DetailsHost 保持 mounted，并且不会关闭该栏。`close()` 是幂等的：关闭该栏、清除活动 id，并 dispose takeover，使上游占位者返回。

其他 Client 插件通过声明感知的 injection 贡献 surface：

```ts
ctx.slots.inject('shell.details.surface', () =>
  ctx.slots.register({
    name: 'shell.details.surface',
    id: 'example.alpha',
    label: 'Example Alpha',
  }, ExampleSurface))
```

第一版保持 N 个已注册 surface 以及 0 或 1 个活动 surface。它不实现 split pane、导航历史、payload routing、pinning 或 persistence。面板几何仍由 `ctx.layout` 负责。

卸载活动 surface、切换当前 session、surface 渲染崩溃或卸载 Details Host，都会关闭 takeover 并恢复上游占位者。之后重新加载时，`slots.inject()` 会针对新的声明生命周期重新 materialize 贡献。

## 开发

使用 Node.js `^22.19` 或 `>=24` 以及 pnpm 11。本仓库是源码真源；DeepSeek Harness Desktop 通过 git subtree 镜像它。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
```

## Model Experience

无。本包贡献面向人的 Client UI 基础设施，不注册模型工具或 prompt 内容。

#### KV Cache effect

无。本包不添加、替换或保留模型请求 token。

## Known Limitations and Deferred Work

- **单一活动 surface** — 同一时间只渲染一个 `shell.details.surface` id；不实现 split、stacked 或 pinned 详情栏。
- **无 payload routing** — `open(id)` 只选择已注册的贡献，不向 surface 传入参数。
