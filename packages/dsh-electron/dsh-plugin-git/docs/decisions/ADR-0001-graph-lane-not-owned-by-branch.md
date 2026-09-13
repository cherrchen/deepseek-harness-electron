# ADR-0001: Graph lane 不归 branch 所有

- **Status**: Accepted
- **Date**: 2026-09-05（Graph 功能落地于 PR #2，`d6490bc`）

## Context

Git Graph 需要把 commit DAG 画成 lane 图。一个直觉做法是让每条 branch / ref 拥有一条永久视觉 lane：branch 从分叉到合并始终占据固定列。旧实现采用过这类模型，后果是"永恒竖线"——lane 在其 ancestry 实际结束之后仍然悬挂渲染，图越宽越乱，且分页加载时列位无法收敛。

## Decision

**Lane 属于"当前正在追踪的一条 ancestry path"（`ActiveLane`），branch / ref 只是 commit 上的 decoration，不拥有 lane。**

规则（详见 [Git Graph Layout Engine](../reference/git-graph-layout.md#核心概念) 一节）：

- Lane 在 ancestry 需要时创建（merge 的 secondary parent、页首提交等），当它等待的 commit（`expectedCommit`）到达时被消费，不再有 pending ancestry 时立即释放；
- `laneId`（逻辑身份）与每行 `column`（视觉列）严格分离，同一 lane 在不同行可以换列；
- HEAD first-parent 链是主脊柱，恒占 column 0（priority 0 保证）。

## Alternatives Considered

- **branch/ref 拥有永久 lane（旧模型）**：实现直观，但产生悬挂的"永恒竖线"，列数随分支数无界增长，分页续接时无法收敛 —— 否决；
- **固定列拓扑排序后一次性布局**：需要全量历史，破坏增量分页加载 —— 否决。

## Consequences

- 正面：lane 生命周期有界，图宽随实际 ancestry 收敛；分页 continuation（`GraphContinuationState`）可以无缝接续列位与颜色；
- 成本：compaction 与换列逻辑必须精确（排序键 `(priority, 上一列, laneId)`），并由 8 条不变量测试锁定（见 reference 文档"测试与 Invariants"）。

## Related Documents

- [Git Graph Layout Engine](../reference/git-graph-layout.md)
- [ADR-0002: Graph lane cap](ADR-0002-graph-lane-cap-max-three-lanes.md)
