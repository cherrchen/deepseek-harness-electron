# Agent Note: 上游同步时重新生成冲突的配对记录

Status: implemented

[English](2026-08-21-upstream-sync-regenerates-pairing-records.md) | 中文

## Problem

[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 将 `upstream/master` 合并进 `develop` 时，没有启用 worktree 本地的 `dsh-translation-pairing` 合并驱动。双语文档若上下游同时改动，每个非落地页的 `*.i18n.yaml` 都会变成普通合并冲突。旧的冲突策略会在这些文件上直接中止，尽管 [`pnpm run resolve-translation-pairing-conflicts`](../../../../package.json) 能从已合并的 owner blob 安全重建记录。

## Decision

上游合并前，同步工作流以 `--ignore-scripts` 安装依赖并注册配对合并驱动，使 Git 能在不安装 Lefthook 钩子的情况下合成干净的配对记录合并。若合并仍停在未解决的 `*.i18n.yaml`（且没有其他未解决路径），工作流运行 `pnpm run resolve-translation-pairing-conflicts` 并暂存重新生成的记录。落地页文件继续沿用既有的 `merge=ours` 策略。owner Markdown 冲突与解析器拒绝仍会中止同步。面向操作者的表述写在 [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md)；[自动配对合并决策](../process/2026-08-08-automatic-translation-pairing-merges.zh.md) 仍负责驱动算法本身。

## Alternatives considered

**对每个冲突的 `.i18n.yaml` 取 ours 或 theirs。** 任一父提交都点名合并前的 owner hash，提交后的记录会与已合并的 Markdown 不一致，并让配对门禁失败。

**对工作区运行 `verify-translation-pairing --write` 重新记录。** 这会确认当前存在的任意字节，包括已漂移的译文。合并时解析器只重组双方父提交中已有的确认，并拒绝 owner 冲突。

**在合并前安装 Lefthook。** `pre-merge-commit` 会在 Actions 检出上运行，并可能拒绝一次本可干净的合并提交。`--ignore-scripts` 加上显式驱动配置可在没有该钩子的情况下提供合并驱动。

## Consequences

当双方只是重新记录、或各自独立编辑同一配对文档的不同部分时，定时上游同步可以继续。真正的文档内容冲突仍会停下自动化，等待人工处理。`sync-version.mjs` 之后的完整 `pnpm install` 仍是合并后的依赖刷新。
