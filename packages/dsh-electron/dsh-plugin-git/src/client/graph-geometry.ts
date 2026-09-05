/**
 * Git graph geometry: turns the renderer-ready graph model into draw
 * primitives in one continuous coordinate space. Pure data — no Git access,
 * no React, no canvas. The single shared coordinate space is what keeps the
 * rail continuous: a row's bottom edge is exactly the next row's top edge,
 * so incoming and outgoing segments always meet at row boundaries.
 */
import type { GitGraphModel } from './graph-model.ts'

/** Rendered height of one commit row; must match `.row` in GitGraphSurface.module.css. */
export const GIT_GRAPH_ROW_HEIGHT = 36

/** Rendered width of one graph lane column. */
export const GIT_GRAPH_COLUMN_WIDTH = 14

/** Node radius in CSS pixels. */
export const GIT_GRAPH_NODE_RADIUS = 4

/** Options for the geometry builder. */
export interface GraphGeometryOptions {
  /** Row height in CSS pixels (`GIT_GRAPH_ROW_HEIGHT` unless tests vary it). */
  readonly rowHeight: number
  /** Lane column width in CSS pixels (`GIT_GRAPH_COLUMN_WIDTH` unless tests vary it). */
  readonly columnWidth: number
}

/** One straight line segment in the shared graph coordinate space. */
export interface GraphSegment {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Lane owning the segment; indexes the lane color palette. */
  readonly lane: number
}

/** One commit node (dot) in the shared graph coordinate space. */
export interface GraphNode {
  readonly x: number
  readonly y: number
  readonly lane: number
}

/** Complete draw plan for one loaded commit page. */
export interface GraphGeometry {
  /** Canvas width in CSS pixels (all lanes). */
  readonly width: number
  /** Canvas height in CSS pixels (all rows). */
  readonly height: number
  /** Line segments: incoming stubs, through rails, outgoing/diagonal edges. */
  readonly segments: readonly GraphSegment[]
  /** Commit nodes. */
  readonly nodes: readonly GraphNode[]
}

/**
 * Build the draw plan for a graph model. Every row contributes:
 * - an incoming stub on its own lane (row top → row center);
 * - full-height rails for lanes passing through;
 * - one outgoing segment per parent edge (row center → row bottom, vertical
 *   or diagonal).
 * @param model - Renderer-ready graph model (see `computeGitGraph`).
 * @param options - Row height and lane column width.
 * @returns The draw plan.
 */
export function buildGraphGeometry(model: GitGraphModel, options: GraphGeometryOptions): GraphGeometry {
  const { rowHeight, columnWidth } = options
  const x = (lane: number): number => lane * columnWidth + columnWidth / 2
  const segments: GraphSegment[] = []
  const nodes: GraphNode[] = []

  model.rows.forEach((row, index) => {
    const top = index * rowHeight
    const center = top + rowHeight / 2
    const bottom = top + rowHeight
    segments.push({ x1: x(row.lane), y1: top, x2: x(row.lane), y2: center, lane: row.lane })
    for (const column of row.through) {
      segments.push({ x1: x(column), y1: top, x2: x(column), y2: bottom, lane: column })
    }
    for (const edge of row.edges) {
      segments.push({ x1: x(edge.from), y1: center, x2: x(edge.to), y2: bottom, lane: edge.to })
    }
    nodes.push({ x: x(row.lane), y: center, lane: row.lane })
  })

  const laneCount = Math.max(model.laneCount, 1)
  return {
    width: laneCount * columnWidth,
    height: model.rows.length * rowHeight,
    segments,
    nodes,
  }
}
