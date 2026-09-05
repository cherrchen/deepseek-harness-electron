/**
 * Git graph rail canvas: draws lanes, edges, and commit nodes for the whole
 * loaded page in ONE continuous coordinate space (see `buildGraphGeometry`),
 * so row boundaries can never break a line. The canvas is a decorative layer
 * (`aria-hidden`) that scrolls together with the commit rows.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GitGraphModel } from './graph-model.ts'
import {
  GIT_GRAPH_COLUMN_WIDTH,
  GIT_GRAPH_NODE_RADIUS,
  GIT_GRAPH_ROW_HEIGHT,
  buildGraphGeometry,
} from './graph-geometry.ts'
import css from './GitGraphSurface.module.css'

/** Lane colors, cycled by lane index. Lane 0 reads the theme brand token. */
const FALLBACK_LANE_COLORS = ['#4c6fff', '#c586c0', '#ce9178', '#4ec9b0', '#dcdcaa', '#9cdcfe']

/** Brand token for lane 0; resolved from computed style so themes apply. */
const BRAND_TOKEN = '--dsw-alias-fg-brand'

/** Attributes whose changes can flip the resolved brand token (dark/light). */
const THEME_ATTRIBUTES: MutationObserverInit = {
  attributes: true,
  attributeFilter: ['class', 'data-ds-dark-theme', 'data-theme', 'data-color-scheme'],
}

/** Resolve the theme-aware lane palette relative to the canvas element. */
function resolveLaneColors(canvas: HTMLCanvasElement): readonly string[] {
  const colors = [...FALLBACK_LANE_COLORS]
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const brand = window.getComputedStyle(canvas).getPropertyValue(BRAND_TOKEN).trim()
    if (brand.length > 0) colors[0] = brand
  }
  return colors
}

/** Render the whole commit page's graph rail as one canvas layer. */
export function GitGraphCanvas({ model }: { model: GitGraphModel }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [themeEpoch, setThemeEpoch] = useState(0)
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === 'undefined' || typeof window.devicePixelRatio !== 'number' ? 1 : window.devicePixelRatio)

  // Redraw when the theme flips: lane 0 resolves a CSS custom property that
  // changes between light and dark.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => { setThemeEpoch(epoch => epoch + 1) })
    observer.observe(document.body, THEME_ATTRIBUTES)
    observer.observe(document.documentElement, THEME_ATTRIBUTES)
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
    const geometry = buildGraphGeometry(model, { rowHeight: GIT_GRAPH_ROW_HEIGHT, columnWidth: GIT_GRAPH_COLUMN_WIDTH })
    canvas.width = Math.ceil(geometry.width * dpr)
    canvas.height = Math.ceil(geometry.height * dpr)
    const context = canvas.getContext('2d')
    if (context === null) return
    context.scale(dpr, dpr)
    const colors = resolveLaneColors(canvas)
    const laneColor = (lane: number): string => colors[lane % colors.length] ?? colors[0] ?? FALLBACK_LANE_COLORS[0] as string
    context.lineWidth = 1.5
    context.lineCap = 'round'
    for (const segment of geometry.segments) {
      context.beginPath()
      context.strokeStyle = laneColor(segment.lane)
      context.moveTo(segment.x1, segment.y1)
      context.lineTo(segment.x2, segment.y2)
      context.stroke()
    }
    for (const node of geometry.nodes) {
      context.beginPath()
      context.fillStyle = laneColor(node.lane)
      context.arc(node.x, node.y, GIT_GRAPH_NODE_RADIUS, 0, Math.PI * 2)
      context.fill()
    }
  }, [model, themeEpoch, devicePixelRatio])

  return <canvas ref={canvasRef} className={css.canvas} aria-hidden="true" />
}
