/**
 * Graph layout model types: the contract between the pure layout engine and
 * the renderer. The engine turns the normalized commit DAG (newest first)
 * into `GraphLayoutRow`s; the renderer only consumes these results and never
 * re-infers Git topology.
 */
import type { GitCommitSummary, GitLogScope } from '../../types.ts'

/**
 * A logical lane: one ancestry path currently being tracked. A lane is not a
 * branch and never permanently owns a visual column — only `colorKey` (the
 * stable color identity) and `priority` (layout preference) belong to it.
 */
export interface LogicalLane {
  /** Stable lane identity, unique per allocation across the whole layout. */
  readonly id: string
  /** Stable color identity; must never be derived from the visual column. */
  readonly colorKey: string
  /** Layout priority; lower values are compacted further to the left. */
  readonly priority: number
}

/** One active lane persisted across a pagination boundary. */
export interface ActiveLaneSnapshot {
  readonly id: string
  readonly colorKey: string
  readonly priority: number
  /** Commit hash the lane expects on a subsequent row. */
  readonly expectedCommit: string
}

/**
 * Layout state handed from one page to the next so a newly loaded page
 * continues the exact lanes (identities, colors, columns) of the previous
 * page instead of restarting from empty lanes.
 */
export interface GraphContinuationState {
  readonly lanes: readonly ActiveLaneSnapshot[]
  readonly nextLaneIndex: number
  readonly nextColorIndex: number
}

/** Commit node semantics rendered by the renderer. */
export type GraphNodeKind = 'normal' | 'merge' | 'root'

/** The commit node of one layout row. */
export interface GraphLayoutNode {
  readonly laneId: string
  readonly colorKey: string
  /** Visual column of the node on this row (after compaction). */
  readonly column: number
  readonly kind: GraphNodeKind
  readonly isHead: boolean
}

/** One lane visible on a row at a concrete visual column. */
export interface GraphLanePlacement {
  readonly laneId: string
  readonly colorKey: string
  readonly column: number
  /**
   * Column of the lane at the row's top edge. Defined (and different from
   * `column`) only when compaction shifted the lane on this row; the renderer
   * draws a local shift diagonal, otherwise a straight rail.
   */
  readonly entryColumn?: number
}

/** Edge kinds understood by the renderer. */
export type GraphEdgeKind = 'vertical' | 'fork' | 'merge' | 'shift'

/**
 * One edge drawn on a row. Outgoing edges (`fork` / `merge`) run from the
 * node at the row center down to the row bottom; `vertical` rails and `shift`
 * diagonals are derived from the node entry column and through placements.
 */
export interface GraphEdge {
  readonly laneId: string
  readonly colorKey: string
  readonly fromColumn: number
  readonly toColumn: number
  readonly kind: GraphEdgeKind
}

/** One rendered commit row, fully resolved for the renderer. */
export interface GraphLayoutRow {
  readonly commit: GitCommitSummary
  readonly node: GraphLayoutNode
  /**
   * Column of the node lane at the row's top edge. Differs from
   * `node.column` when compaction moved the lane on this row, e.g. when a
   * lane to its left merged in and was released. Undefined when the commit
   * has no incoming lane (page start or an unmatched ancestry tip): the
   * renderer draws no incoming rail.
   */
  readonly nodeEntryColumn?: number
  /** Lanes passing straight through the row (excluding the node lane). */
  readonly through: readonly GraphLanePlacement[]
  /**
   * Lanes that end on this row by collapsing into the node (duplicate
   * incoming ancestry). Drawn from the row top into the node, then released.
   */
  readonly merging: readonly GraphLanePlacement[]
  /** Edges leaving the node at the row center toward the row bottom. */
  readonly edges: readonly GraphEdge[]
  /** Number of lanes visible on this row (drives the per-row width). */
  readonly visibleLaneCount: number
}

/** Complete layout for the loaded commits. */
export interface GraphLayout {
  readonly rows: readonly GraphLayoutRow[]
  /** Maximum visible lane count across rows (drives the rendered width). */
  readonly laneCount: number
  /** State to hand to the next page's layout for seamless continuation. */
  readonly continuation: GraphContinuationState
}

/** Options for the layout engine. */
export interface GraphLayoutOptions {
  /** Continuation state from the previously laid out page, if any. */
  readonly continuation?: GraphContinuationState
  /**
   * First Parent scope: follow first parents only, matching
   * `git log --first-parent`. Secondary parents create no lanes or edges.
   */
  readonly firstParentOnly?: boolean
}

export type { GitLogScope }
