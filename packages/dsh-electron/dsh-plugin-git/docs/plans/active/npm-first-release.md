# Plan: npm 首次发布与 Release 流水线

- **Status**: In progress
- **Started**: 2026-09-13（版本重置与 release 工作流草稿）
- **Completed**: （未完成）

## 背景

包要发布到 npm 为 `@dsh-electron/dsh-plugin-git`（根 README [npm publication](../../../README.md#npm-publication) 一节声明"发布尚不可用，API 与版本按 pre-release 对待"）。当前处于发布准备阶段：

- 版本已重置为 `0.1.0`，新增 `pnpm version:set` 脚本统一改版（提交 `08b693b`）；
- 新增 tag 触发的 Release 工作流 `.github/workflows/release.yml`（**尚未提交入库**，工作区未跟踪状态）；
- `publishConfig.access` 已设为 `public`。

## 目标

1. `vX.Y.Z` tag 推送后自动：校验 tag 与 `package.json` 版本一致 → 安装（frozen lockfile）→ `pnpm test` → `pnpm build` → `pnpm test:artifact` → `pnpm pack` → 创建 GitHub Release 并附 tarball。
2. GitHub Release 是**当前的发布渠道**（2026-09-13 决定：npm 发布推迟）。
3. npm 发布**暂时移除**（2026-09-13 决定）：待未来决定发 npm 时，配置 `NPM_TOKEN` secret 并重新加入 publish 步骤，完成 npm 首发双渠道发布。

## 非目标

- 改动包运行时行为；发布流水线只验证并分发既有构建产物。
- ~~解决 Details Host 的 npm 发布~~（已失去意义：Git 已迁移到上游内置右侧边栏，Details Host 废弃，不再存在独立配对包）。

## 方案

Release 全部由 GitHub Actions 完成（`.github/workflows/release.yml`）：tag 触发，单 job 顺序执行测试、构建、打包、创建 GitHub Release。版本一致性用脚本前置校验，失败即终止，避免错版发布。npm publish 步骤已从工作流中移除（2026-09-13：首次运行因缺少 `NPM_TOKEN` 失败，随后决定当前只发 GitHub Release，遂整体删除该步骤而非条件跳过）。

### 依赖与前置

- `NPM_TOKEN` secret 已配置到仓库；
- ~~Details Host 发布到 npm（前置阻塞项）~~ 已消解：Details Host 被废弃，本包 UI 宿主改为上游内置右侧边栏，`@deepseek-ai/dsh-client-ui-sidebar-right@0.1.5-rc.2` 已在 npm（迁移见 git 历史与 [architecture overview](../../architecture/overview.md)）。

## 任务清单

- [x] 新增 `version:set` 脚本并重置版本为 `0.1.0`
- [x] 编写 tag 触发的 Release 工作流并提交入库
- [x] 试运行 `v0.1.0`：测试/构建/打包/GitHub Release 全链路通过（npm publish 因缺 `NPM_TOKEN` 跳过）
- [ ] 重新加入 npm publish 步骤并配置 `NPM_TOKEN`（待 npm 发布决策）
- [x] Details Host 包发布到 npm —— 前置已消解（迁移到上游右侧边栏，无第三方配对包）
- [ ] npm 首发成功并核对 npm 与 GitHub Release 双渠道

## 验证

- 推送测试 tag 后：Actions 全绿；npm 上出现对应版本；GitHub Release 附带 tarball；
- `dsh plugin --profile web add` 能从 npm 安装本包（替代目前的仓库/fixture 安装方式，见根 README [Installation](../../../README.md#installation)）。

## 相关文档

- [requirements/scope-and-requirements](../../requirements/scope-and-requirements.md)（NFR-3 可独立安装与发布）
- [development](../../development/README.md)（构建、测试命令）
