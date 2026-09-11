/**
 * Graph geometry: turns the renderer-ready graph layout into draw primitives
 * in one continuous coordinate space. Pure data — no Git access, no React,
 * no canvas. The single shared coordinate space is what keeps rails
 * continuous: a row's bottom edge is exactly the next row's top edge, and
 * compaction shifts are drawn as local curves inside the row that shifts.
 */
import type { GraphLayout, GraphNodeKind } from './graph/types.ts'

/** Layout input consumed by the geometry builder (continuation not needed). */
export type GraphGeometryLayout = Pick<GraphLayout, 'rows' | 'laneCount'>

/** Rendered height of one commit row; must match `.row` in GitGraphSurface.module.css. */
export const GIT_GRAPH_ROW_HEIGHT = 36

/** Rendered width of one graph lane column. */
export const GIT_GRAPH_LANE_GAP = 16

/** Node radius in CSS pixels. */
export const GIT_GRAPH_NODE_RADIUS = 4

/** Geometry options: row height and lane column width in CSS pixels. */
export interface GraphGeometryOptions {
  readonly rowHeight: number
  readonly laneGap: number
}

/** One path-drawing command in the shared graph coordinate space. */
export type GraphPathCommand =
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'line'; readonly x: number; readonly y: number }
  | {
    readonly type: 'bezier'
    readonly cx1: number
    readonly cy1: number
    readonly cx2: number
    readonly cy2: number
    readonly x: number
    readonly y: number
  }

/** One stroked path (rail, fork, merge, or shift) owned by one row. */
export interface GraphPath {
  /** Row the path belongs to; hover highlights scope to the row's paths. */
  readonly rowIndex: number
  /** Lane color identity; indexes the lane color palette. */
  readonly colorKey: string
  readonly commands: readonly GraphPathCommand[]
}

/** One commit node (dot) in the shared graph coordinate space. */
export interface GraphNodePoint {
  readonly rowIndex: number
  readonly x: number
  readonly y: number
  readonly colorKey: string
  readonly kind: GraphNodeKind
  readonly isHead: boolean
}

/** Complete draw plan for one loaded commit page. */
export interface GraphGeometry {
  /** Canvas width in CSS pixels (all lanes). */
  readonly width: number
  /** Canvas height in CSS pixels (all rows). */
  readonly height: number
  readonly paths: readonly GraphPath[]
  readonly nodes: readonly GraphNodePoint[]
}

/**
 * Build the draw plan for a graph layout. Every row contributes:
 * - the node lane rail (row top → node center; a curve when compaction
 *   shifted the lane on this row);
 * - full-height through rails, splitting into a curve + vertical when the
 *   lane shifts;
 * - merging lanes curving from the row top into the node;
 * - one outgoing path per parent edge (node center → row bottom).
 * @param layout - Renderer-ready graph layout (see `layoutGitGraph`).
 * @param options - Row height and lane column width.
 * @returns The draw plan.
 */
export function buildGraphGeometry(layout: GraphGeometryLayout, options: GraphGeometryOptions): GraphGeometry {
  const { rowHeight, laneGap } = options
  const x = (column: number): number => column * laneGap + laneGap / 2
  const paths: GraphPath[] = []
  const nodes: GraphNodePoint[] = []

  layout.rows.forEach((row, index) => {
    const top = index * rowHeight
    const center = top + rowHeight / 2
    const bottom = top + rowHeight
    const nodeX = x(row.node.column)

    const entryColumn = row.nodeEntryColumn
    if (entryColumn !== undefined) {
      paths.push(entryColumn === row.node.column
        ? linePath(index, row.node.colorKey, x(entryColumn), top, nodeX, center)
        : curvePath(index, row.node.colorKey, x(entryColumn), top, nodeX, center))
    }
    for (const placement of row.through) {
      const railX = x(placement.column)
      const entry = placement.entryColumn
      if (entry !== undefined && entry !== placement.column) {
        paths.push({
          rowIndex: index,
          colorKey: placement.colorKey,
          commands: [
            ...curveCommands(x(entry), top, railX, center),
            { type: 'line', x: railX, y: bottom },
          ],
        })
      } else {
        paths.push(linePath(index, placement.colorKey, railX, top, railX, bottom))
      }
    }
    for (const placement of row.merging) {
      paths.push(curvePath(index, placement.colorKey, x(placement.column), top, nodeX, center))
    }
    for (const edge of row.edges) {
      paths.push(edge.fromColumn === edge.toColumn
        ? linePath(index, edge.colorKey, x(edge.fromColumn), center, x(edge.toColumn), bottom)
        : curvePath(index, edge.colorKey, x(edge.fromColumn), center, x(edge.toColumn), bottom))
    }
    nodes.push({
      rowIndex: index,
      x: nodeX,
      y: center,
      colorKey: row.node.colorKey,
      kind: row.node.kind,
      isHead: row.node.isHead,
    })
  })

  const laneCount = Math.max(layout.laneCount, 1)
  return {
    width: laneCount * laneGap,
    height: layout.rows.length * rowHeight,
    paths,
    nodes,
  }
}

/** Cubic curve commands with horizontal control points at mid height. */
function curveCommands(x1: number, y1: number, x2: number, y2: number): GraphPathCommand[] {
  const midY = (y1 + y2) / 2
  return [
    { type: 'move', x: x1, y: y1 },
    { type: 'bezier', cx1: x1, cy1: midY, cx2: x2, cy2: midY, x: x2, y: y2 },
  ]
}

function curvePath(rowIndex: number, colorKey: string, x1: number, y1: number, x2: number, y2: number): GraphPath {
  return { rowIndex, colorKey, commands: curveCommands(x1, y1, x2, y2) }
}

function linePath(rowIndex: number, colorKey: string, x1: number, y1: number, x2: number, y2: number): GraphPath {
  return {
    rowIndex,
    colorKey,
    commands: [
      { type: 'move', x: x1, y: y1 },
      { type: 'line', x: x2, y: y2 },
    ],
  }
}
