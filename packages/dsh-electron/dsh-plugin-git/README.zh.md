---
description: "面向 DeepSeek Harness Desktop 与标准 DSH Web profile 的 portable Git repository 操作及 Client UI。"
kind: "package-bundle"
---

# dsh-plugin-git

[English](README.md) | 中文

<a id="summary"></a>
## 概述

标准 DSH/Cordis Git 插件，包含一项 portable Host service、一份 Client bundle 与 optional Desktop enhancement。同一 package 可在 DeepSeek Harness Desktop 与标准 DSH Web host 中原样运行；npm scope `@dsh-electron/` 标识发布者，不是运行时要求。

**依赖上游右侧边栏。** 本包要求 DeepSeek Harness ≥ v0.1.5-rc.2：其 Client UI 自带右侧边栏 `@deepseek-ai/dsh-client-ui-sidebar-right`。Git 以标准两阶段方式注册三个 sidebar tab type，并通过 `ctx.sidebarRight` 导航；宿主没有右侧边栏时 Client 半无法加载。旧的第三方 Details Host 插件已废弃，不再被依赖。

[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 预装本插件，并通过 git subtree 镜像本仓库。用户可在**设置 → 插件**中禁用 Git；右侧边栏是上游内置项。

<a id="table-of-contents"></a>
## 目录

- [DSH 兼容性](#dsh-compatibility)
- [安装](#installation)
- [与上游右侧边栏配对](#pairing-with-sidebar-right)
- [用户体验](#user-experience)
- [组合](#composition)
- [配置](#configuration)
- [Git 操作](#git-operations)
- [npm 发布](#npm-publication)
- [开发](#development)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="dsh-compatibility"></a>
## DSH 兼容性

本仓库的 `develop` 分支面向 **DeepSeek Harness `v0.1.5`**（右侧边栏 tab-type API 基线 `0.1.5-rc.2`）。

<a id="installation"></a>
## 安装

本包处于试验开发阶段，计划以 `@dsh-electron/dsh-plugin-git` 发布到 npm；在此之前请从本仓库安装。

**DeepSeek Harness Desktop** — Git 默认预装并启用。不需要仓库 UI 时，可在**设置 → 插件**中禁用。

**DSH Web** — 右侧边栏随 DeepSeek Harness ≥ v0.1.5-rc.2 一起提供，无需单独安装；再安装 Git：

```sh
dsh plugin --profile web add github:cherrchen/dsh-plugin-git
```

本地开发时，构建本 checkout 并加入 profile：

```sh
pnpm install
pnpm build
dsh plugin --profile web add /path/to/dsh-plugin-git
```

每次 `dsh plugin add` 都会激活 package 自带的 `cordis.patch.yml` 层。Git client 加载时要求宿主已提供 `ctx.sidebarRight` 与 `ctx.sidebarRightTabs` 两个 service。

<a id="pairing-with-sidebar-right"></a>
## 与上游右侧边栏配对

Git 通过上游右侧边栏的标准两阶段注册接入 tab-type 体系。Client manifest 只声明 service 依赖：

```json
{
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-ui-sidebar-right"
      ]
    }
  }
}
```

动态 client plugin 不允许 import 其他 plugin 包的运行时值，只允许 `import type`；因此类型引用在 bundle 中被完全擦除，`external` 不再需要。

**阶段一**——`ctx.sidebarRightTabs.register(definition)` 注册三个 tab type：`git.changes` 与 `git.graph` 是 page type（按 kind 打开，每个 pane 单例），并各贡献一个 guide 条目（Changes `order: 10`、Graph `order: 11`），在 guide 页替代旧 Details Launcher 卡片；`git.diff` 是 resource type，pattern `dsh-resource://git/diff/**`，`canOpen` 校验地址可解码，tab 标题取解码出的文件名。

**阶段二**——每个 tab type 的 body 组件注入 `sidebar.right.pane.tab` 座（key 即 definition 的 `id`），body 通过 `useTabInfo().tab.navigation` 读取 `{ address, params, revision }`。

统一导航收敛到 `ctx.sidebarRight`：

```text
ctx.sidebarRight.openTab('git.changes')
ctx.sidebarRight.openResource('dsh-resource://git/diff/<encodeURIComponent(path)>/<staged|worktree>', { params: { path, staged } })
ctx.sidebarRight.openTab('git.graph')
```

diff 标签页以精确地址为身份：同一文件同一比较侧重复打开会 reveal 既有标签页并递增 `revision`（body 据此重新拉取），而同一文件的 staged 与 working-tree diff 是两个不同地址，可并排共存。changes 与 graph 由侧栏按 kind 在每个 pane 去重。changed-files indicator、分支芯片与 guide 条目打开 `git.changes`；点击文件行打开该路径的 `git.diff`。

参数类型通过 augmentation 挂到右侧边栏：

```ts
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    git: GitDiffPayload
  }
}
```

仓库操作按钮（refresh / reveal）由本包以本地组件渲染在各 Git 面板内部。标签栏、guide 页、停靠几何与面板宽度由右侧边栏（基于 ui-dockkit）拥有，不属于本 package。

<a id="user-experience"></a>
## 用户体验

在会话输入区左侧，Git 贡献 branch selector 与 changed-files indicator。点击任一控件会在右侧边栏打开 `git.changes` 标签页。创建分支会打开共享的 conversation Modal；在仅有 `git init`、尚无提交（unborn HEAD）时，菜单以禁用态展示符号默认分支，说明需要先完成首次提交，并在 HEAD 存在前禁用创建。

**Changes** surface 顶部展示当前 branch 与 refresh，其下是默认一行、随内容增高的 commit message 输入框，带魔法棒 **Generate** 控件，以及分裂式 **Commit** 按钮（Commit、Amend、Commit & Push、Commit & Sync）。Staged、unstaged 与 untracked 路径以图标操作分区列出：plus／minus 切换 index，undo 在两步确认后 discard，porcelain 字母标记行状态。点击路径打开对应 diff。**Diff** surface 在右上角展示 refresh，并在每个标签页渲染一个文件的 working-tree 或 staged diff。**Graph** surface 顶部在同一行展示自动／全部／首父链与 refresh，其下以 canvas 绘制的 lane graph 展示提交历史——整页共享一个连续坐标系，rail 与 merge 边不会在行边界断裂——包含 subject、author、date、hash 与 HEAD／branch／tag 装饰徽标，并通过 load-more 控件增量分页。当 host 暴露 LLM runtime 时，staged diff 会发送到会话模型——或发送到 **设置 → 插件 → 插件配置 → Git** 里配置的自定义 provider/model——流式生成的建议写入可编辑输入框。同一张卡片也可以编辑生成所用的 system message。生成绝不 stage、commit 或 push 任何内容。在 Electron 上，optional Desktop enhancement 在 Desktop provider 存在时提供 reveal-in-folder 与 open-path 操作。

<a id="composition"></a>
## 组合

Host plugin 要求 `ctx.subprocess`，提供 `ctx.git`，并使用 executable 与独立 argv values 启动 Git。它绝不调用 shell。DSH Web Host 存在时，optional Connection child 注册 loopback `/git` RPC channel。

Client plugin 要求 Connection、locale、renderer、conversation UI、primitives、session UI 与上游右侧边栏（`ctx.sidebarRight` / `ctx.sidebarRightTabs`，仅类型级 import）。Business components 通过 slot injection 接收 controller 与 `openDetails()`，不访问 Cordis context。

当 `ctx.settingsScope` 存在时，Client 还会把一张卡片注册进 **设置 → 插件 → 插件配置**，命名空间为 `git-commit-message`。Host 不提供该命名空间时，卡片不会出现。

Client main fiber 不要求 `desktop`。Child `ctx.inject(['desktop'], ...)` fiber 只接受 `shell.showItemInFolder`、`shell.openPath` 与 `notification.show`；缺少这些能力时，repository、status、diff、stage、commit 与 branch operations 仍可用，native actions 不显示。

本 package 不发布 runtime invariant companion，因为 Cordis 负责它所使用的 service、RPC registration 与 child-fiber lifetimes。

<a id="configuration"></a>
## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `executable` | `git` | 由 `ctx.subprocess` 解析的 Git executable name 或 absolute path。 |
| `maxOutputBytes` | 8 MiB | 单条 Git command 每个 stream 的 collection cap。 |
| `graceMs` | 3000 | Managed subprocess termination grace period。 |
| `commitMessage.provider` | — | 注册到 DSH LLM runtime 的 provider route。`commitMessage.mode` 为 `custom` 时必填。 |
| `commitMessage.model` | — | 由 provider route 解析的 model id。`commitMessage.mode` 为 `custom` 时必填。 |
| `commitMessage.mode` | inherit | `inherit` 使用宿主会话模型；`custom` 固定 `provider`/`model`。 |
| `commitMessage.systemPrompt` | 内置 | 提交信息生成的 system prompt。空或缺省使用 package 默认值。 |
| `commitMessage.maxDiffBytes` | 48 KiB | 生成 prompt 构建前对 staged diff 施加的字节上限（validated 最小值 1024）。 |

整个 `commitMessage` 节是 optional，同时也是 `git-commit-message` 设置命名空间。可在 **设置 → 插件 → 插件配置 → Git** 中编辑，或作为 composition entry。Host 未暴露 LLM runtime，或既没有会话模型也没有可解析的自定义路由时，commit message 生成不可用，Client 报告 `git/generation-unavailable`。

<a id="git-operations"></a>
## Git 操作

首个版本支持 repository discovery、Git version、current branch 与 HEAD、staged／unstaged／untracked status、local branches、working 与 staged diffs、stage／unstage、commit、amend、向 `origin` push、rebase-then-push sync、branch creation 与 branch switching。Status 使用带 NUL path separators 的 porcelain v2；branches 使用 `for-each-ref`；每个 caller-supplied path、branch 与 message 始终作为一个 argv value。

Discard 通过明确的 index、working tree 与 clean 操作还原一条 staged、unstaged 或 untracked 变更，包括暂存后再次编辑的新增和重命名，属于破坏性操作：Client 在发送 RPC 前总是要求第二次显式确认，确认正文会点名该路径。

提交历史以分页 `git log` 读取（`GIT_LOG_FORMAT`，每行一条 commit、固定字段数），Graph surface 通过 load-more 控件增量追加更早的提交，而不是一次性物化整个历史。

Commit message 生成在宿主侧按需启用：需要 LLM runtime 与可解析的模型（会话默认，或自定义 `provider`/`model`）。staged diff（受 `commitMessage.maxDiffBytes` 上限约束）会发送到该路由，流式生成的建议写入可编辑的 commit message 输入框。System prompt 默认为 Conventional Commit 说明，可在插件配置中覆盖。生成只提供建议 —— 它绝不 stage、commit 或 push 任何内容。

GitHub authentication、hosting-provider workflows、credential prompts、issues、pull requests、stash、cherry-pick 与 merge-conflict editing 不属于本 package。Push 与 sync 以独立 argv values 调用 `git push`／`git pull --rebase`，在缺少 remote 或 credentials 时展示 Git 自身的错误。

<a id="npm-publication"></a>
## npm 发布

本包将以 `@dsh-electron/dsh-plugin-git` 发布到 npm。当前尚未公开发布；请将 API 与版本视为 pre-release。UI 宿主是上游内置的右侧边栏，无需独立安装的第三方配对包。

<a id="development"></a>
## 开发

使用 Node.js `^22.19` 或 `>=24` 与 pnpm 11。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

<a id="model-experience"></a>
## Model Experience

无，因为本 package 不注册 model tools、prompt sections 或 request context。

#### KV Cache effect

无。Commit message 生成是独立的 Host LLM 请求，不增加、替换或保留会话 token。

## Known Limitations and Deferred Work

- **无 credential UI** — push 与 sync 调用 Git 时不提示 remote 或 credentials；缺少 `origin` 或认证被拒时以 Git command error 失败。
- **Command output 有界** — 大于 `maxOutputBytes` 的 diff 只保留 subprocess collector tail；处理超大 diff 的 deployment 必须提高这一 validated setting。
- **生成依赖 host 与模型** — commit message 生成需要 host LLM runtime 与可解析的模型（会话默认或插件配置中的自定义路由）；两者缺其一时，Generate 动作保持禁用或报告 `git/generation-unavailable`。

<a id="dev-note"></a>
### 开发备注

无。
