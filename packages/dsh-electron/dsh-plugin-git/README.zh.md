# `@dsh-electron/dsh-plugin-git`

[English](README.md) | 中文

一个标准 DSH/Cordis Git 插件，包含一项 portable Host service、一份 Client bundle 与 optional Desktop enhancement。Native DSH 与 DeepSeek Harness Desktop 原样运行同一个 package；npm scope 只表示 publisher，不表示 runtime requirement。

## 组合

Host plugin 要求 `ctx.subprocess`，提供 `ctx.git`，并使用 executable 与独立 argv values 启动 Git。它绝不调用 shell。DSH Web Host 存在时，optional Connection child 注册 loopback `/git` RPC channel；没有 Connection 的 headless composition 中 Git service 仍保持 active。

Client plugin 要求上游 Connection、locale、runtime、conversation UI、primitives，以及 `@dsh-electron/dsh-client-ui-details-host`。其 `dsh.client.external` 列出 `@dsh-electron/dsh-client-ui-details-host/client`，以便模块表在本 bundle `require` 该 factory 之前先物化它。它向 `conversation.input.left` 贡献 branch selector 与 changed-files indicator，并向 `shell.details.surface` 贡献 Git details surface。打开 Git 会调用 `ctx.shellDetails.open('git')`；AppFrame details 栏位、resize handle 与 close button 由 Details Host 拥有，不属于本 package。

Business components 通过 slot injection 接收 controller 与 `openDetails()`，不访问 Cordis context。

Controller 在 workspace 变化时发现 repository state。Details Host 在栏位关闭时会 unmount Git surface。

Client main fiber 不要求 `desktop`。Child `ctx.inject(['desktop'], ...)` fiber 只接受 `shell.showItemInFolder`、`shell.openPath` 与 `notification.show`；缺少这些能力时，repository、status、diff、stage、commit 与 branch operations 仍可用，native actions 不显示。

在 Electron 上，Details Host 是 required built-in。在其他 DSH Web host 上，需要与本 package 一起安装并启用 `@dsh-electron/dsh-client-ui-details-host`。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `executable` | `git` | 由 `ctx.subprocess` 解析的 Git executable name 或 absolute path。 |
| `maxOutputBytes` | 8 MiB | 单条 Git command 每个 stream 的 collection cap。 |
| `graceMs` | 3000 | Managed subprocess termination grace period。 |

## Git 操作

首个版本支持 repository discovery、Git version、current branch 与 HEAD、staged／unstaged／untracked status、local branches、working 与 staged diffs、stage／unstage、commit、branch creation 与 branch switching。Status 使用带 NUL path separators 的 porcelain v2；branches 使用 `for-each-ref`；每个 caller-supplied path、branch 与 message 始终作为一个 argv value。

GitHub authentication、remotes、fetch／pull／push UX、issues、pull requests、stash、rebase、cherry-pick、merge-conflict editing 与 credential management 不属于本 package。

## 开发

使用 Node.js `^22.19` 或 `>=24` 与 pnpm 11。Standalone repository 管理自己的 dependency lockfile，并运行与 DeepSeek Harness subtree 相同的 package tests 和 bundle configuration。

在 `@dsh-electron/dsh-client-ui-details-host@0.1.0` 发布到 npm 之前，本地开发通过 `tests/fixtures/` 下的 pinned fixture tarball 安装 Details Host。公共 artifact 可用后，应把该 dev-only 路径替换为 registry range。

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
