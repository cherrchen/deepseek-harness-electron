# Agent Note: Electron Windows Host hidden console

Status: implemented

[English](2026-09-14-electron-windows-host-hidden-console.md) | 中文

## Problem

打包后的 Windows 应用在 agent 运行 `pwsh` 等命令时弹出 Windows Terminal 窗口。桌面进程链上没有任何进程拥有控制台，因此 Windows 会为链上创建的每个控制台子系统目标新建控制台，而 Windows 11 用 Windows Terminal 渲染新的控制台窗口。

受监督 Host 曾是 `ELECTRON_RUN_AS_NODE` 模式下的 `electron.exe`。该变量只选择入口的 Node.js 行为，不改变 PE 子系统，而 `electron.exe` 是 GUI 子系统映像，因此 `windowsHide` 与 `CREATE_NO_WINDOW` 都不生效，该进程也无法向其后代传递控制台。Host 又从 `process.execPath` 派生子进程，使整条链保持为 GUI 映像：job runner（[windows-job.ts](../../../../packages/subprocess/subprocess-local/src/windows-job.ts)）、ACL runner（[sandbox-local](../../../../packages/sandbox/sandbox-local/src/index.ts)），以及 `CreateProcessW` / `CreateProcessAsUserW` 不带控制台标志创建的目标（[win32-process](../../../../packages/subprocess/win32-process/src/process.ts)）。

单独使用 `CREATE_NO_WINDOW` 并不能修复沙箱路径：受限令牌下的子进程在新建控制台时会在 DLL 初始化阶段以 `STATUS_DLL_INIT_FAILED`（`0xC0000142`）退出，它只能共享父进程的控制台（[sandbox-windows-acl](../../../../packages/sandbox/sandbox-windows-acl/README.zh.md)）。因此整条链都必须是控制台子系统映像，并从 Desktop 继承同一个隐藏控制台。

## Decision

