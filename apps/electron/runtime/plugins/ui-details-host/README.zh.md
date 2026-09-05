# dsh-client-ui-details-host

[English](README.md) | 中文

可移植 DSH/Cordis Client 插件，把 AppFrame 详情栏升级为多标签的右侧工作区 Dock。该包是 `platform:web` UI 基础设施，不依赖 Electron、Node 或 Desktop。npm scope `@dsh-electron/` 标识发布者，不是运行时要求。

本仓库是源码真源。[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 通过 git subtree 镜像它，并将 Details Host 作为必需内置基础设施挂载。同一 package 可在 DeepSeek Harness Desktop 与标准 DSH Web host 中原样运行。

## DSH 兼容性

本仓库的 `develop` 分支面向 **DeepSeek Harness `v0.1.2`**（含 [`dsh-v0.1.2-alpha.4`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.4)）。

若你使用的是 **DeepSeek Harness [`v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/v0.1.1-rc.2)**，请改用 [`main`](https://github.com/cherrchen/dsh-client-ui-details-host/tree/main) 分支。

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

Client 半通过 package 的 `exports["./client"]` 入口解析。Peer 依赖（`@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-client-ui-renderer`、`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-conversation` 与 React）必须已存在于 host 组合中。

## 用户体验

加载 Details Host 不会打开详情栏。在消费者调用 `ctx.shellDetails.open()` 或用户从会话头部的开关打开 Dock 之前，上游 DetailsPanel 仍保持可见。

Dock 接管后，栏位 chrome 是一个标签栏加 surface 主体。每次 `open()` 会创建或复用一个标签页，标签页可单独关闭（`+` 按钮打开 Launcher），Dock 保持 mounted 直到 Details Host 自身被卸载。关闭最后一个标签页会显示 Launcher 而不是恢复上游面板。隐藏 Dock（头部开关）会保留标签页与 Launcher 状态；再次显示时会原样恢复。

一个 App Details Toggle 按钮被贡献到 `conversation.session.header.utilities` slot。它反映实测的 Dock 宽度（带 `data-pressed` aria 状态）并切换可见性：有存留标签页时打开会恢复它们；空 Dock 时打开会显示 Launcher；关闭只是隐藏栏位。

## 公共 API

### `ctx.shellDetails`

Client 插件提供 `ctx.shellDetails`，即带 `apiVersion` `3` 与完整 `features` 集合（在 v2 集合之上追加 `tabs`、`launcher`、`tabClose`、`dockVisibility`）的 `ShellDetailsController`。类型与常量从 `@dsh-electron/dsh-client-ui-details-host/client` 导入。

| 方法 / 属性 | 作用 |
|---|---|
| `open(id)` | 把已注册 surface 作为标签页打开（兼容重载；返回 void）。 |
| `open({ surfaceId, payload?, navigation? })` | 首选形式。创建新标签页，或按 surface 的 `dedupeKey` 复活已有标签页并打开 Dock。返回 instance。 |
| `close()` | 关闭当前激活标签页。关闭最后一个标签页会显示 Launcher；Dock 保持 mounted。幂等。 |
| `closeTab(instanceId)` | 关闭指定标签页；相邻 / MRU 标签页成为激活页。 |
| `activate(instanceId)` | 把标签页带到前台并隐藏 Launcher。 |
| `showLauncher()` | 显示 Launcher 页并打开 Dock。 |
| `back()` / `canGoBack()` | 标签导航的 MRU 兼容面：重新激活最近活跃的另一标签页。 |
| `toggle(id)` | 未激活时把 `id` 作为标签页打开；已激活时关闭当前标签页。 |
| `toggleDock()` | 头部开关入口：隐藏 Dock，或恢复存留标签页 / 显示 Launcher。 |
| `registerSurface(descriptor)` | 为 surface id 注册可选生命周期与 dedupe 元数据。 |
| `registerLauncher(contribution)` | 注册 Launcher 卡片；返回 disposer。 |
| `getSnapshot()` / `subscribe()` | 响应式状态（`tabs`、`activeInstanceId`、`launcherVisible`、`dockVisible`），供 `useSyncExternalStore` 使用。 |

关键 slot 常量：`DETAILS_SURFACE_SLOT`（`shell.details.surface`）、`DETAILS_HEADER_ACTIONS_SLOT`（`shell.details.header.actions`）与 `CONVERSATION_HEADER_UTILITIES_SLOT`（`conversation.session.header.utilities`，内置 App Details Toggle 以入口 `dsh-electron.details-toggle` 挂载于此）。

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

surface descriptor 可以声明 `dedupeKey(payload)`（标签页复用身份）与逐标签页 `closable`（默认 `true`；不可关闭的标签页不渲染关闭控件）。surface 主体渲染在 error boundary 内：某个 surface 崩溃时降级为样式化的 fallback，不会拖垮整个 Dock。

### Header Actions

激活 surface 所在插件可以向 `shell.details.header.actions` 贡献控件（渲染在 Tab 条尾部、右对齐；该区域永不收缩，空间不足时由 Tab 压缩让位，而不会把 Actions 挤出侧栏）。Actions 是 icon-only 按钮：请使用 host 提供的 `DetailsHeaderAction` primitive，保证尺寸、圆角、hover、tooltip 与无障碍命名跨插件一致：

```tsx
import { DetailsHeaderAction } from '@dsh-electron/dsh-client-ui-details-host/client'

<DetailsHeaderAction icon={<IconRefreshOutline16 />} label="刷新 Git 状态" onTrigger={refresh} />
```

`label` 同时是 tooltip 文案与按钮 `aria-label` 的唯一来源，不会作为可见文本渲染在按钮上。

### Launcher 贡献

Launcher 由贡献注册表渲染 —— host 不硬编码任何卡片。feature 插件注册打开自身 surface 的卡片：

```ts
ctx.shellDetails.registerLauncher({
  id: 'example.card',
  pluginId: 'example',
  title: 'Example',
  icon: <Glyph />,            // optional ReactNode
  description: 'Open Example', // optional
  order: 10,                   // optional, ascending
  when: () => true,            // optional visibility predicate
  open: () => ({ surfaceId: 'example.alpha' }),
})
```

没有存留标签页时 Dock 显示 Launcher；没有任何贡献时显示空状态。

### 组合规则

Host 插件是空的 Loader 席位。Client 插件需要 `slots`、`layout`、`sessions` 与 `locale`。

`open()` 会先校验 surface，解析标签页（按 `dedupeKey` 创建或复用），以低于上游占位者的 shadowing priority 把 DetailsHost 注册进单一 `details` slot，确认 DetailsHost 赢得该 cell，提交标签页，然后调用 `ctx.layout.openDetails()`。缺少或重复的 surface id，以及 takeover 冲突，都会抛出类型化错误并回滚。

每个 session 在内存中保留独立的标签页列表（上限 20 个；最老的可关闭标签页会被逐出）、Launcher 可见性与 MRU 栈。面板几何仍由 `ctx.layout` 负责；本包只拥有注册表、标签页、Launcher 与 Dock chrome。Dock 可见性由 mounted 的 host 自测（对栏位做 `ResizeObserver`）并写入 snapshot，因此无需改动 `ui-layout`。

卸载某个 surface 会关闭它的标签页；卸载 Details Host 会释放 takeover 并恢复上游占位者。切换 session 会切到该 session 自己的标签页与 Launcher 状态。

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

- **`navigation: 'replace'` 目前被忽略** — 每次 open 都是创建或复用标签页；显式 replace 语义推迟到有消费者需要时实现。
- **仅内存 session 状态** — 标签页、Launcher 状态与 MRU 历史在进程重启后清空；不做 localStorage / IndexedDB / 文件持久化。
- **Windows Desktop 标题栏避让** — 当宿主 document root 带有 `data-dsh-desktop-platform="win32"` 时，Dock 标签栏会增加顶部 padding 以避开 Window Controls Overlay；其他平台保持默认 padding。
- **Launcher 卡片文案跟随贡献方** — host 渲染各插件提供的 `title`/`description` 字符串，不做本地化。
