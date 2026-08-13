# Agent Note: Synchronize upstream before desktop validation and release

Status: implemented

[English](2026-08-14-upstream-sync-and-desktop-release.md) | 中文

## Problem

桌面仓库在活跃的上游仓库之上维护一项很小的下游应用。复制上游文件或通过变基丢弃下游历史会使更新变得脆弱；在验证合并后的代码树之前发布桌面构件，则可能把损坏的安装包附加到 release。

## Decision

仓库将 `deepseek-ai/deepseek-harness` 保持为 `upstream` 远端，并保留其提交历史。[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 每小时获取 `upstream/master` 和 tag，其中一项定时任务负责每日更新，逐小时任务负责检测 release。工作流把上游合并到 `main`，根据上游 workspace 图同步 Electron 版本和运行时 peer 集合，更新锁文件，运行 Electron 聚焦测试以及上游和 Electron 构建，并且只推送通过验证的合并。发生冲突时会中止，不改动 `main`。

合并产生变化后，同步工作流会分派 [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml)，由它验证并打包 Windows、macOS 和 Linux 产物。必须显式分派，因为使用仓库 `GITHUB_TOKEN` 推送不会递归触发普通 push 工作流。

同步工作流轮询上游非草稿 GitHub release。当 release tag 已包含在同步后的 `main` 中，并且其 CLI（命令行界面）版本与桌面 manifest（元数据清单）相同时，工作流在验证过的桌面提交上创建下游 `electron-<upstream-tag>` tag，并分派 [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml)。release 工作流在三个操作系统上重新构建并测试该 tag，仅在全部打包 job 成功后发布安装包，并附加 SHA-256 校验和。上游的预发布状态和版本保持不变。

全部源代码和下游新增内容继续使用上游 MIT 许可证。除非维护者向 `electron-builder` 支持的环境添加平台签名凭据，否则 release 产物不签名。

## Alternatives considered

**用上游归档替换下游代码树。** 归档会丢失共享 Git 祖先关系、模糊本地内容归属，并要求每次更新后重新复制 Electron 覆盖层。

**把桌面提交序列变基到每个上游 HEAD。** 自动重写历史会使已发布的下游提交和 release tag 不稳定，并需要协调强制推送。

**推送未验证的合并并依赖后续工作流。** 令牌创建的推送不会自动触发另一个工作流，而失败的合并届时已经进入默认分支。

**直接订阅上游 release 事件。** 如果没有外部 GitHub App 或 webhook，GitHub 不会把另一个仓库的 release 事件发送到本仓库。逐小时认证轮询无需额外服务，同时限制了延迟上界。

## Consequences

日常上游提交可以进入桌面仓库，而无需重写任何一方历史。桌面专属路径通常可以独立合并；如果上游修改相同行，自动化会停止并要求经过审查的冲突解决。

每日同步在推送前执行完整上游构建；产生变化的合并还会使用三个托管 runner 进行安装包验证。release 构建会重复操作系统矩阵，因此上传的字节来自带 tag 的代码树，不会复用保留期较短的 CI 产物。

release 发布最多可能比上游晚一个逐小时轮询周期。尚未包含在 `upstream/master` 中的 release 提交会等待分支包含它，从而防止桌面 tag 遗漏已同步的上游源代码。
