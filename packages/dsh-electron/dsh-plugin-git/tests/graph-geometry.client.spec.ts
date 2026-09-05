import { describe, expect, it } from 'vitest'
import { computeGitGraph } from '../src/client/graph-model.ts'
import {
  GIT_GRAPH_COLUMN_WIDTH,
  GIT_GRAPH_NODE_RADIUS,
  GIT_GRAPH_ROW_HEIGHT,
  buildGraphGeometry,
} from '../src/client/graph-geometry.ts'
import type { GraphGeometry } from '../src/client/graph-geometry.ts'
import type { GitCommitSummary } from '../src/types.ts'

function commit(hash: string, parents: string[], subject = `commit ${hash}`): GitCommitSummary {
  return {
    hash,
    parents,
    shortHash: hash.slice(0, 7),
    subject,
    author: 'tester',
    date: '2026-01-01T00:00:00Z',
    refs: [],
  }
}

function geometry(commits: readonly GitCommitSummary[]): GraphGeometry {
  return buildGraphGeometry(computeGitGraph(commits), {
    rowHeight: GIT_GRAPH_ROW_HEIGHT,
    columnWidth: GIT_GRAPH_COLUMN_WIDTH,
  })
}

/** The x coordinate a lane renders at. */
function laneX(lane: number): number {
  return lane * GIT_GRAPH_COLUMN_WIDTH + GIT_GRAPH_COLUMN_WIDTH / 2
}

/**
 * Continuity invariant: at every row boundary, the geometry must cover the
 * row transition — for each row i > 0, every lane occupied at row i
 * (its own lane plus its through lanes) must have a segment starting at the
 * row's top edge with no gap, and every edge that ended at row i-1's bottom
 * must be continued there.
 */
function expectBoundaryContinuity(g: GraphGeometry): void {
  const rowCount = g.height / GIT_GRAPH_ROW_HEIGHT
  for (let index = 1; index < rowCount; index += 1) {
    const top = index * GIT_GRAPH_ROW_HEIGHT
    const startsAtTop = g.segments.filter(segment => segment.y1 === top)
    const endsAtBottomAbove = g.segments.filter(segment => segment.y2 === top)
    // Every segment reaching this boundary from above is continued by a
    // segment starting at the same x below it.
    for (const incoming of endsAtBottomAbove) {
      const continued = startsAtTop.some(segment => segment.x1 === incoming.x2)
      expect(continued, `segment at x=${String(incoming.x2)} ends at row boundary y=${String(top)} but nothing continues it`).toBe(true)
    }
  }
}

/** Coverage invariant: every occupied lane of every row is drawn across the full row. */
function expectFullRowCoverage(g: GraphGeometry, model: ReturnType<typeof computeGitGraph>): void {
  model.rows.forEach((row, index) => {
    const top = index * GIT_GRAPH_ROW_HEIGHT
    const center = top + GIT_GRAPH_ROW_HEIGHT / 2
    const bottom = top + GIT_GRAPH_ROW_HEIGHT
    // Through lanes pass the whole row; the commit lane continues downward
    // only while it has outgoing edges (a root commit terminates its rail).
    for (const lane of row.through) {
      const x = laneX(lane)
      const full = g.segments.some(segment =>
        segment.x1 === x && segment.x2 === x && segment.y1 === top && segment.y2 === bottom)
      expect(full, `through lane ${String(lane)} row ${String(index)} not drawn full height`).toBe(true)
    }
    {
      const x = laneX(row.lane)
      const hasTop = g.segments.some(segment =>
        segment.x1 === x && segment.x2 === x && segment.y1 === top && segment.y2 === center)
      expect(hasTop, `lane ${String(row.lane)} row ${String(index)} missing top-half coverage`).toBe(true)
      if (row.edges.length > 0) {
        const hasBottom = g.segments.some(segment =>
          segment.y1 === center && segment.y2 === bottom && Math.min(segment.x1, segment.x2) <= x && Math.max(segment.x1, segment.x2) >= x)
        expect(hasBottom, `lane ${String(row.lane)} row ${String(index)} missing outgoing coverage`).toBe(true)
      }
    }
  })
}

