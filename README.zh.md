# dsh-theme-studio

[English](README.md) | 中文

可移植的 DSH/Cordis 插件：在官方外观偏好之上叠加内置配色主题。包声明 `platform:web`，不依赖 Electron、Node 或 Desktop。npm 作用域 `@dsh-electron/` 标识发布者，不是运行时要求。

本仓库是源码权威。[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 通过 git subtree 镜像本包，并默认预装 Theme Studio。同一包可在 Desktop 与标准 DSH Web Host 中不变地运行。

Stage 1 提供内置主题浏览、预览、应用、持久化与插件生命周期恢复。Theme Schema、导入导出与 Theme Creator Agent 属于后续阶段。

## 安装

本包仍处于试验开发阶段，计划以 `@dsh-electron/dsh-theme-studio` 发布到 npm；在此之前请从本仓库安装。

**DeepSeek Harness Desktop** — Theme Studio 默认预装并启用。不需要覆盖层主题时，可在**设置 → 插件**中禁用。

**DSH Web** — 构建 `lib/` 后加入 profile：

```sh
pnpm install
pnpm build
dsh plugin --profile web add .
```

或直接从 GitHub 安装：

```sh
dsh plugin --profile web add github:cherrchen/dsh-theme-studio
```

`dsh plugin add` 会启用附带的 `cordis.patch.yml` 层。官方外观（浅色 / 深色 / 跟随系统）仍由 `dsh-client-ui-theme` 拥有。Theme Studio 只在**设置 → 通用 → 主题**增加一行。

## 使用体验

设置 → 通用中，外观在前（`order = 10`），主题在后（`id = themes`，`order = 20`）。

- **默认**清除 Theme Studio 覆盖层，回到官方主题。
- **预览**是临时的，不会写入设置。
- **应用**把 `activeThemeId` 持久化到 Host 的 `theme-studio` 命名空间。
- 更改外观仍切换官方浅色/深色底色；已应用的 Theme Studio 调色板会自动跟随。

重启应用会恢复上次应用的主题。卸载插件会移除两层覆盖，ThemeRuntime 回到官方主题。

## 运行模型

Theme Studio 不自行呈现 CSS。它调用 `ctx.theme.overrideTokens()`：

```text
官方 Light / Dark / System
        ↓
ACTIVE_SOURCE  (@dsh-electron/dsh-theme-studio:active)
        ↓
PREVIEW_SOURCE (@dsh-electron/dsh-theme-studio:preview)
        ↓
ThemeSnapshot → ThemePresenter → DOM
```

Host 设置：

```text
ui-theme.preference          system | light | dark
theme-studio.activeThemeId   null | dsh-theme-studio.*
```

`null` 表示默认。内置 id 包括 `dsh-theme-studio.graphite`、`.oled`、`.nordic`、`.paper` 与 `.warm`。

## 组装

Host 插件在存在 `ctx.settings` 时注册 `theme-studio` 设置命名空间，否则为空操作。Client 插件需要 `theme`、`settingsScope`、`slots`、`locale`、`connection` 与 `remote`。Headless profile 只加载 Host 半，不会启动浏览器 UI。

## npm 发布

本包将以 `@dsh-electron/dsh-theme-studio` 发布到 npm。当前尚未公开发布；请将 API 与版本视为预发布。

## 开发

使用 Node.js `^22.19` 或 `>=24`，以及 pnpm 11。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
```

## Model Experience

无。本包贡献面向用户的 Client UI，不注册模型工具或提示内容。

#### KV Cache effect

无。本包不增加、替换或保留模型请求 token。

## 已知限制与延后工作

- **仅内置主题** — Stage 1 不导入、导出或校验公开的 `.dsh-theme.json` schema。
- **没有公开的 `ctx.themeStudio` catalog** — 跨插件发现 API 属于 Stage 3。
- **没有自动对比度认证** — 内置调色板经人工检查可读性；WCAG 声明等待 Stage 2 校验器。
