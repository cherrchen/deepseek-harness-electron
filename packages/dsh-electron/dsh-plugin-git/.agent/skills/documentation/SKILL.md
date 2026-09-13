# Documentation Skill —— 文档维护元规则

本文件是本仓库所有文档工作的**规则本体**。机器校验脚本 `scripts/check-docs.mjs`（`pnpm docs:check`）只机械执行其中可判定的部分；规则解释权与本文件为准。

核心原则一句话：**Documentation is part of the implementation** —— 文档与代码共同演进，文档检查不通过的变更不完整。

## 1. 变更判定

完成任何开发任务前，先判断本次变更是否影响以下任一方面：

- requirements（产品/功能/非功能需求、约束）
- architecture（当前架构、目标架构、系统设计）
- 公共接口 / 配置
- 开发工作流 / 构建行为 / 发布行为
- 模块边界 / 重要工程决策
- 排错知识 / Agent 知识

只要有一项受影响，就**先找到该信息的 canonical document 更新它**，不要机械地新建 Markdown。新建文档永远是最后手段。

## 2. Single Source of Truth

- 每个重要项目事实只有**唯一的 canonical location**。
- 其他文档用链接引用，不复制内容；发现复述即收敛为链接。
- 创建新文档前，必须先检查是否已有文档拥有（或应当拥有）该信息。

## 3. Current 与 Future 分离

文档必须严格区分 **Current / Proposed / Target / Planned / Deprecated / Completed** 六种状态：

- 禁止把"希望以后实现的设计"写成"当前已存在的系统"；
- Current 文档必须能用**当前仓库**验证（对照代码、配置、测试）；
- 描述未来状态时显式标注 Proposed / Target / Planned，完成后改回 Current 并更新或归档对应 Plan。

## 4. 中英双语

- 约定：`foo.md` 为中文 canonical 版，`foo.en.md` 为英文副版，两者是**一个逻辑文档**的两个视图。
- 修改任意一方时，必须检查同步另一方；冲突时**以中文版为准**。
- 不要求逐句直译，但不允许存在重要信息差异（一方独有的段落、数字、结论都不行）。
- **强制双语**：所有 `README.md`（仓库根按既有惯例配对 `README.zh.md`，其余目录配对 `README.en.md`），以及 `.agent/note/` 下的正式文档。
- ADR、Plan、Reference 等不强制双语；**禁止**为不强制双语的文档创建空壳 `.en.md`。

### `*.i18n.yaml` 同步（必须执行项）

双语配对文档旁若有 `foo.i18n.yaml` 记录文件（当前仓库：根 `README.i18n.yaml` 对应 `README.md` ↔ `README.zh.md`），它登记的是**最近一次确认双语一致时**各侧的 git blob hash。修改任意一侧后，必须在**同一变更内**把另一侧同步到位，并立即重新登记双方 sha：

```sh
git hash-object README.md README.zh.md   # 输出写回 README.i18n.yaml 对应键
```

这是文档变更的完成条件之一（与 `pnpm docs:check` 同级）：`docs:check` **不**校验 sha 是否过期，只能靠执行者完成。sha 未刷新的变更视为双语同步状态不可信、未完成。

## 5. README 定位

README 只做 **orientation / navigation / entry point**：

- 描述本目录的边界（收什么、不收什么）、导航到具体文档、给出入口；
- 不许膨胀成完整架构书、PRD 或巨型日志——内容下沉到具体文档，README 只链接；
- 每个 `README.md` 必须有配对英文版，且**互相导航**（双方顶部都有指向对方的链接）。

## 6. ADR 纪律

**仅当**同时满足以下条件才写 ADR：

- 决策存在多个合理方案（即真实做过选择）；
- 有长期架构影响；
- 带来兼容性或维护成本；
- 将来需要知道"为什么这样设计"。

不为实现细节写 ADR。命名 `ADR-0001-short-title.md`（小写 kebab-case），编号唯一、**不复用**；设计改变时把旧 ADR 标记为 `Superseded`（指向新 ADR）并新建，**不重写掩盖历史**。

ADR 必含章节：Status、Date、Context、Decision、Alternatives Considered、Consequences、Related Documents。骨架见 `.agent/templates/adr.md`。

## 7. Plan 生命周期

- 大型实施任务开始时建 `docs/plans/active/foo.md`；
- 完成并验证后移入 `docs/plans/completed/`（同一变更内完成迁移）；
- 不长期滞留 active，也**不因完成而删除**——Plan 是项目历史的一部分。
- 骨架见 `.agent/templates/plan.md`。

## 8. 命名

- 长期文档用小写 kebab-case（ADR 文件名前缀 `ADR-NNNN-` 除外）；
- 禁止 `temp.md`、`draft2.md`、`final.md`、`notes2.md` 这类临时命名；
- 禁止 `_en`、`-en`、`.eng` 等错误英文后缀——正确形式只有 `foo.en.md`。

## 9. 链接

- 项目内一律**相对链接**；
- 禁止开发者机器绝对路径与 `file:` 协议链接，正文（围栏代码之外）中不得出现形如：

  ```text
  /Users/you/...
  /home/you/...
  C:\Users\you\...
  file:///...
  ```

- 移动或重命名文档时，必须修复所有指向它的链接（`pnpm docs:check` 会兜底）。

## 10. 完成清单

文档任务收尾前依次检查：

1. 判断影响面（第 1 条的清单）；
2. 找到 canonical 文档，能更新就不新建；
3. 更新内容；
4. 检查英文副版是否同步（强制双语的文档）；
5. 若改动波及带 `*.i18n.yaml` 记录的文档（如根 README），同步另一侧后重新登记双方 sha（见第 4 条，必须执行项）；
6. 检查项目内链接是否全部有效；
7. 检查 Plan 生命周期（完成的移入 completed）；
8. 运行 `pnpm docs:check`，必须通过。

## 11. 分工边界

- **本文件（SKILL.md）**管"应该怎么维护、为什么"——语义规则由人与 Agent 判断执行；
- **`scripts/check-docs.mjs`（`pnpm docs:check`）**只负责机器可判定的结构不变量：双语配对、链接有效性、命名规范、绝对路径禁令、必需骨架；
- 脚本**不**评价文档质量、架构正确性或翻译自然度——那些由人和 Agent 做 semantic review。
