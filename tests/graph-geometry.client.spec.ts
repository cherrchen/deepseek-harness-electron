/** Geometry specs: continuity, dimensions, curves, and node placement. */
import { describe, expect, it } from 'vitest'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_ROW_HEIGHT,
  buildGraphGeometry,
} from '../src/client/graph-geometry.ts'
import { layoutGitGraph } from '../src/client/graph/layout.ts'
import type { GraphPath } from '../src/client/graph-geometry.ts'
import { subtreePattern } from './harness/graph-fixtures.ts'

const GEOMETRY_OPTIONS = { rowHeight: GIT_GRAPH_ROW_HEIGHT, laneGap: GIT_GRAPH_LANE_GAP }

function pathStart(path: GraphPath): { x: number; y: number } {
  const first = path.commands[0]!
  return { x: first.x, y: first.y }
}

function pathEnd(path: GraphPath): { x: number; y: number } {
  const last = path.commands.at(-1)!
  return { x: last.x, y: last.y }
}

describe('buildGraphGeometry', () => {
  it('keeps row boundaries pixel-continuous in both directions', () => {
    const layout = layoutGitGraph(subtreePattern())
    const geometry = buildGraphGeometry(layout, GEOMETRY_OPTIONS)
    for (let boundary = 1; boundary < layout.rows.length; boundary += 1) {
      const y = boundary * GIT_GRAPH_ROW_HEIGHT
      const ending = geometry.paths.filter(path => Math.abs(pathEnd(path).y - y) < 1e-9).map(path => pathEnd(path).x)
      const starting = geometry.paths.filter(path => Math.abs(pathStart(path).y - y) < 1e-9).map(path => pathStart(path).x)
      // Every rail that starts below the boundary continues one that ends
      // above it at the same x: no gaps, no floating segments.
      for (const x of starting) {
        expect(ending.some(endX => Math.abs(endX - x) < 1e-9), `rail starting at (${x}, ${y}) continues across the boundary`).toBe(true)
      }
    }
  })

  it('sizes the canvas from the visible lane count and row count', () => {
    const layout = layoutGitGraph(subtreePattern())
    const geometry = buildGraphGeometry(layout, GEOMETRY_OPTIONS)
    expect(geometry.width).toBe(layout.laneCount * GIT_GRAPH_LANE_GAP)
    expect(geometry.height).toBe(layout.rows.length * GIT_GRAPH_ROW_HEIGHT)
  })

  it('places nodes at lane centers and keeps their semantics', () => {
    const layout = layoutGitGraph(subtreePattern())
    const geometry = buildGraphGeometry(layout, GEOMETRY_OPTIONS)
    expect(geometry.nodes).toHaveLength(layout.rows.length)
    geometry.nodes.forEach((node, index) => {
      const column = layout.rows[index]!.node.column
      expect(node.x).toBe(column * GIT_GRAPH_LANE_GAP + GIT_GRAPH_LANE_GAP / 2)
      expect(node.y).toBe(index * GIT_GRAPH_ROW_HEIGHT + GIT_GRAPH_ROW_HEIGHT / 2)
      expect(node.kind).toBe(layout.rows[index]!.node.kind)
    })
    const mergeNode = geometry.nodes.find(node => node.kind === 'merge')
    expect(mergeNode).toBeDefined()
    const rootNode = geometry.nodes.at(-1)!
    expect(rootNode.kind).toBe('root')
  })

  it('draws forks, merges, and shifts as smooth cubic curves', () => {
    const layout = layoutGitGraph(subtreePattern())
    const geometry = buildGraphGeometry(layout, GEOMETRY_OPTIONS)
    const beziers = geometry.paths.filter(path => path.commands.some(command => command.type === 'bezier'))
    expect(beziers.length).toBeGreaterThan(0)
    for (const path of beziers) {
      for (const command of path.commands) {
        if (command.type !== 'bezier') continue
        // Control points sit at mid height so curves stay local.
        const startY = pathStart(path).y
        const endY = pathEnd(path).y
        const midY = (startY + endY) / 2
        expect(command.cy1).toBeCloseTo(midY, 9)
        expect(command.cy2).toBeCloseTo(midY, 9)
      }
    }
  })

  it('colors every path and node by lane identity, not column', () => {
    const layout = layoutGitGraph(subtreePattern())
    const geometry = buildGraphGeometry(layout, GEOMETRY_OPTIONS)
    for (const path of geometry.paths) expect(path.colorKey).toMatch(/^\d+$/)
    for (const node of geometry.nodes) expect(node.colorKey).toMatch(/^\d+$/)
  })
})
