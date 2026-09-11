/**
 * Git graph rail canvas: draws lanes, edges, and commit nodes for the whole
 * loaded page in ONE continuous coordinate space (see `buildGraphGeometry`),
 * so row boundaries can never break a line. Forks, merges, and compaction
 * shifts are smooth cubic curves; node shapes distinguish normal commits,
 * merges, roots, and HEAD. The canvas is a decorative layer (`aria-hidden`)
 * that scrolls together with the commit rows.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GraphLayoutRow } from './graph/types.ts'
import {
  GRAPH_THEME_ATTRIBUTES,
  graphLaneColor,
  resolveGraphColors,
} from './graph/colors.ts'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_NODE_RADIUS,
  GIT_GRAPH_ROW_HEIGHT,
  buildGraphGeometry,
  type GraphNodePoint,
} from './graph-geometry.ts'

/** Rail width for one row's directly connected edges while hovered. */
const HOVER_RAIL_WIDTH = 2.5

/** Rail width in the resting state. */
const RAIL_WIDTH = 1.5

/** Render the whole commit page's graph rail as one canvas layer. */
export function GitGraphCanvas({
  rows,
  laneCount,
  hoveredRowIndex,
  className,
}: {
  /** Laid-out graph rows for the loaded pages. */
  rows: readonly GraphLayoutRow[]
  /** Maximum visible lane count across rows. */
  laneCount: number
  /** Row currently hovered; its node and directly connected rails highlight. */
  hoveredRowIndex: number | undefined
  className: string | undefined
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [themeEpoch, setThemeEpoch] = useState(0)
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === 'undefined' || typeof window.devicePixelRatio !== 'number' ? 1 : window.devicePixelRatio)

  // Redraw when the theme flips: the spine lane resolves a CSS custom
  // property that changes between light and dark.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => { setThemeEpoch(epoch => epoch + 1) })
    observer.observe(document.body, GRAPH_THEME_ATTRIBUTES)
    observer.observe(document.documentElement, GRAPH_THEME_ATTRIBUTES)
    return () => { observer.disconnect() }
  }, [])

  // Redraw on DPR changes (window moved across displays).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = (): void => {
      setDevicePixelRatio(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
    const geometry = buildGraphGeometry({ rows, laneCount }, { rowHeight: GIT_GRAPH_ROW_HEIGHT, laneGap: GIT_GRAPH_LANE_GAP })
    // The backing store is DPR-scaled while the CSS box stays at design size:
    // without an explicit style size the canvas displays at its attribute
    // size, which is DPR× too large on Retina displays.
    canvas.width = Math.ceil(geometry.width * dpr)
    canvas.height = Math.ceil(geometry.height * dpr)
    canvas.style.width = `${geometry.width}px`
    canvas.style.height = `${geometry.height}px`
    const context = canvas.getContext('2d')
    if (context === null) return
    context.scale(dpr, dpr)
    const colors = resolveGraphColors(canvas)
    context.lineCap = 'round'
    for (const path of geometry.paths) {
      context.beginPath()
      context.strokeStyle = graphLaneColor(path.colorKey, colors)
      context.lineWidth = path.rowIndex === hoveredRowIndex ? HOVER_RAIL_WIDTH : RAIL_WIDTH
      for (const command of path.commands) {
        if (command.type === 'move') context.moveTo(command.x, command.y)
        else if (command.type === 'line') context.lineTo(command.x, command.y)
        else context.bezierCurveTo(command.cx1, command.cy1, command.cx2, command.cy2, command.x, command.y)
      }
      context.stroke()
    }
    for (const node of geometry.nodes) {
      const color = graphLaneColor(node.colorKey, colors)
      drawNode(context, node, color, node.rowIndex === hoveredRowIndex)
    }
  }, [rows, laneCount, hoveredRowIndex, themeEpoch, devicePixelRatio])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/** Draw one commit node with kind-specific semantics. */
function drawNode(context: CanvasRenderingContext2D, node: GraphNodePoint, color: string, hovered: boolean): void {
  context.beginPath()
  if (node.kind === 'merge') {
    // Merge: ring with a solid core — one commit consuming two ancestries.
    context.fillStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS - 1.5, 0, Math.PI * 2)
    context.fill()
    context.lineWidth = hovered ? 2 : RAIL_WIDTH
    context.strokeStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS + 1, 0, Math.PI * 2)
    context.stroke()
    return
  }
  if (node.kind === 'root') {
    // Root: solid dot with a thin outer ring marking the ancestry start.
    context.fillStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS, 0, Math.PI * 2)
    context.fill()
    context.lineWidth = RAIL_WIDTH
    context.strokeStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS + 2, 0, Math.PI * 2)
    context.stroke()
    return
  }
  if (node.isHead) {
    // HEAD: solid dot with a strong outer ring.
    context.fillStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS, 0, Math.PI * 2)
    context.fill()
    context.lineWidth = hovered ? 2.5 : 1.5
    context.strokeStyle = color
    context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS + 2.5, 0, Math.PI * 2)
    context.stroke()
    return
  }
  // Normal commit: solid dot on its lane.
  context.fillStyle = color
  context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS, 0, Math.PI * 2)
  context.fill()
}
