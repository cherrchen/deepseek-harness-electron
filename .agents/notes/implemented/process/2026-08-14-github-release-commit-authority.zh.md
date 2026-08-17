# Agent Note: Use GitHub release commits as temporary desktop release authority

Status: implemented

[English](2026-08-14-github-release-commit-authority.md) | 中文

## Problem

上游 dsh release 流程可以在 `release(dsh): <version>` 提交中声明版本，而不通过 npm 提供相同版本。同时要求两个来源会阻止具有精确、可审查上游 release 提交的版本生成桌面 release，也无法区分未发布版本与注册表遗漏版本。

## Decision

桌面 release 资格暂时以上游 GitHub 历史作为依据。[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 只接受提交主题严格匹配 `release(dsh): <version>`，且 `apps/cli/package.json` 声明相同版本的记录。定时扫描检查桌面基线之后的提交；手动 `release_version` 输入搜索完整的 `upstream/master` 历史，并且只有恰好一个提交匹配时才继续。

npm 发现与校验命令以注释形式保留在 GitHub 校验旁，使恢复第二个来源成为一项显式、可审查的变更。[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 会在上传任何平台安装包之前，独立校验快照版本、上游父提交及该父提交的精确主题。

当上游发布提供完整版本序列，或提供可以把每个 npm 版本映射到源码提交的可信来源信息时，恢复 npm 校验。恢复时，快照准备和三个平台的 release job 都必须拒绝该来源中不存在的版本。

## Alternatives considered

**继续强制把 npm 作为第二个来源。** 注册表遗漏了一个具有精确上游 release 提交的版本，因此该方案会阻止请求的桌面 release，却无法证明源码声明无效。

**接受任意提交或版本输入。** 自由组合可能把无关源码标记为 release。严格的提交主题、manifest、唯一性和快照父提交校验保留了封闭的 GitHub 派生身份。

**为同步后的 `main` 添加 tag。** 该分支可能包含 release 提交之后的变更。detached 快照会保持精确的上游版本边界。

## Consequences

即使 npm 不包含某个版本，GitHub 声明的版本也可以生成桌面安装包。这使 `0.1.0-rc.5` 等历史 release 提交能够发版，同时接受桌面 Release 可能没有匹配的 npm 页面。

该 release 仍可由一个具名上游提交和 Electron 覆盖层复现。满足恢复条件后，维护者必须恢复注册表校验；在此之前，精确的上游 release 提交主题与 manifest 是唯一的发布依据。
