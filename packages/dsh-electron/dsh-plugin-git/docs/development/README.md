中文 | [English](README.en.md)

# development/ —— 工程实践

收录**如何开发、测试、构建与发布本包**：环境、工作流、测试约定、构建链路与发布流程。

- 收：工具链版本、常用命令、测试与 fixture 约定、CI/CD 说明、发布流程。
- 不收：包的运行时行为与配置（→ 根 `README.md`）、架构设计（→ [`../architecture/`](../architecture/README.md)）、发布计划的执行状态（→ [`../plans/active/`](../plans/active/README.md)）。

## 快速入口

工具链：Node.js `^22.19.0 || >=24.0.0`，pnpm 11（`packageManager` 钉定）。

| 目的 | 命令 |
| --- | --- |
| 安装（锁文件严格模式） | `pnpm install --frozen-lockfile` |
| 全量测试 | `pnpm test` |
| 构建产物 bundle/manifest 断言 | `pnpm test:artifact` |
| 构建（类型 + bundle） | `pnpm build` |
| 文档机器校验 | `pnpm docs:check` |
| 设置版本号 | `pnpm version:set <version>` |

发布流程的状态与细节见 [npm-first-release 计划](../plans/active/npm-first-release.md)。CI 在 `.github/workflows/ci.yml`（PR 与 main push 跑测试），Release 工作流见 `.github/workflows/release.yml`。

测试约定：使用机器可读 Git 输出与临时仓库；客户端规格用 jsdom + `@testing-library/react`；Graph 布局的 fixtures 与不变量见 [`../reference/git-graph-layout.md`](../reference/git-graph-layout.md#测试与-invariants)。
