# dsh-plugin-git

[English](README.md) | 中文

标准 DSH/Cordis Git 插件，包含一项 portable Host service、一份 Client bundle 与 optional Desktop enhancement。同一 package 可在 DeepSeek Harness Desktop 与标准 DSH Web host 中原样运行；npm scope `@dsh-electron/` 标识发布者，不是运行时要求。

**依赖 Details Host。** 安装本包前必须先安装并启用 `@dsh-electron/dsh-client-ui-details-host`。Git 向 `shell.details.surface` 贡献 surface，并通过 `ctx.shellDetails` 打开详情栏；没有 Details Host 时 Client 半无法加载。

[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 预装本插件，并通过 git subtree 镜像本仓库。用户可在**设置 → 插件**中禁用 Git；Details Host 仍是必需内置项。

## 安装

本包处于试验开发阶段，计划以 `@dsh-electron/dsh-plugin-git` 发布到 npm；在此之前请从本仓库安装。

**DeepSeek Harness Desktop** — Git 默认预装并启用。不需要仓库 UI 时，可在**设置 → 插件**中禁用。

**DSH Web** — 先安装 Details Host，再安装 Git：

```sh
# 1. Details Host (required dependency)
dsh plugin --profile web add github:cherrchen/dsh-client-ui-details-host

# 2. Git plugin
dsh plugin --profile web add github:cherrchen/dsh-plugin-git
```

本地开发时，分别构建各 checkout 并加入 profile：

```sh
pnpm install
pnpm build
dsh plugin --profile web add /path/to/dsh-client-ui-details-host
dsh plugin --profile web add /path/to/dsh-plugin-git
```

每次 `dsh plugin add` 都会激活 package 自带的 `cordis.patch.yml` 层。请先安装 Details Host，再安装 Git，以便 Git client 加载时 `ctx.shellDetails` 已可用。

在 `@dsh-electron/dsh-client-ui-details-host` 上线 npm 之前，本仓库本地开发通过 `tests/fixtures/` 下的 pinned fixture tarball 安装 Details Host。

## 与 Details Host 配对

Git 是 Details Host 的参考消费者。Client manifest 显式声明依赖关系：

```json
{
  "dsh": {
    "client": {
      "inject": [
        "@dsh-electron/dsh-client-ui-details-host"
      ],
      "external": [
        "@dsh-electron/dsh-client-ui-details-host/client"
      ]
    }
  }
}
```

`external` 确保模块表在本 bundle `require` Details Host Client factory 之前先物化它。`inject` 将 `ctx.shellDetails` 声明为运行时依赖。

Git 注册 surface id `git`、可选 payload tab（`changes`、`diff`、`commit`），并通过以下调用打开栏位：

```ts
ctx.shellDetails.open({
  surfaceId: 'git',
  payload: { tab: 'changes' },
})
```

Payload 类型通过 augmentation 挂到 Details Host：

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    git: { tab?: 'changes' | 'diff' | 'commit'; path?: string }
  }
}
```

AppFrame 详情栏几何、resize handle 与 close button 由 Details Host 拥有，不属于本 package。

## 用户体验

在会话输入区左侧，Git 贡献 branch selector 与 changed-files indicator。点击任一控件会在第三栏打开 Git details surface。

面板内可查看 staged、unstaged 与 untracked 变更，检查 diff，stage / unstage 路径，编写 commit message，以及切换或创建本地 branch。在 Electron 上，optional Desktop enhancement 在 Desktop provider 存在时提供 reveal-in-folder 与 open-path 操作。

## 组合

Host plugin 要求 `ctx.subprocess`，提供 `ctx.git`，并使用 executable 与独立 argv values 启动 Git。它绝不调用 shell。DSH Web Host 存在时，optional Connection child 注册 loopback `/git` RPC channel。

Client plugin 要求 Connection、locale、runtime、conversation UI、primitives 与 Details Host。Business components 通过 slot injection 接收 controller 与 `openDetails()`，不访问 Cordis context。

Client main fiber 不要求 `desktop`。Child `ctx.inject(['desktop'], ...)` fiber 只接受 `shell.showItemInFolder`、`shell.openPath` 与 `notification.show`；缺少这些能力时，repository、status、diff、stage、commit 与 branch operations 仍可用，native actions 不显示。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `executable` | `git` | 由 `ctx.subprocess` 解析的 Git executable name 或 absolute path。 |
| `maxOutputBytes` | 8 MiB | 单条 Git command 每个 stream 的 collection cap。 |
| `graceMs` | 3000 | Managed subprocess termination grace period。 |

## Git 操作

首个版本支持 repository discovery、Git version、current branch 与 HEAD、staged／unstaged／untracked status、local branches、working 与 staged diffs、stage／unstage、commit、branch creation 与 branch switching。Status 使用带 NUL path separators 的 porcelain v2；branches 使用 `for-each-ref`；每个 caller-supplied path、branch 与 message 始终作为一个 argv value。

GitHub authentication、remotes、fetch／pull／push UX、issues、pull requests、stash、rebase、cherry-pick、merge-conflict editing 与 credential management 不属于本 package。

## npm 发布

本包将以 `@dsh-electron/dsh-plugin-git` 发布到 npm。当前尚未公开发布；请将 API 与版本视为 pre-release。Details Host 必须作为独立依赖安装。

## 开发

使用 Node.js `^22.19` 或 `>=24` 与 pnpm 11。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

## Model Experience

无直接影响，因为本 package 贡献 human-facing repository service 与 Client UI，不注册 model tools 或 prompt content。

#### KV Cache effect

无。本 package 不增加、替换或保留 model-request tokens。

## Known Limitations and Deferred Work

- **仅支持 local repositories** — 所有操作都在配置的 DSH subprocess execution world 中运行；尚未实现 remote repository 与 hosting-provider workflows。
- **Command output 有界** — 大于 `maxOutputBytes` 的 diff 只保留 subprocess collector tail；处理超大 diff 的 deployment 必须提高这一 validated setting。