describe('buildGraphGeometry', () => {
  it('keeps one continuous rail across a linear history', () => {
    const g = geometry([
      commit('c4', ['c3']),
      commit('c3', ['c2']),
      commit('c2', ['c1']),
      commit('c1', []),
    ])
    expect(g.width).toBe(GIT_GRAPH_COLUMN_WIDTH)
    expect(g.height).toBe(4 * GIT_GRAPH_ROW_HEIGHT)
    expectFullRowCoverage(g, computeGitGraph([
      commit('c4', ['c3']),
      commit('c3', ['c2']),
      commit('c2', ['c1']),
      commit('c1', []),
    ]))
    expectBoundaryContinuity(g)
    // Nodes sit on row centers of lane 0.
    expect(g.nodes.map(node => node.y)).toEqual([18, 54, 90, 126])
    expect(g.nodes.every(node => node.x === laneX(0))).toBe(true)
    // The last (root) commit draws no outgoing edge.
    const lastRowTop = 3 * GIT_GRAPH_ROW_HEIGHT
    expect(g.segments.some(segment => segment.y1 === lastRowTop + GIT_GRAPH_ROW_HEIGHT / 2 && segment.y2 === lastRowTop + GIT_GRAPH_ROW_HEIGHT)).toBe(false)
  })

  it('keeps diagonals continuous across the branch row boundary', () => {
    const commits = [
      commit('b2', ['b1']),
      commit('a1', ['base']),
      commit('b1', ['base']),
      commit('base', []),
    ]
    const g = geometry(commits)
    expectFullRowCoverage(g, computeGitGraph(commits))
    expectBoundaryContinuity(g)
    // Every diagonal must be continued at the row boundary it reaches: the
    // next row draws a segment starting at exactly the diagonal's x.
    const diagonals = g.segments.filter(segment => segment.x1 !== segment.x2)
    expect(diagonals.length).toBeGreaterThanOrEqual(1)
    for (const diagonal of diagonals) {
      const boundary = diagonal.y2
      const continued = g.segments.some(segment => segment.y1 === boundary && segment.x1 === diagonal.x2)
      expect(continued, `diagonal to x=${String(diagonal.x2)} is not continued at y=${String(boundary)}`).toBe(true)
    }
  })

  it('draws both merge parents and keeps every merge edge continuous', () => {
    const commits = [
      commit('m', ['a', 'b']),
      commit('b', ['base']),
      commit('a', ['base']),
      commit('base', []),
    ]
    const g = geometry(commits)
    expectFullRowCoverage(g, computeGitGraph(commits))
    expectBoundaryContinuity(g)
    // Merge row (index 0) has two outgoing segments from the node center.
    const center = GIT_GRAPH_ROW_HEIGHT / 2
    const outgoing = g.segments.filter(segment => segment.y1 === center && segment.y2 === GIT_GRAPH_ROW_HEIGHT)
    expect(outgoing).toHaveLength(2)
  })

  it('scales lane width and rail x with multiple parallel lanes', () => {
    const commits = [
      commit('c', ['a', 'b']),
      commit('b', ['base']),
      commit('a', ['base']),
      commit('base', []),
    ]
    const g = geometry(commits)
    const model = computeGitGraph(commits)
    expect(g.width).toBe(Math.max(model.laneCount, 1) * GIT_GRAPH_COLUMN_WIDTH)
    expectBoundaryContinuity(g)
  })

  it('positions nodes with the shared node radius and centerline', () => {
    const g = geometry([commit('c1', [])])
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0]!.y).toBe(GIT_GRAPH_ROW_HEIGHT / 2)
    expect(GIT_GRAPH_NODE_RADIUS).toBeGreaterThan(0)
  })
})
