# Agent Note: Synchronize upstream before desktop validation and release

Status: implemented

[English](2026-08-14-upstream-sync-and-desktop-release.md) | 中文

## Problem

桌面仓库在活跃的上游仓库之上维护一项很小的下游应用。复制上游文件或通过变基丢弃下游历史会使更新变得脆弱；在验证合并后的代码树之前发布桌面构件，则可能把损坏的安装包附加到 release。

## Decision

仓库将 `deepseek-ai/deepseek-harness` 保持为 `upstream` 远端，并保留其提交历史。[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 每小时获取 `upstream/master`，其中一项定时运行也负责每日更新。工作流把上游合并到 `main`，根据上游 workspace 图同步 Electron 版本和运行时 peer 集合，更新锁文件，运行 Electron 聚焦测试以及上游和 Electron 构建，并且只推送通过验证的合并。发生冲突时会中止，不改动 `main`。

合并产生变化后，同步工作流会分派 [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml)，由它验证并打包 Windows、macOS 和 Linux 产物。必须显式分派，因为使用仓库 `GITHUB_TOKEN` 推送不会递归触发普通 push 工作流。

上游通过 npm 发布 dsh release 系列，不创建 GitHub Release 或持久 release tag。同步工作流从桌面覆盖层所基于的上游提交之后开始，查找提交主题严格匹配 `release(dsh): <version>` 的记录。只有候选提交的 CLI（命令行界面）manifest（元数据清单）声明相同版本，并且 npm 注册表包含该精确版本的 `@deepseek-ai/dsh` 时，候选提交才符合发版条件。注册表发布可能早于或晚于分支可见时间；逐小时扫描可以重试这两种顺序，不会仅凭提交信息认定版本已经发布。

对于每个符合条件的提交，同步工作流在 detached worktree 中把当前 Electron 覆盖层应用到该上游代码树，重新生成 Electron manifest 和锁文件，并创建 `electron-dsh-v<version>`，而不移动 `main`。即使同步已经越过该 release，这个快照也不包含后续上游提交。[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 在三个操作系统上重新构建并测试该快照，仅在全部打包 job 成功后发布安装包，并附加 SHA-256 校验和。npm 版本包含预发布段时，下游 GitHub Release 会标记为预发布。

全部源代码和下游新增内容继续使用上游 MIT 许可证。除非维护者向 `electron-builder` 支持的环境添加平台签名凭据，否则 release 产物不签名。

## Alternatives considered

**用上游归档替换下游代码树。** 归档会丢失共享 Git 祖先关系、模糊本地内容归属，并要求每次更新后重新复制 Electron 覆盖层。

**把桌面提交序列变基到每个上游 HEAD。** 自动重写历史会使已发布的下游提交和 release tag 不稳定，并需要协调强制推送。

**推送未验证的合并并依赖后续工作流。** 令牌创建的推送不会自动触发另一个工作流，而失败的合并届时已经进入默认分支。

**轮询上游 GitHub Release 或要求持久上游 tag。** dsh npm 发版流程不会创建这两种来源，因此该方案无法发现发布。

**npm 发生变化时为同步后的 `main` 添加 tag。** 同步分支可能已经包含 npm 发布之后产生的上游提交。为它添加 tag 会把未发布源码标记为已发布版本。

**根据 npm 最新版本推断源码树。** npm tarball（压缩包）元数据无法标识可用的仓库提交。如果注册表版本没有可见的匹配 release 提交，下游不会猜测源码快照并发版。

## Consequences

日常上游提交可以进入桌面仓库，而无需重写任何一方历史。桌面专属路径通常可以独立合并；如果上游修改相同行，自动化会停止并要求经过审查的冲突解决。

每日同步在推送前执行完整上游构建；产生变化的合并还会使用三个托管 runner 进行安装包验证。release 构建会重复操作系统矩阵，因此上传的字节来自带 tag 的代码树，不会复用保留期较短的 CI 产物。

release 发布最多可能比 npm 或上游分支晚一个逐小时轮询周期。没有可见匹配 release 提交的注册表版本会等待该提交，release 提交也会等待其精确注册表版本。上游发布失败或跳过的版本不会产生下游 tag。
