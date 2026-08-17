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

## 桌面集成

主窗口使用隐藏标题栏，并在上游 Web UI 上方保留 40 像素的拖拽区域。macOS 在该区域内保留“交通信号灯”；Windows 和 Linux 使用 Electron Window Controls Overlay 提供原生最小化、最大化和关闭控件。关闭主窗口会隐藏窗口，Harness 进程继续运行。通过托盘菜单可以重新打开窗口，也可以退出应用并停止受监管的子进程。

原生页面右键菜单根据 Chromium 当前的编辑能力提供剪切、复制、粘贴、全选和刷新；开发构建还提供 DevTools。应用只允许当前环回 Harness 源写入剪贴板，仍拒绝读取剪贴板和所有无关的渲染进程权限。应用菜单和托盘菜单提供桌面端自有的“关于”窗口、更新通道选择和手动更新检查入口。

托盘使用随应用打包的透明 DeepSeek 图形，而不是完整应用图标。Windows 和 Linux 在原生浅色主题下选择黑色图形，在原生深色主题下选择白色图形，并在 Electron 报告主题变化时刷新图标。macOS 使用随应用打包的 Template Image，由操作系统控制菜单栏对比度。

“关于”窗口从此包的 manifest（元数据清单）读取仓库 URL，显示打包的图标和版本，并在系统浏览器中打开项目链接。其渲染进程在沙箱中运行，Content Security Policy 只允许内嵌样式和图标。

## 更新

打包构建默认使用 **Pre-Release** 通道，并将用户选择的通道持久化到 Electron 的用户数据目录。应用菜单和托盘菜单可以在两个通道间切换：**Pre-Release** 接收最新发布的 prerelease 或 stable release；**Stable / Release** 使用 GitHub 的最新正式 release，绝不选择 prerelease。通道选择读取 GitHub Release 元数据，而不解释仓库现有的 `electron-dsh-v<version>` tag；metadata 校验、语义版本比较、下载与安装仍由 `electron-updater` 负责。

菜单会显示检查状态和下载进度，更新准备完成后提供重启入口。手动检查会报告没有更新或已开始下载。检查失败时，完整错误写入主进程日志，对话框只显示网络与重试指引。

`electron-builder` 生成 `latest.yml`、`latest-mac.yml`、架构专用的 Linux 元数据和 blockmap。桌面 release 工作流在上传安装包时合并各架构的元数据，使同一个 GitHub Release 同时服务 x64 和 ARM64 客户端。macOS 自动更新安装要求已签名的包；仓库的未签名 CI 产物可验证元数据生成和更新发现，但可信分发前必须提供签名凭据。

## 打包

包元数据将产品名声明为 `DeepSeek Harness`，Electron 与 `electron-builder` 会将它用于开发环境界面、应用元数据、安装程序和可执行文件。包配置在 Windows 上生成 NSIS 安装程序，在 macOS 上生成 DMG 和 ZIP 产物，在 Linux 上生成 AppImage 和 DEB 产物。release 工作流使用 GitHub 托管的原生架构 runner，为 x64 和 ARM64 构建每一种格式。CI 构建未签名产物，因此仓库无需配置签名凭据；需要分发可信二进制文件的维护者必须提供 `electron-builder` 支持的平台签名环境。

应用版本跟随 [`apps/cli/package.json`](../cli/package.json)。[`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) 在每次合并上游后更新版本和生成的 workspace 依赖，同时保留桌面端自有的 registry 依赖。提交主题严格匹配 `release(dsh): <version>` 且 CLI manifest 声明相同版本时，该提交会成为桌面 release；手动分派可以指定早于桌面基线的匹配历史版本。工作流将 Electron 覆盖层应用到该上游提交，防止后续未发布改动进入安装包。[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 在发布构件前校验生成的 tag。

## 运行时与安全

子进程仅监听 `127.0.0.1` 的随机端口。渲染进程不启用 Node.js 集成，使用上下文隔离和 Chromium 沙箱，不获授任何权限，并且不能离开本地 Harness 源进行导航。以新窗口方式请求的 HTTP 和 HTTPS 链接会在系统浏览器中打开。

受监管的子进程将操作系统用户主目录下的 `.dsh` 作为 `$DSH_HOME`，因此 Harness profile、设置、session 和其他状态在 macOS 与 Linux 上使用 `~/.dsh`，在 Windows 上使用 `%USERPROFILE%\.dsh`。Electron 自身的 Chromium 数据、缓存与桌面更新通道偏好仍保存在对应平台的 `userData` 目录。agent（智能体）shell 命令以当前用户的主目录作为初始工作区；用户可以通过 Harness UI 选择其他工作区。
