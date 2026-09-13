中文 | [English](README.en.md)

# `.agent/note/` —— Coding Agent 长期知识沉淀

本目录存放 **Coding Agent 在多次会话之间需要长期记住的项目知识**。它属于 `.agent/`（Agent 工作与上下文工程基础设施），不是项目正式知识库：正式项目事实一旦有长期价值，必须沉淀到 [`docs/`](../../docs/README.md) 对应目录，不能只留在这里。

## 准入标准

只收录**同时满足**以下两条的知识：

1. 后续 Agent 很可能需要；
2. 重新通过代码考古（翻 git 历史、比对分支、读依赖图）发现成本较高。

典型类别：

- 仓库观察（分支拓扑、镜像/同步关系、目录惯例背后的原因）；
- 兼容性（上游/下游版本耦合、钉死的 fixture、绕行手段）；
- 上游集成（宿主行为假设、集成时序约束）；
- 隐藏耦合（不显现在代码结构里的模块间依赖）；
- 迁移背景（历史包袱的来龙去脉）。

## 明确排除

聊天记录、scratchpad、Chain of Thought、临时 TODO、未验证猜想、一次性报错记录。这些属于会话，不属于本目录。

## 规则

- 文件名小写 kebab-case；
- `.agent/note/` 下的正式文档（README 除外）**强制双语**：`foo.md`（中文 canonical）+ `foo.en.md`（英文副版），冲突以中文为准；
- 提交前运行 `pnpm docs:check`；
- 维护规则见 [`.agent/skills/documentation/SKILL.md`](../skills/documentation/SKILL.md)。

## 当前条目

- [branch-and-mirror-layout.md](branch-and-mirror-layout.md) —— 分支拓扑与 Desktop 仓库 subtree 镜像关系。
