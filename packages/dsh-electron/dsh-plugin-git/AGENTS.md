# Git plugin development

This directory mirrors the canonical `cherrchen/dsh-plugin-git` repository. Keep it independently installable and publishable: package dependencies use registry semver ranges, never `workspace:`.

The Host core depends only on standard DSH services and launches `git` through `ctx.subprocess` with separate argv values. Never add shell interpolation, Electron imports, preload globals, or a dependency on a Desktop provider.

The Client main fiber contains every portable contribution. Native enhancement belongs in a child `ctx.inject(['desktop'], ...)` fiber and declares only the structural methods it consumes. Provider unload must remove the enhancement without removing the core UI.

Use machine-readable Git output and temporary repositories in tests. Keep GitHub and remote credential workflows outside this package until a separate decision adds them.

# 文档系统总纲

**修改仓库前**：先读本文件与 [`docs/README.md`](docs/README.md)，并检查 [`.agent/note/`](.agent/note/README.md) 是否有与本任务相关的沉淀。

原则：**Documentation is part of the implementation** —— 文档与代码共同演进，文档检查不通过的变更不完整。

目录职责：

| 目录 | 职责 |
| --- | --- |
| `docs/requirements/` | 产品、功能与非功能需求、约束 |
| `docs/architecture/` | 当前架构、目标架构、系统设计 |
| `docs/decisions/` | Architecture Decision Records（ADR） |
| `docs/plans/` | 大型实施计划（`active/` 进行中、`completed/` 已完成） |
| `docs/development/` | 开发环境、工作流、测试、构建、发布等工程实践 |
| `docs/reference/` | 稳定技术参考（API、schema、协议、配置） |
| `docs/troubleshooting/` | 复发问题、症状、根因与已验证解法 |
| `.agent/note/` | Agent 长期知识沉淀（准入标准见其 README）；正式知识一律进 `docs/` |

- **Single Source of Truth**：每个重要项目事实只有唯一的 canonical location，其他文档链接引用而非复制；新建文档前先找现有文档。
- **双语**：`foo.md` 中文 canonical + `foo.en.md` 英文副版（README 按既有惯例：根目录配 `README.zh.md`，其余目录配 `README.en.md`）；改一个必须同步另一个，冲突以中文为准。
- **变更影响文档时**（需求、架构、公共接口、配置、工作流、构建/发布、模块边界、重要工程决策、排错知识），在**同一变更内**更新 canonical 文档，完成前运行 `pnpm docs:check` 并使其通过。
- 具体维护规则委托给 [`.agent/skills/documentation/SKILL.md`](.agent/skills/documentation/SKILL.md)；`docs:check` 只做机器可判定的结构校验，语义质量由人和 Agent review。
