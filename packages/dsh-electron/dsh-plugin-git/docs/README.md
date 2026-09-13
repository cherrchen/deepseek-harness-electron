中文 | [English](README.en.md)

# 项目文档库

本目录是 **dsh-plugin-git 的正式知识库**：与代码共同演进、可长期引用的项目事实都住在这里。`.agent/` 是 Agent 工作与上下文工程基础设施，不是正式知识库——正式项目事实一旦有长期价值，必须沉淀到本目录，不能只存在于 `.agent/` 或对话历史。

核心原则：**Documentation is part of the implementation** —— 文档与代码共同演进，`pnpm docs:check` 不通过的变更不完整。具体维护规则见 [`.agent/skills/documentation/SKILL.md`](../.agent/skills/documentation/SKILL.md)。

## 文档地图

| 目录 | 边界 |
| --- | --- |
| [`requirements/`](requirements/README.md) | 产品、功能与非功能需求、约束 |
| [`architecture/`](architecture/README.md) | 当前架构、目标架构、系统设计 |
| [`decisions/`](decisions/README.md) | Architecture Decision Records（ADR） |
| [`plans/`](plans/README.md) | 大型实施计划（`active/` 进行中，`completed/` 已完成） |
| [`development/`](development/README.md) | 开发环境、工作流、测试、构建、发布等工程实践 |
| [`reference/`](reference/README.md) | 稳定技术参考（API、schema、协议、配置） |
| [`troubleshooting/`](troubleshooting/README.md) | 复发问题、症状、根因与已验证的解决方案 |

## 基本原则

1. **Single Source of Truth**：每个重要项目事实只有唯一的 canonical location；其他文档链接引用而非复制；新建文档前先找现有文档。
2. **Current 与 Future 分离**：显式区分 Current / Proposed / Target / Planned / Deprecated / Completed；禁止把"希望以后实现的"写成"当前已存在的"；Current 文档必须能用当前仓库验证。
3. **中英双语**：`foo.md` 为中文 canonical 版，`foo.en.md` 为英文副版，是一个逻辑文档的两个视图；冲突以中文为准。所有 README 强制双语（仓库根按既有惯例配对 `README.zh.md`）；ADR / Plan / Reference 不强制，且禁止创建空壳 `.en.md`。
4. **README 只做导航**：orientation / navigation / entry point，内容下沉到具体文档。
5. **命名与链接**：小写 kebab-case；项目内一律相对链接；禁止临时命名与开发者机器绝对路径。
6. **变更即文档**：变更影响需求、架构、接口、配置、工作流、构建/发布、模块边界、工程决策或排错知识时，在同一变更内更新 canonical 文档；完成前运行 `pnpm docs:check`。
