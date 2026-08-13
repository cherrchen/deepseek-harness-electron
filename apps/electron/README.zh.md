# DeepSeek Harness Desktop

[English](README.md) | 中文

此应用将上游 DeepSeek Harness Web 组合封装为桌面应用。Electron 以 Node 兼容子进程模式启动已构建的 `dsh web` 可执行模块，请求操作系统分配环回端口，并在沙箱窗口中打开它报告的就绪 URL。应用完整复用上游 Web 前端、RPC 传输、插件组合、profile 和 `$DSH_HOME` 存储行为。

## 开发

使用仓库声明的 Node.js 与 pnpm 版本。启动 Electron 前先构建上游运行时：

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-electron start
```

使用以下命令运行桌面端聚焦测试并编译主进程：

```sh
pnpm --filter @deepseek-ai/dsh-electron test
pnpm --filter @deepseek-ai/dsh-electron build
```

## 打包

包配置在 Windows 上生成 NSIS 安装程序，在 macOS 上生成 DMG 和 ZIP 产物，在 Linux 上生成 AppImage 和 DEB 产物。release 工作流使用 GitHub 托管的原生架构 runner，为 x64 和 ARM64 构建每一种格式。CI 构建未签名产物，因此仓库无需配置签名凭据；需要分发可信二进制文件的维护者可以提供 `electron-builder` 支持的平台签名环境。

应用版本跟随 [`apps/cli/package.json`](../cli/package.json)。[`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) 在每次合并上游后更新版本。提交主题严格匹配 `release(dsh): <version>` 且 CLI manifest 声明相同版本时，该提交会成为桌面 release；手动分派可以指定早于桌面基线的匹配历史版本。工作流将 Electron 覆盖层应用到该上游提交，防止后续未发布改动进入安装包。[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 在发布构件前校验生成的 tag。

## 运行时与安全

子进程仅监听 `127.0.0.1` 的随机端口。渲染进程不启用 Node.js 集成，使用上下文隔离和 Chromium 沙箱，不获授任何权限，并且不能离开本地 Harness 源进行导航。以新窗口方式请求的 HTTP 和 HTTPS 链接会在系统浏览器中打开。

Electron 进程将 Harness profile 和状态存储在对应平台的应用数据目录下。agent（智能体）shell 命令以当前用户的主目录作为初始工作区；用户可以通过 Harness UI 选择其他工作区。
