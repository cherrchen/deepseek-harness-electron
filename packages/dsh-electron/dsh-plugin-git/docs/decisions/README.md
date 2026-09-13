中文 | [English](README.en.md)

# decisions/ —— 架构决策记录（ADR）

收录**重要设计决策的来龙去脉**：为什么在多个合理方案中选了这一个。

- 准入（四条同时满足才写）：存在多个合理方案；有长期架构影响；带来兼容性或维护成本；将来需要知道"为什么这样设计"。不为实现细节写 ADR。
- 命名 `ADR-NNNN-short-title.md`（小写 kebab-case），编号唯一、不复用；被取代的 ADR 标记 `Superseded` 并链接新 ADR，不重写掩盖历史。
- 必含章节：Status、Date、Context、Decision、Alternatives Considered、Consequences、Related Documents；骨架见 [`.agent/templates/adr.md`](../../.agent/templates/adr.md)。

## 索引

| ADR | 状态 | 主题 |
| --- | --- | --- |
| [ADR-0001](ADR-0001-graph-lane-not-owned-by-branch.md) | Accepted | Graph lane 不归 branch 所有 |
| [ADR-0002](ADR-0002-graph-lane-cap-max-three-lanes.md) | Accepted | Graph 视图最多渲染 3 条 lane |
