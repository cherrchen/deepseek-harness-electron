# DeepSeek Harness Desktop

[English](README.md) | 中文

DeepSeek Harness Desktop 将 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打包为适用于 macOS、Windows 和 Linux 的原生桌面应用。它保留上游 Web 应用、智能体运行时、profile 和工作区流程，并提供操作系统窗口与桌面安装包。

## 状态

本项目及其上游运行时均处于开发者预览阶段。发布版本可能包含破坏兼容性的变更。

## 安装

请从[最新发布版本](https://github.com/cherrchen/deepseek-harness-electron/releases/latest)下载对应平台的安装包：

- macOS：适用于 Apple Silicon 和 Intel Mac 的 DMG 或 ZIP
- Windows：适用于 x64 和 ARM64 的 NSIS 安装程序
- Linux：适用于 x64 和 ARM64 的 AppImage 或 DEB 包

打开已安装的应用，在开始智能体会话前通过 Harness UI 完成提供方设置。

<a id="run"></a><a id="run-from-source"></a>

## 从源码运行

安装受支持的 Node.js 版本（`^22.19.0` 或 `>=24`）和 pnpm，然后构建 Harness 运行时并启动 Electron：

```sh
git clone https://github.com/cherrchen/deepseek-harness-electron.git
cd deepseek-harness-electron
pnpm install
pnpm run build
pnpm --filter @dsh-electron/dsh-electron start
```

## 运行时与数据

Electron 在随机 `127.0.0.1` 端口启动 DeepSeek Harness，并在沙箱窗口中打开其就绪 URL。渲染进程未启用 Node.js 集成，使用上下文隔离和 Chromium 沙箱；请求的 HTTP 和 HTTPS 链接会在系统浏览器中打开。

Harness profile 和状态存储在对应平台的应用数据目录。智能体 shell 命令从当前用户主目录开始；需要时可在 Harness UI 中选择其他工作区。

## 内置插件

DeepSeek Harness Desktop 随附两个来自独立 canonical repository 的可移植 DSH 插件。两者在桌面应用中原样运行；单独安装后也可在标准 DSH Web host 中使用。

| 插件 | 桌面角色 | 简介 |
|---|---|---|
| [dsh-client-ui-details-host](https://github.com/cherrchen/dsh-client-ui-details-host) | 必需内置 | 通过 `ctx.shellDetails` 在 AppFrame 第三栏承载一个活动 details surface。 |
| [dsh-theme-studio](https://github.com/cherrchen/dsh-theme-studio) | 必需内置 | 在**设置 → 通用 → 主题**提供内置配色主题，叠加在官方浅色 / 深色 / 跟随系统外观之上。 |
| [dsh-plugin-git](https://github.com/cherrchen/dsh-plugin-git) | 预装（可在**设置 → 插件**中禁用） | 在输入区与详情栏提供本地 Git 状态、diff、stage、commit 与 branch 操作。依赖 Details Host。 |

Canonical 开发在各自仓库进行；本 monorepo 通过 git subtree 镜像它们。

## 开发

使用以下命令运行桌面应用的聚焦检查：

```sh
pnpm --filter @dsh-electron/dsh-electron test
pnpm --filter @dsh-electron/dsh-electron build
```

有关仓库细节，请参阅[桌面应用指南](apps/electron/README.zh.md)、[开发指南](docs/development.zh.md)和[架构文档](docs/architecture.zh.md)。

## 贡献

参阅 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。此 fork 跟随上游 DeepSeek Harness 的开发，同时维护其桌面端打包。

## 许可证

[MIT](LICENSE)。第三方依赖声明位于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
