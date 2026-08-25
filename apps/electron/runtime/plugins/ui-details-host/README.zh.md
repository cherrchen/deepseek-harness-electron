# dsh-client-ui-details-host

[English](README.md) | 中文

可移植 DSH/Cordis Client 插件，在 AppFrame 详情栏中承载一个活动详情 surface。该包是 `platform:web` UI 基础设施，不依赖 Electron、Node 或 Desktop。npm scope `@dsh-electron/` 标识发布者，不是运行时要求。

本仓库是源码真源。[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 通过 git subtree 镜像它，并将 Details Host 作为必需内置基础设施挂载。同一 package 可在 DeepSeek Harness Desktop 与标准 DSH Web host 中原样运行。

## 安装

本包处于试验开发阶段，计划以 `@dsh-electron/dsh-client-ui-details-host` 发布到 npm；在此之前请从本仓库安装。

**DeepSeek Harness Desktop** — Details Host 始终启用，无需单独安装。

**DSH Web** — 构建 `lib/` 后将其加入 profile：

```sh
pnpm install
pnpm build
dsh plugin --profile web add .
```

或直接从 GitHub 安装：

```sh
dsh plugin --profile web add github:cherrchen/dsh-client-ui-details-host
```

`dsh plugin add` 会激活随包附带的 `cordis.patch.yml` 层，把插件行插入组合配置。无需手动编辑 `cordis.yml`。

Client 半通过 package 的 `exports["./client"]` 入口解析。Peer 依赖（`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-slots` 与 React）必须已存在于 host 组合中。

## 用户体验

加载 Details Host 不会打开详情栏。在 feature 插件调用 `ctx.shellDetails.open()` 之前，上游 DetailsPanel 仍保持可见。

终端用户只有在某个 feature 插件打开已注册的 `shell.details.surface` 后，才会看到 AppFrame 第三栏。Details Host 提供栏位 chrome（resize handle、关闭控件、header actions）并路由活动 surface 主体。关闭栏位后，控制权交回上游 DetailsPanel。

## 公共 API

### `ctx.shellDetails`

Client 插件提供 `ctx.shellDetails`，即带 `apiVersion` `2` 与完整 P2 `features` 集合的 `ShellDetailsController`。类型与常量从 `@dsh-electron/dsh-client-ui-details-host/client` 导入。

| 方法 / 属性 | 作用 |
|---|---|
| `open(id)` | 按 id 打开已注册 surface（兼容重载）。 |
| `open({ surfaceId, payload?, navigation? })` | surface 需要参数或导航模式时的首选形式。 |
| `close()` | 关闭栏位、清除 session 导航并恢复上游占位者。幂等。 |
| `back()` / `canGoBack()` | 从 session back stack 恢复上一个 instance。 |
| `toggle(id)` | 未激活时打开；已激活时关闭。 |
| `registerSurface(descriptor)` | 为 surface id 注册可选生命周期与 dedupe 元数据。 |
| `getSnapshot()` / `subscribe()` | 供 `useSyncExternalStore` 使用的响应式状态。 |

关键 slot 常量：`DETAILS_SURFACE_SLOT`（`shell.details.surface`）与 `DETAILS_HEADER_ACTIONS_SLOT`（`shell.details.header.actions`）。

### Surface 贡献

其他 Client 插件通过声明感知的 injection 注册可渲染 surface：

```ts
ctx.slots.inject('shell.details.surface', () =>
  ctx.slots.register({
    name: 'shell.details.surface',
    id: 'example.alpha',
    label: 'Example Alpha',
  }, ExampleSurface))

// ExampleSurface props include detailsInstance from PropsRuntime<'shell.details.surface'>
```

可选 payload 类型通过对 Client 入口做 declaration merging：

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    'example.alpha': { tab?: string }
  }
}
```

未做 augmentation 的外部 surface 与未知 payload 仍然受支持。

### 组合规则

Host 插件是空的 Loader 席位。Client 插件需要 `slots`、`layout` 与 `sessions`。

`open()` 会先校验 surface，创建 surface instance，以低于上游占位者的 shadowing priority 把 DetailsHost 注册进单一 `details` slot，确认 DetailsHost 赢得该 cell，提交 instance，然后调用 `ctx.layout.openDetails()`。缺少或重复的 surface id，以及 takeover 冲突，都会抛出类型化错误并回滚。切换到另一个已注册 id 时 DetailsHost 保持 mounted，并且不会关闭该栏。

每个 session 在内存中保留独立的 active instance 与有界 back stack（默认 push，可选 replace，支持 `back()` / dedupe）。面板几何仍由 `ctx.layout` 负责；本包只在 surface 打开期间占用 `details`。

卸载活动 surface、切换当前 session、surface 渲染崩溃或卸载 Details Host，都会关闭 takeover 并恢复上游占位者。

## npm 发布

本包将以 `@dsh-electron/dsh-client-ui-details-host` 发布到 npm。当前尚未公开发布；请将 API 与版本视为 pre-release。

## 开发

使用 Node.js `^22.19` 或 `>=24` 以及 pnpm 11。

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
