# Git Graph Layout Engine

本文档描述 Git Graph 的 DAG → Layout → Renderer 链路。核心结论先行：

> **ADR：Git branch / ref 不拥有 graph lane。**
> Lane 属于当前正在追踪的一条 ancestry path。Ref 只是 commit 上的 decoration。

## 数据流

```text
git log --date-order (--all | --first-parent)
      │  GitService.log() — Host 侧 CLI，机器可读格式
      ▼
GitCommitSummary[]        （hash / parents / subject / refs …）
      │  Connection RPC /git → log
      ▼
GitClientController       （分页加载 + 保存 GraphContinuationState）
      │  layoutGitGraph(commits, { continuation, firstParentOnly })
      ▼
GraphLayout               （rows + laneCount + continuation）
      │  buildGraphGeometry()
      ▼
路径命令 + 节点            （单一连续坐标系）
      │
      ▼
GitGraphCanvas（Canvas 2D）+ GitGraphSurface（DOM 行）
```

Layout Engine 位于 `src/client/graph/`，是纯逻辑模块：不访问 Git、不依赖 React、不触碰 DOM，可独立测试。

## 核心概念

### Active Lane

一个 `ActiveLane` 表示"正在被追踪的一条 ancestry path"，它等待一个具体的 commit（`expectedCommit`）。规则：

- Lane 在 ancestry 需要时创建（merge 的 secondary parent、页首提交等）；
- 当它等待的 commit 到达时被消费；
- 一旦不再有 pending ancestry，立即释放；
- Lane **不是** branch 的永久所有权，也**不**永久绑定某个视觉列。

`priority` 决定 compaction 时的左右顺序：HEAD first-parent 的 lane 恒为 `priority 0`，side lane 为其来源 lane 的 `priority + 0.5`。

### Logical Lane 与 Visual Column 分离

`laneId`（逻辑身份）与每行的 `column`（视觉列）严格分离。同一逻辑 lane 在不同行可以占据不同 column（例如左侧 lane 释放后整体左移一格）。禁止 `laneId === column` 的等价设计。

### First-Parent Spine

HEAD 的 first-parent 链是视觉主脊柱：

- 主链 commit 恒定占据 column 0（由 priority 0 保证）；
- merge 的 `parents[0]` 优先继承当前 lane，不因 merge 换道；
- `parents[1..]` 就近创建或复用 side lane（fork 边），已存在等待该 parent 的 lane 时直接汇入（merge 边）。

### Collapse 与 Release

- **多条 lane 汇入同一 commit**（收敛祖先）：只有 primary lane 存活，其余 lane 以 merge 曲线汇入节点后立即释放 —— 绝不允许重复 lane 永久悬空（这是旧实现"永恒竖线"的根因）；
- **root commit**：节点所在 lane 释放；
- 分页边界处仍未到达 `expectedCommit` 的 lane 通过 continuation state 存活到下一页。

### Lane Compaction

每行处理完后，active lanes 按 `(priority, 上一列, laneId)` 排序并左压为 `0..n-1`。集合不变时列不变（无抖动）；释放/插入只在该行产生一条局部 shift 曲线。优先级顺序：topology correctness > first-parent stability > lane continuity > minimize crossing > minimize width。

### Lane Color

`colorKey` 在 lane 创建时分配（spine 优先占用 brand 色 0），终身不变；颜色查 `palette[colorKey % len]`，与 column 无关，与分页无关。Spine 色来自主题 token `--dsw-alias-brand-primary`。

## Pagination Continuation

```ts
interface GraphContinuationState {
  lanes: ActiveLaneSnapshot[]   // id / colorKey / priority / expectedCommit
  nextLaneIndex: number
  nextColorIndex: number
}
```

控制器在每次 `loadGraph` 后保存该状态；追加页调用 `layoutGitGraph(newCommits, { continuation })` 增量布局，从上一页末尾的 lanes 接续（列与颜色无缝衔接），而不是从空 lanes 重启。engine 同时支持一次性全量布局，两者由测试保证拓扑等价（Invariant 8）。