Windows 发行版将上游 Node.js `24.17.0` 运行时作为 `resources/node/node.exe` 随包发布，并通过 [`spawnHarnessChild`](../../../../apps/electron/src/runtime.ts) 从它启动 Host 与每条 `dsh plugin` 命令，使每个子进程获得一个隐藏控制台，而不是没有控制台。仅靠 `windowsHide` 并不够：libuv 会把它转换为 `CREATE_NO_WINDOW`（[process.c](https://github.com/libuv/libuv/blob/v1.52.1/src/win/process.c#L1034-L1042)），而 `CREATE_NO_WINDOW` 子进程根本没有任何控制台句柄，因此 job runner——[未带 `windowsHide` 生成](../../../../packages/subprocess/subprocess-local/src/windows-job.ts)——以及受限沙箱令牌下创建的每个子进程都会新建可见控制台，或者在受限令牌无法创建控制台时直接退出。libuv 只要发现一个 stdio 条目是继承的描述符就省略 `CREATE_NO_WINDOW`，因此该辅助函数传入 stdin 设备描述符，并保留 `windowsHide` 的 `SW_HIDE` 部分：Windows 为这个控制台子系统的 Host 分配一个带隐藏窗口的控制台，其下所有 job、ACL、插件与显式 spawn 的目标都继承它。该描述符打开的是 `os.devNull`——Windows 上为 `\\.\nul`，即 Win32 设备命名空间——绝不使用 DOS 别名 `NUL`：`fs` 会先解析路径并把它改写成 `\\?\` 扩展长度命名空间（`toNamespacedPath`），其中 `NUL` 只是一个普通文件名，于是 Windows 以 `ENOENT` 打开失败，Host 根本不会启动。Host 内的 `process.execPath` 就是 `node.exe`，因此 job runner 与 ACL runner 在 `packages/` 中的启动代码保持不变。

[`resolveHostRuntime`](../../../../apps/electron/src/runtime.ts) 是 Desktop 监督的所有 dsh 子进程的唯一解析点：[`startHarness`](../../../../apps/electron/src/main.ts) 中的受监督 Host，以及 [`createPluginCommandRunner`](../../../../apps/electron/src/plugin-install.ts) 的 `dsh plugin` 命令。Windows 上显式的 `DSH_ELECTRON_NODE_BINARY` 会取代两个随包位置，且必须指向存在的文件；否则依次解析随包的 `resources/node/node.exe` 与预备好的 `.electron-build/node/win-<arch>/node.exe`，二者都不存在时于启动阶段报错，错误信息指明 `pnpm --filter @dsh-electron/dsh-electron prepare:node`，而不是回退到 Electron。其它平台继续使用带 `ELECTRON_RUN_AS_NODE=1` 的 `process.execPath`，该环境会同时传给生成的 pnpm shim 与插件命令子进程，二者在 Windows 上都不带该变量。

[`prepare-node-runtime.mjs`](../../../../apps/electron/scripts/prepare-node-runtime.mjs) 下载 `node-v24.17.0-win-<arch>.zip` 与 Node.js `SHASUMS256.txt`，用清单校验压缩包 SHA-256，把 `node.exe` 解包到 `.electron-build/node/win-<arch>/`，再复制到 `build.win.extraResources` 引用的固定路径 `.electron-build/node/current/`。它按版本幂等，并跳过非 Windows 目标；`prepare:node` 由 `package`、`start` 以及发布工作流的 Windows matrix 行调用。使预备目录可复用的 `VERSION` 标记只在解包后的运行时通过 `--version` 检查后才写入，因此构建主机拒绝的运行时会在下次运行时重新校验，而不会被缓存直接信任并复制到 `current/`。

## Alternatives considered

**只给 Electron-as-node 的 Host 加 `windowsHide`。** `windowsHide` 以 `CREATE_NO_WINDOW` 传给子进程，而 GUI 子系统映像会忽略它；`electron.exe` 仍会在无控制台的情况下创建子进程，窗口依旧出现。

**在 Electron 侧分配控制台，或用辅助进程持有控制台再让子进程依附。** Electron 与目标之间（job runner、ACL runner）是由 Desktop 无法拥有的 `packages/` 启动代码驱动的 GUI 映像，而进程只能在其创建时继承控制台，不能依附祖先的控制台。在 Windows Terminal 委派下，`AllocConsole` 也无法隐藏它创建的窗口。

**只在 `packages/` 的普通 spawn 路径加 `CREATE_NO_WINDOW`。** 默认的沙箱路径仍然未覆盖，因为受限令牌无法初始化新控制台；而且这会改动本仓库从上游合并的平台层。

**把 `electron.exe` 副本的 PE 子系统字节改写为 console，再以 `windowsHide` 启动。** 该副本自带 Electron 内嵌的 Node.js，无需下载运行时，但会产生未签名且结构被修改的可执行文件；只有在目标无法随应用发布 Node.js 时才作为兜底方案。

## Consequences

Windows 上的 Host 进程映像是 `node.exe` 而非 `electron.exe`，任务管理器按该名称显示。监督逻辑不变：`stopHarness` 仍按子进程句柄终止，随包 dsh 可执行文件路径也没有变化。Host 生命周期内常驻一个 headless `conhost`，Windows 安装包因解包后的 `node.exe` 增大约 80 MB 磁盘占用，压缩后的安装包约增大 30–50 MB。Windows 现在在启动时要求预备好的运行时，缺失时直接报错而非降级运行。

Windows 上 agent shell 命令、插件包命令与取消行为与之前完全一致，本次修复只改变控制台的归属。macOS 与 Linux 保留现有的 Electron-as-node Host，其进程拓扑、`pnpm start` 与插件 shim 内容均未变化。

## Testing

单元测试用注入的存在性探测覆盖 `resolveHostRuntime` 的各分支、生成的 Host 子进程耗尽的 stdin 与管道日志、插件命令 runner 的带控制台 stdio 与缺失的 `ELECTRON_RUN_AS_NODE`、两个平台的 pnpm shim 内容，以及 `build.win.extraResources` 条目。[desktop-ci.yml](../../../../.github/workflows/desktop-ci.yml) 中的 `Windows Host startup` job 对每个桌面端 PR 在 `windows-latest` 上运行 `apps/electron/tests/runtime.spec.ts`；发布 matrix 行的包测试步骤只有在 tag 存在之后才运行同一份 spec，而 Linux job 打开的是 `/dev/null`，从不观察控制台归属。该 spec 的控制台归属探测打开 `\\.\CONOUT$`，即 Win32 设备命名空间写法，原因与子进程 stdin 取自 `os.devNull` 相同。发布工作流在两个 Windows matrix 行于 `electron-builder` 之前运行 `prepare:node`，`smoke-windows-installer.ps1` 在安装后的包缺少 `resources\node\node.exe` 时失败。

一个仅 Windows 运行的单元测试在发布工作流的 Windows 行中通过 `CONOUT$` 观察控制台归属；没有任何检查能观察窗口是否可见，因此该修复还需要 Windows 验收：安装后的应用在启动与 agent 命令期间都不出现控制台或 Windows Terminal 窗口，默认 `workspace-write` 沙箱下同样如此（包括 `pwsh -Command "git --version"` 与 `pwsh` → `node` → `cmd` 的嵌套），切换到 `danger-full-access` 后一致，取消或超时一条长命令后不残留孤立的 `node.exe`，托盘重启能干净地停止并重启 Host，通过 pnpm shim 安装插件的全过程无窗口。越界写入仍必须报 `Access to the path ... is denied`，以此确认受限令牌未被削弱。一条成功完成的 `workspace-write` 命令本身就是共享控制台存在的证据：受限子进程无法新建控制台，而是以 `STATUS_DLL_INIT_FAILED` 退出。
