# 范围与需求总览

- **Status**: Current（可用当前仓库验证；用户视角细节以根 [README](../../README.md) 为准）

## 产品定位

标准 DSH/Cordis Git 插件：一个 portable Host service（提供 `ctx.git`）+ 一个 Client bundle（Changes / Diff / Graph 三个详情面）+ 可选的 Desktop 原生增强。同一份产物不改代码即可运行在 DeepSeek Harness Desktop 与标准 DSH Web 宿主；npm scope `@dsh-electron/` 只标识发布者，不代表运行时依赖 Electron。

## 功能需求

以下为主要功能需求索引；面向用户的行为细节 canonical 于根 README 的 [User experience](../../README.md#user-experience) 与 [Git operations](../../README.md#git-operations) 两节，此处不复制。

| 编号 | 需求 |
| --- | --- |
| FR-1 | 仓库发现、Git 版本、当前分支与 HEAD 读取 |
| FR-2 | staged / unstaged / untracked 状态查询（porcelain v2，NUL 路径分隔） |
| FR-3 | 工作区与暂存区 diff 读取 |
| FR-4 | stage / unstage / commit / amend / push / rebase-then-push 同步 |
| FR-5 | 丢弃单条变更（含暂存后修改的 add/rename），两步显式确认 |
| FR-6 | 本地分支创建与切换；unborn HEAD 时禁用创建并说明原因 |
| FR-7 | 分页 commit 历史（`git log` 机器可读格式），Graph 增量加载 |
| FR-8 | Canvas 绘制的 lane graph，含 HEAD / branch / tag 装饰与 Auto / All / First parent 视图范围 |
| FR-9 | Composer 内分支选择器与变更文件指示器，点击在右侧边栏打开对应 tab |
| FR-10 | Commit message 生成：staged diff 发送 host LLM（会话模型或自定义 provider/model），流式写入可编辑输入框；仅建议，不 stage / commit / push |
| FR-11 | 生成 system message 可在 Plugin configuration 编辑（`git-commit-message` 命名空间设置卡） |
| FR-12 | Desktop 存在时提供 reveal-in-folder / open-path 原生动作；不存在时核心功能完整可用 |

## 非功能需求

| 编号 | 需求 |
| --- | --- |
| NFR-1 | **Portable**：Host core 只依赖标准 DSH 服务，`git` 经 `ctx.subprocess` 以分离 argv 启动——绝不 shell 拼接、不引入 Electron 导入、preload 全局或 Desktop provider 依赖 |
| NFR-2 | **安全**：调用方提供的 path / branch / message 各自作为独立 argv 值，文件名按字面 pathspec 处理；破坏性操作必须二次确认 |
| NFR-3 | **可独立安装与发布**：依赖一律 registry semver，禁止 `workspace:`；UI 宿主是上游内置右侧边栏，本包对其它 plugin 包仅 type-only import，无第三方运行时配对包 |
| NFR-4 | **有界资源**：单命令输出受 `maxOutputBytes`（默认 8 MiB）限制；生成前 diff 受 `commitMessage.maxDiffBytes` 截断 |
| NFR-5 | **可测试**：使用机器可读 Git 输出与临时仓库测试；拓扑不变量由测试锁定 |

## 约束

- DSH 兼容目标：`v0.1.5`（右侧边栏 tab-type API 基线 `0.1.5-rc.2`；版本耦合细节见 [`.agent/note/branch-and-mirror-layout.md`](../../.agent/note/branch-and-mirror-layout.md)）。
- Client 主 fiber 包含全部 portable 贡献；原生增强只能放在 `ctx.inject(['desktop'], ...)` 子 fiber，且只声明其消费的结构化方法；provider unload 必须移除增强而保留核心 UI。
- GitHub 与远端凭据工作流不在本包内（见下"非目标"），直到另行决策加入。

## 非目标

以下明确排除（canonical 于根 README [Git operations](../../README.md#git-operations) 末段）：GitHub 认证、hosting provider 工作流、凭据提示、issues、pull requests、stash、cherry-pick、merge-conflict 编辑。

## 相关文档

- [architecture](../architecture/overview.md) —— 上述需求如何被满足。
- [plans/active/npm-first-release](../plans/active/npm-first-release.md) —— 发布约束的现状与计划。
