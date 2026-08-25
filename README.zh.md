# `@dsh-electron/dsh-client-ui-details-host`

[English](README.md) | 中文

标准 DSH/Cordis Client 插件，在 AppFrame 详情栏中承载一个活动详情 surface。该包是可移植的 `platform:web` UI 基础设施：不依赖 Electron、Node 或 Desktop。npm scope 标识发布者，不是运行时要求。

## 组合

Host 插件是空的 Loader 席位。Client 插件需要 `slots`、`layout` 与 `sessions`，并提供 `ctx.shellDetails`。加载插件不会占用 `details`；在 `open()` 成功之前，上游 DetailsPanel 仍是 winner。

`ctx.shellDetails.open(id)` 仍然支持。当 surface 需要参数时，优先使用 v0.2 的 request 形式：

```ts
ctx.shellDetails.open({
  surfaceId: 'example.alpha',
  payload: { tab: 'diff' },
})
```

`open` 会先校验 surface，创建 surface instance，以低于上游占位者的 shadowing priority 把 DetailsHost 注册进单一 `details` slot，确认 DetailsHost 赢得该 cell，提交 instance，然后调用 `ctx.layout.openDetails()`。缺少或重复的 surface id，以及 takeover 冲突，都会抛出类型化错误并回滚，因此第三栏不会渲染空白 Host 状态。切换到另一个已注册 id 时 DetailsHost 保持 mounted，并且不会关闭该栏。`close()` 是幂等的：关闭该栏、清除活动 instance，并 dispose takeover，使上游占位者返回。

公开响应式状态通过 `getSnapshot()` / `subscribe()` 提供，可供 `useSyncExternalStore` 使用。每个 session 在内存中保留独立的 active instance 与有界 back stack（默认 push，可选 replace，支持 `back()` / dedupe）。能力协商使用 `apiVersion`（2）与完整 P2 `features` 集合。

插件可通过 `registerSurface()` 注册可选行为元数据，而无需替换 slot 贡献。生命周期回调覆盖 open/activate/deactivate/close；回调抛错只记日志，不会阻止 Host cleanup。Host header actions 贡献到 `shell.details.header.actions`，并按活动 surface id 过滤。

其他 Client 插件通过声明感知的 injection 贡献 surface。Host 通过 slot owner props 路由活动 instance：

```ts
ctx.slots.inject('shell.details.surface', () =>
  ctx.slots.register({
    name: 'shell.details.surface',
    id: 'example.alpha',
    label: 'Example Alpha',
  }, ExampleSurface))

// ExampleSurface 的 props 通过 PropsRuntime<'shell.details.surface'> 包含 detailsInstance
```

可选的 payload 类型通过对 Client 入口做 declaration merging：

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    'example.alpha': { tab?: string }
  }
}
```

未做 augmentation 的外部 surface 与未知 payload 仍然受支持。

本版本保持 N 个已注册 surface 以及每个 session 0 或 1 个活动 surface instance。它不实现 split pane、跨重启 persistence 或磁盘级 session history。面板几何仍由 `ctx.layout` 负责。

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

- **单一活动 surface** — 同一时间只渲染一个 `shell.details.surface` instance；不实现 split、stacked 或 pinned 详情栏。
- **仅内存 session 状态** — 进程重启后导航历史清空；不做 localStorage / IndexedDB / 文件持久化。
