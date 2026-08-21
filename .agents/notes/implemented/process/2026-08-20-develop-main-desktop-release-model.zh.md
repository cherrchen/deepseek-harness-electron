# Agent Note: develop/main 分支模型与桌面端 Beta/RC/Stable release

Status: implemented

[English](2026-08-20-develop-main-desktop-release-model.md) | 中文

## 问题

桌面端 fork 曾将上游直接同步到 `main`，从带有 `electron-dsh-v*` tag 的分离上游快照发布桌面端 release，并在同一分支上混合日常开发与发布升级。这使下游分支模型不清晰，增加了 fork 自有文件的冲突处理复杂度，也无法在 `develop` 上独立迭代 Beta，同时保持 `main` 上的 RC 和 Stable 版本与上游一致。

## 决策

采用 `feature branch → develop → main`：

- [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 将 `upstream/master` 合并到 `develop`，应用下游冲突策略，准备并推送下一个 Beta commit，仅在 Desktop CI 针对该提交成功后发布其 `v{a.b.c}-beta.{x}` tag。
- Desktop CI 只接受从 `develop` 到 `main` 的发布 PR（Pull Request），其中 Electron manifest 版本已准备为与 `apps/cli/package.json` 中的 RC 或 Stable 版本一致，lockfile 也已记录该 manifest。
- [`desktop-promote.yml`](../../../../.github/workflows/desktop-promote.yml) 检查最新 `main` 提交上已准备的版本，并创建其 `v{a.b.c}-rc.{x}` 或 `v{a.b.c}` tag，不修改分支。
- [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 从 tag push 打包安装程序，并验证 Beta tag 属于 `develop`，RC 和 Stable tag 属于 `main`。
- [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md) 记录 fork 专用规则；上游 [`AGENTS.md`](../../../../AGENTS.md) 以 `@AGENTS.downstream.md` 结尾，并在每次同步后恢复该引用。

版本脚本位于 `apps/electron/scripts/`：

- `set-version.mjs` — 通过 `pnpm electron:set-version` 设置 `apps/electron/package.json` 版本
- `next-beta-tag.mjs` — 为当前工作树计算下一个 `v{a.b.c}-beta.{x}` tag
- `restore-agents-downstream.mjs` — 在同步上游 `AGENTS.md` 后重新追加 `@AGENTS.downstream.md`

## 考虑过的替代方案

**继续将上游同步到 `main`。** 这会与受保护分支的发布升级冲突，并混合 Beta 迭代与 RC/Stable 发布权限。

**保留 `electron-dsh-v*` tag。** 新的 `v*` 方案与上游 semver tag 一致，并通过分支区分 Beta、RC 和 Stable 通道。

**在发布前手工编辑 Electron 版本。** 共享脚本可使 `apps/electron/package.json` 与 lockfile 的重新生成在各 workflow 间保持一致。

**由发布升级 workflow 创建 RC 或 Stable 版本提交。** 直接写入 `main` 的提交会使受保护发布分支与 `develop` 分叉，并要求执行 back-merge。在 `develop` 上准备版本，可使 manifest 和 lockfile 在相同内容进入 `main` 前接受 PR 评审。

**单独 dispatch Desktop CI 并在不知道结论时继续。** 独立 dispatch 会重复运行已由 `develop` push 触发的 CI，且其结果未知时不能授权创建 tag。同步 workflow 改为按最终 Beta commit SHA 识别 push 触发的 run，并将其成功结论作为创建 tag 的前提条件。

## 后果

上游集成和 Beta release 在 `develop` 上进行；最终 Beta commit 只推送一次，由该 push 触发的 Desktop CI run 验证，并仅在该 run 成功后创建 tag。RC 和 Stable release 要求通过 Squash Merge 升级到 `main`。发布 PR 携带 Electron 版本和 lockfile 更新，合并后的 workflow 只写入 release tag。README 入口页仍由下游维护；`AGENTS.md` 跟随上游，并恢复下游引用。旧版 `electron-dsh-v*` tag 保留为历史产物；新 release 使用 `v{a.b.c}[-beta.x|-rc.x]`。