## Graph Scope（视图策略，非伪造拓扑）

| Scope | git 行为 | 布局选项 |
| --- | --- | --- |
| Auto（默认） | `git log --date-order`（HEAD ancestry） | 默认 |
| All | `git log --all --date-order` | 默认 |
| First Parent | `git log --first-parent --date-order` | `firstParentOnly: true`：secondary parent 不产生 lane/edge |

Scope 只改变"查询哪些历史"，不改变已查询历史的拓扑表达。

### Ordering policy（实测决策）

在真实 monorepo 历史（400 commits / 131 merges / subtree-squash 密集）上的对比：

| ordering | 峰值 lane 数 | 平均 lane 数 |
| --- | --- | --- |
| `--date-order`（保留） | 19 | 8.4 |
| `--topo-order` | 32 | 12.4 |

`--date-order` 让 side commit 紧邻其 integration commit，side lane 生命周期更短，故保留为默认。见 `tests/graph-history.client.spec.ts`。

## Renderer 契约

Renderer 只消费 `GraphLayoutRow`：

- `node`：列位置 + 语义（`normal` / `merge` / `root` / `isHead`），分别渲染实心点 / 环+芯 / 带外环节点 / HEAD 双环；
- `nodeEntryColumn`：行顶列位 —— 与 `node.column` 不同时渲染 shift 曲线；
- `through`：贯穿轨道（带可选 shift）；
- `merging`：本行汇入节点的 lane（释放前最后一笔）；
- `edges`：节点向下的 `vertical` / `fork` / `merge` 边；
- `visibleLaneCount`：该行可见 lane 数，graph 宽度 = `laneCount × GIT_GRAPH_LANE_GAP(16px)` 动态计算。

Fork / merge / shift 使用 cubic Bezier（控制点在行高中点），横向偏移保持局部，避免大跨度折线。行高 36px 为 canvas 与 DOM 的共享契约；行间零间隙，行边界像素级连续。

## 测试与 Invariants

`tests/harness/graph-fixtures.ts` 提供 fixtures A–I（线性 / 分支 / 合并 / 重复合并 / subtree squash / 双插件交替 / octopus / 分页 / refs）与通用断言；`tests/graph-history.client.spec.ts` 用真实仓库历史回放。固定不变量：

1. 每个 visible commit 恰有一个 node；
2. 所有 parent edge 对应真实 `commit -> parent`；
3. 不创建不存在的 ancestry；
4. parent edge 不消失（页尾截断的 parent 必须存活于 continuation）；
5. inactive lane 最终释放；
6. 只剩一个 active ancestry 时 `visibleLaneCount === 1`；
7. logical lane 颜色不受 compaction 影响；
8. `layout(page1) + layout(page2, continuation)` 与 `layout(all)` 拓扑等价。

## Compact Integrations（后续阶段）

本次已预留扩展点：`GraphLayoutRow` 可承载 `collapsed-integration` 类型的行。下一阶段接入方式：

1. 在 layout 层增加候选判定 —— 依据拓扑（secondary-parent ancestry + 无 visible ref + 仅作为 integration side history），**禁止**基于 commit subject（如 `Squashed` 前缀）判定；
2. 将连续的 side-history 行折叠为单行，保留可展开的真实 DAG；
3. UI 提供展开交互，绝不永久隐藏 Git history。

## 相关决策记录

- **Git branch/ref 不拥有 graph lane**（本文档开头 ADR）—— 后续维护必须长期遵循。
- Renderer 保持 Canvas 2D 实现；geometry 输出与绘制命令解耦，未来可替换为 SVG/Canvas 渲染器而不改 Layout Engine。
- 详情面板宽度由 Details Host 控制（300–520px），Graph 列宽按 visible lanes 动态收缩/增长，不硬编码。
