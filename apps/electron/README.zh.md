# DeepSeek Harness Desktop

[English](README.md) | 中文

此应用将上游 DeepSeek Harness 封装为原生桌面壳。Electron Main 在环回端口上监督已构建的 `dsh web` 后端以保持兼容，而 `BrowserWindow` 加载本包内基于 `@deepseek-ai/dsh-client-web` 构建的 Electron 自有 Renderer（`dsh-electron://localhost/`）。Host bootstrap、插件 bundle、一元 `/api` 调用与事件流仅通过 Main（类型化 preload IPC 与自定义协议代理）到达受监督进程。profile、会话与 `$DSH_HOME` 存储仍遵循上游 Harness 行为。

## 开发

使用仓库声明的 Node.js 与 pnpm 版本。启动 Electron 前先构建上游运行时：

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-electron start
```

`pnpm --filter @deepseek-ai/dsh-electron build` 会编译主进程、preload 桥接与 Renderer（`dist/renderer`）。聚焦桌面测试：

```sh
pnpm --filter @deepseek-ai/dsh-electron test
```

## 桌面集成

主窗口使用隐藏标题栏，并在 Electron Renderer 上方保留 40 像素的拖拽区域。macOS 在该区域内保留“交通信号灯”；Windows 和 Linux 使用 Electron Window Controls Overlay 提供原生最小化、最大化和关闭控件。关闭主窗口会隐藏窗口，Harness 进程继续运行。通过托盘菜单可以重新打开窗口，也可以退出应用并停止受监管的子进程。

操作系统桌面能力（目录选择、剪贴板文本、shell 打开/显示、系统通知、updater 动作、原生主题与窗口控制）由 Electron Main 拥有，并仅通过类型化的 `window.deepseekDesktop` preload 桥暴露。受监督 Host 接收 `apps/electron/runtime` 下的 cordis overlay：禁用 Host `directory-picker-auto`，保留 browse Host 后端以便 `directoryPicker` 仍能注入 apiproxy，并挂载 Electron 本地 directory-flow client 插件（不挂载 browse client），因此 Windows 不再使用 Koffi native picker worker。上游 UI 的剪贴板写入在存在上游注入 seam 之前，经 Renderer 侧窄 shim 转到 Main。以新窗口打开的外部 URL 必须使用 `https:`、`http:` 或 `mailto:`。

原生页面右键菜单根据 Chromium 当前的编辑能力提供剪切、复制、粘贴、全选和刷新；开发构建还提供 DevTools。应用菜单和托盘菜单提供桌面端自有的“关于”窗口、更新通道选择和手动更新检查入口。

托盘使用随应用打包的透明 DeepSeek 图形，而不是完整应用图标。Windows 和 Linux 在原生浅色主题下选择黑色图形，在原生深色主题下选择白色图形，并在 Electron 报告主题变化时刷新图标。macOS 使用随应用打包的 Template Image，由操作系统控制菜单栏对比度。

“关于”窗口从此包的 manifest（元数据清单）读取仓库 URL，显示打包的图标和版本，并在系统浏览器中打开项目链接。其渲染进程在沙箱中运行，Content Security Policy 只允许内嵌样式和图标。

## 更新

打包构建默认使用 **Pre-Release** 通道，并将用户选择的通道持久化到 Electron 的用户数据目录。应用菜单和托盘菜单可以在两个通道间切换：**Pre-Release** 接收最新发布的 prerelease 或 stable release；**Stable / Release** 使用 GitHub 的最新正式 release，绝不选择 prerelease。通道选择读取 GitHub Release 元数据，识别 `v0.1.0-beta.1`、`v0.1.0-rc.3`、`v0.1.0` 等 tag；metadata 校验、语义版本比较、下载与安装仍由 `electron-updater` 负责。

菜单会显示检查状态和下载进度，更新准备完成后提供重启入口。手动检查会报告没有更新或已开始下载。检查失败时，完整错误写入主进程日志，对话框只显示网络与重试指引。

`electron-builder` 生成 `latest.yml`、`latest-mac.yml`、架构专用的 Linux 元数据和 blockmap。桌面 release 工作流在上传安装包时合并各架构的元数据，使同一个 GitHub Release 同时服务 x64 和 ARM64 客户端。macOS 自动更新安装要求已签名的包；仓库的未签名 CI 产物可验证元数据生成和更新发现，但可信分发前必须提供签名凭据。

## 打包

包元数据将产品名声明为 `DeepSeek Harness`，供 Electron 与 `electron-builder` 用于开发态界面、应用元数据、安装包与可执行文件。包配置在 Windows 上产出 NSIS 安装包，在 macOS 上产出 DMG 与 ZIP，在 Linux 上产出 AppImage 与 DEB。发布工作流在原生 GitHub-hosted runner 上为 x64 与 ARM64 构建全部格式。CI 构建未签名产物，因为仓库不要求签名凭据；若分发可信二进制，运营方必须提供 `electron-builder` 支持的平台签名环境。

桌面发布在 `develop` 上使用 `v{a.b.c}-beta.{x}`，在 `main` 上使用 `v{a.b.c}-rc.{x}`，稳定版使用 `v{a.b.c}`。[`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) 将上游合并进 `develop`，同步 workspace 依赖，并发布下一个 Beta tag。[`desktop-promote.yml`](../../.github/workflows/desktop-promote.yml) 在 `main` 上创建与 [`apps/cli/package.json`](../cli/package.json) 匹配的 RC 或 Stable tag。发布提交前用 `pnpm electron:set-version <version>` 设置 Electron manifest 版本。[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 在发布安装包前校验 tag 分支与包版本。

## 运行时与安全

受监督的 Harness 进程仅绑定 `127.0.0.1` 上的随机端口，且永远不是 BrowserWindow 的页面源。Renderer 无 Node.js 集成，启用上下文隔离与 Chromium 沙箱，仅接收类型化的 `window.deepseekDesktop` 桥接，且不能离开 `dsh-electron://localhost`。以新窗口请求的 HTTP/HTTPS 链接在系统浏览器中打开。

受监督进程将 `$DSH_HOME` 设为操作系统用户主目录下的 `.dsh`，因此 Harness profile、设置、会话等状态在 macOS/Linux 使用 `~/.dsh`，在 Windows 使用 `%USERPROFILE%\.dsh`。Electron 将 Chromium 数据、缓存与桌面更新偏好保留在其平台专属 `userData` 目录。Agent shell 命令以当前用户主目录为初始工作区；用户可通过 Harness UI 选择其他工作区。
