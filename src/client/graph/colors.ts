/**
 * Lane colors: a lane's color binds to its logical identity (`colorKey`,
 * assigned at lane creation) — never to the visual column — so compaction and
 * pagination never recolor an ancestry.
 */
import type { GraphEdge, GraphLanePlacement, GraphLayoutNode } from './types.ts'

/** Fallback lane palette, cycled by color index. Index 0 is the spine. */
export const GRAPH_LANE_PALETTE = ['#4c6fff', '#c586c0', '#ce9178', '#4ec9b0', '#dcdcaa', '#9cdcfe'] as const

/** Brand theme token used for the first-parent spine lane. */
export const GRAPH_BRAND_TOKEN = '--dsw-alias-brand-primary'

/** Attributes whose changes can flip the resolved brand token (light/dark). */
export const GRAPH_THEME_ATTRIBUTES: MutationObserverInit = {
  attributes: true,
  attributeFilter: ['class', 'data-ds-dark-theme', 'data-theme', 'data-color-scheme'],
}

/** Numeric color index encoded in a lane's `colorKey`. */
export function graphColorIndex(colorKey: string): number {
  const parsed = Number.parseInt(colorKey, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Resolve the theme-aware lane palette relative to a rendered element. */
export function resolveGraphColors(element: Element): readonly string[] {
  const colors: string[] = [...GRAPH_LANE_PALETTE]
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const brand = window.getComputedStyle(element).getPropertyValue(GRAPH_BRAND_TOKEN).trim()
    if (brand.length > 0) colors[0] = brand
  }
  return colors
}

/** Color of one lane given the resolved palette. */
export function graphLaneColor(colorKey: string, colors: readonly string[]): string {
  return colors.at(graphColorIndex(colorKey) % colors.length) ?? colors[0] ?? ''
}

/** Color of a layout row's node. */
export function graphNodeColor(node: GraphLayoutNode, colors: readonly string[]): string {
  return graphLaneColor(node.colorKey, colors)
}

/** Color of a lane placement (through rail, merging lane, or edge). */
export function graphPlacementColor(placement: GraphLanePlacement | GraphEdge, colors: readonly string[]): string {
  return graphLaneColor(placement.colorKey, colors)
}
