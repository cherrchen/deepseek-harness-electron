# Agent Note: Electron 专用 Dependabot 更新

Status: implemented

[English](2026-08-14-electron-only-dependabot.md) | 中文

## 问题

桌面仓库从 `deepseek-ai/deepseek-harness` 继承了大部分 manifest（元数据清单）、工作流和依赖决策。如果在这里继续应用上游覆盖整个仓库的 [Dependabot 策略](2026-07-27-dependabot-version-updates.md)，就会重复创建 npm、Python 和 GitHub Actions 更新提案，而这些变更之后还会通过上游同步再次到达。每个自动生成的 PR（Pull Request）也会启动上游验证和三平台桌面打包矩阵，尽管下游仓库只负责 Electron 打包工具链。

## 决策

[`.github/dependabot.yml`](../../../../.github/dependabot.yml) 中的根 npm 更新项只允许 `electron` 和 `electron-builder`。仓库保留根更新项，因为 pnpm 工作区共用一份根锁文件。版本更新组成一个 `electron-toolchain` 分组，最多打开一个 PR；安全更新组成另一个独立分组。uv 和 GitHub Actions 更新项忽略所有依赖，并将版本更新 PR 上限设为零，因此这些由上游负责的生态不会在下游生成提案。

Dependabot PR 运行 [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml) 中的 `Electron dependency check` 任务。该任务拒绝 `apps/electron/package.json` 和 `pnpm-lock.yaml` 以外的变更，按冻结锁文件安装依赖，运行 Electron 运行时测试，并编译 Electron 主进程。任务依据 `pull_request.user.login` 而非触发操作的用户识别 PR，因此维护者重新运行任务不会扩大机器人的权限。

如果 PR 的变更路径仅限 Electron manifest 和根锁文件，上游 CI、发布打包、真实 API 与原生工作流都不会运行。仓库的议题策略任务会跳过 Dependabot PR，因为这个下游仓库不负责上游项目集成凭据。人工提交的 PR 仍执行常规桌面验证；每项合并后的依赖更新都会在 `main` 上触发完整桌面构建和三平台打包矩阵。

上游包、Python、原生与 GitHub Actions 依赖只通过 [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 中经过验证的上游合并前进。下游策略不会自动合并依赖 PR。

## 考虑过的替代方案

- **保留继承的全仓库 Dependabot 扫描。** 不采用，因为它会重复上游的职责，生成之后仍将通过同步到达的变更，并让下游 CI 为无关提案消耗资源。
- **只扫描 `/apps/electron`。** 不采用，因为 Electron 工作区参与根 pnpm 锁文件；保留根 npm 更新项可以让 manifest 与锁文件解析保持一致，同时由白名单限制维护范围。
- **评审前运行完整桌面打包矩阵。** 不采用，因为聚焦的 PR 任务已经覆盖依赖安装、运行时行为和编译。完整矩阵仍会在合并后及每次发布前运行。
- **完全禁用 Dependabot。** 不采用，因为 Electron 及其打包器是下游负责的发布依赖，需要自动更新信号。

## 后果

Dependabot 最多创建一个处于打开状态的 Electron 版本更新 PR，并将可用的 Electron 安全修复另行分组。上游依赖警报与更新时间仍由上游仓库负责，并通过同步到达桌面仓库。

PR 验证只使用一个 Linux runner，且不构建安装包。合并后的更新在进入下游发布之前，仍会取得完整的 Windows、macOS 和 Linux 验证结果。

更新允许的依赖时，根锁文件仍可能改变传递依赖。路径保护将变更限制在 Electron manifest 和锁文件内；冻结锁文件安装、聚焦测试、编译、合并后矩阵和维护者评审会依次提供范围逐步扩大的验证证据。
