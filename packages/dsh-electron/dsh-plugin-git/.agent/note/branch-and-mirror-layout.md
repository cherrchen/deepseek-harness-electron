# 分支拓扑与 Desktop 仓库镜像关系

- **Status**: Current（截至 2026-09-13 的仓库观察，变更后请更新）
- **类别**: 仓库观察 / 上游集成

## Canonical 仓库与本地镜像

本包的 canonical 仓库是 GitHub 上的 `cherrchen/dsh-plugin-git`（见 `package.json` 的 `repository` 字段）。仓库根 `AGENTS.md` 声明：本地工作目录是该 canonical 仓库的镜像副本，必须保持可独立安装、可独立发布（依赖一律 registry semver，禁止 `workspace:`）。

## 与 DeepSeek Harness Desktop 的 subtree 镜像

根 `README.md` 声明：[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) 仓库通过 **git subtree** 镜像本仓库，并在 Desktop 中预装本插件。这意味着：

- 本仓库的提交历史会出现在 Desktop 仓库中（subtree 合入）；
- 包内路径相对独立（`dsh-plugin-git/` 之类子目录），跨包绝对引用要谨慎。

## 分支模型（git 考古结论）

- `main` 是主分支；功能与修复经 PR 合入（如 #2、#4、#5）。
- 存在集成分支 `develop`：README 兼容性声明曾写 "targets DeepSeek Harness `v0.1.2`"（迁移到上游右侧边栏后已更新为 `v0.1.5`）；`develop` 通过 PR（#6）合回 `main`。
- `main` 反向同步进 `develop` 时（提交 `93ea41f`），冲突**一律以 develop 为准**解决；同步前在本地分支 `backup/develop-before-sync` 留了 `develop` 的备份。
- `audit/0906`、`fix/audit-0908`、`feat/ui-beauty` 是审计/美化工作分支；其内容经 rebase/cherry-pick 后以不同 SHA 进入 `main`（如 `80b1826` 与 main 上的 `6d10d5f` 同名不同 SHA），判断某分支是否已合并**不能只看 `git branch --merged`**，要按提交信息比对。

## 上游版本钉住

- devDependencies 钉在 DSH `0.1.5-rc.2`（npm `next` 标签承载全部所需包）；`@deepseek-ai/dsh-*` peerDependencies 是 `>=0.1.2-alpha.4 <0.2.0` 范围，UI 宿主 `@deepseek-ai/dsh-client-ui-sidebar-right` 与 `@deepseek-ai/dsh-client-resources` 单独钉 `>=0.1.5-rc.2 <0.2.0`。
- 旧的第三方 UI 宿主 `@dsh-electron/dsh-client-ui-details-host` 已废弃：本包已迁移到上游内置右侧边栏（npm `0.1.5-rc.2`），不再需要 `tests/fixtures/` 下钉 tarball 的 `file:` devDependency 工作流（曾用于 `0.2.0-alpha.4` 与 `0.3.0` 两份 fixture，见提交 `c09dc1a`、`b4ba876`；现已删除）。

## 相关文档

- [兼容性与安装（根 README）](../../README.md#installation)
- [`.agent/note/README.md`](README.md) —— 准入标准。
