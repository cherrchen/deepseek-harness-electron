/**
 * Real-history acceptance: replay the electron monorepo's actual history
 * (subtree-squash heavy) in date order and topo order, and pin the measured
 * regression guards for compaction, spine stability, and ordering policy.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { layoutGitGraph } from '../src/client/graph/layout.ts'
import type { GitCommitSummary } from '../src/types.ts'
import { assertGraphInvariants } from './harness/graph-fixtures.client.ts'

function loadFixture(name: string): readonly GitCommitSummary[] {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  const rows = JSON.parse(readFileSync(path, 'utf8')) as ReplayRow[]
  return rows.map(row => ({
    hash: row.hash,
    parents: row.parents,
    shortHash: row.hash.slice(0, 7),
    subject: row.subject ?? row.hash,
    author: 'fixture',
    date: '2026-01-01T00:00:00Z',
    refs: row.refs ?? [],
  }))
}

interface ReplayRow {
  readonly hash: string
  readonly parents: readonly string[]
  readonly refs?: readonly string[]
  readonly subject?: string
}

/**
 * The retired first-free-lane algorithm (no duplicate collapsing, no
 * compaction), kept here as the regression baseline for graph width.
 */
function legacyLaneCount(commits: readonly GitCommitSummary[]): number {
  const lanes: Array<string | undefined> = []
  let laneCount = 0
  const firstFree = (): number => {
    const free = lanes.indexOf(undefined)
    if (free !== -1) return free
    lanes.push(undefined)
    return lanes.length - 1
  }
  for (const commit of commits) {
    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      lane = firstFree()
      lanes[lane] = commit.hash
    }
    const edges: number[] = []
    if (commit.parents.length === 0) {
      lanes[lane] = undefined
    } else {
      commit.parents.forEach((parent, index) => {
        let parentLane = lanes.indexOf(parent)
        if (parentLane === -1) {
          parentLane = index === 0 ? lane : firstFree()
          lanes[parentLane] = parent
        }
        edges.push(parentLane)
      })
    }
    const through: number[] = []
    for (let candidate = 0; candidate < lanes.length; candidate += 1) {
      if (lanes[candidate] !== undefined && candidate !== lane) through.push(candidate)
    }
    const lastThrough = through.length > 0 ? (through[through.length - 1] ?? 0) + 1 : 0
    const widestEdge = edges.reduce((max, edge) => Math.max(max, edge + 1), 0)
    laneCount = Math.max(laneCount, lane + 1, widestEdge, lastThrough)
  }
  return laneCount
}

const dateHistory = loadFixture('real-history.json')
const topoHistory = loadFixture('real-history-topo.json')

describe('real history replay (400 commits, 131 merges, subtree-squash heavy)', () => {
  it('satisfies every universal invariant on real topology', () => {
    assertGraphInvariants(dateHistory, layoutGitGraph(dateHistory))
  })

  it('halves the graph width compared to the retired lane model', () => {
    const layout = layoutGitGraph(dateHistory)
    const legacy = legacyLaneCount(dateHistory)
    // Measured: 19 active lanes vs 65 legacy lanes on this window.
    expect(layout.laneCount).toBeLessThan(legacy / 2)
  })

  it('keeps the default first page compact (measured: 5 lanes)', () => {
    const layout = layoutGitGraph(dateHistory.slice(0, 100))
    expect(layout.laneCount).toBeLessThanOrEqual(6)
    const average = layout.rows.reduce((sum, row) => sum + row.visibleLaneCount, 0) / layout.rows.length
    expect(average).toBeLessThanOrEqual(4)
  })

  it('pins the HEAD first-parent spine to column 0 on one stable lane', () => {
    const layout = layoutGitGraph(dateHistory)
    const byHash = new Map(dateHistory.map(commit => [commit.hash, commit] as const))
    const chainHashes = new Set<string>()
    let current = dateHistory.find(commit => commit.refs.includes('HEAD'))
    while (current !== undefined && !chainHashes.has(current.hash)) {
      chainHashes.add(current.hash)
      current = byHash.get(current.parents[0] ?? '')
    }
    const offSpine = layout.rows.filter(row => chainHashes.has(row.commit.hash) && row.node.column !== 0)
    expect(offSpine, 'HEAD first-parent rows must stay on column 0').toHaveLength(0)
    const spineLaneIds = new Set(layout.rows.filter(row => row.node.column === 0).map(row => row.node.laneId))
    expect(spineLaneIds.size).toBe(1)
  })

  it('confirms --date-order compacts better than --topo-order on this repo', () => {
    // Measured: date order peaks at 19 lanes (avg 8.4), topo order at 32
    // (avg 12.4): topo interleaves merges before their integration point,
    // which prolongs every side lane. This pins the ordering policy.
    const dateLayout = layoutGitGraph(dateHistory)
    const topoLayout = layoutGitGraph(topoHistory)
    expect(dateLayout.laneCount).toBeLessThan(topoLayout.laneCount)
    const dateAverage = dateLayout.rows.reduce((sum, row) => sum + row.visibleLaneCount, 0) / dateLayout.rows.length
    const topoAverage = topoLayout.rows.reduce((sum, row) => sum + row.visibleLaneCount, 0) / topoLayout.rows.length
    expect(dateAverage).toBeLessThan(topoAverage)
  })
})
