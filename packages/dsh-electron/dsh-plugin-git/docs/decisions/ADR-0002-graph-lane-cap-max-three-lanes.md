# ADR-0002: Git Graph 视图最多渲染 3 条 lane

- **Status**: Accepted
- **Date**: 2026-09-05（Graph 功能落地于 PR #2，`d6490bc`）

## Context

详情面板宽度由宿主控制（写成本 ADR 时是 Details Host 的 300–520px 面板；现为上游右侧边栏，宽度由侧栏 ui-dockkit 布局拥有）。Graph 行高 36px、lane 间距 16px，真实 monorepo 历史上 `--date-order` 布局的峰值 lane 数可达 19（见 [Git Graph Layout Engine · Ordering policy](../reference/git-graph-layout.md#ordering-policy实测决策)）。不加限制时，Graph 在面板内要么横向滚动严重，要么列宽被压缩到不可读。

## Decision

**Graph 视图同时最多渲染 3 条 lane。** 客户端常量 `GIT_GRAPH_MAX_LANES = 3`（`src/client/controller.ts`）通过 `GraphLayoutOptions.maxLanes` 传入 layout engine；不传则不设限，engine 保持通用。

达到上限时按确定性顺序截断：

- Secondary parent（merge 侧线）：pool 已满时不再分配 lane，也不绘制对应 fork/merge 边；
- Unmatched commit（页首/无 lane 等待的新祖先 tip）：先逐出一条低优先级 lane（`priority` 最大者，同分取最右列；spine lane 永不逐出；仅剩 spine 时允许超额分配保证拓扑正确）；
- 被丢弃/逐出的 lane 竖线在最后一行自然结束，与 release 渲染行为一致。

调整上限只改客户端常量，不改 engine。

## Alternatives Considered

- **不设上限 + 横向滚动**：面板场景下可用性差 —— 否决；
- **按面板宽度动态计算 lane 数**：列数随宿主布局抖动，continuation 状态在分页间不一致 —— 否决；
- **SVG 缩放以容纳全部 lane**：节点文字过小，不可读 —— 否决。

## Consequences

- 正面：Graph 在宿主详情面板（现为右侧边栏）内始终可读，分页性能有界；
- 取舍：被截断的 secondary ancestry 不画线，"parent edge 不消失"不变量在 `maxLanes` 生效时不再全量成立（该不变量仅在未设限时断言，见 `tests/graph-layout.client.spec.ts` 的 lane cap 用例）。

## Related Documents

- [Git Graph Layout Engine](../reference/git-graph-layout.md)
- [ADR-0001: Graph lane 不归 branch 所有](ADR-0001-graph-lane-not-owned-by-branch.md)
