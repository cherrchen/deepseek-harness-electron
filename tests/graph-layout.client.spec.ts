/** Layout engine specs: task-spec fixtures A–I plus pagination equivalence. */
import { describe, expect, it } from 'vitest'
import { layoutGitGraph } from '../src/client/graph/layout.ts'
import {
  assertGraphInvariants,
  commit,
  linearHistory,
  octopusMerge,
  pagedHistory,
  refDecorations,
  repeatedMerges,
  simpleBranch,
  simpleMerge,
  subtreePattern,
  twoPlugins,
} from './harness/graph-fixtures.ts'

describe('fixture A: linear history', () => {
  it('keeps one lane on column 0 for every row', () => {
    const layout = layoutGitGraph(linearHistory())
    assertGraphInvariants(linearHistory(), layout, { singleAncestry: true })
    expect(layout.laneCount).toBe(1)
    // The page-start row has no incoming rail; every later row continues it.
    expect(layout.rows[0]!.nodeEntryColumn).toBeUndefined()
    for (const row of layout.rows) {
      expect(row.node.column).toBe(0)
      expect(row.node.colorKey).toBe('0')
      if (row !== layout.rows[0]) expect(row.nodeEntryColumn).toBe(0)
    }
    expect(layout.rows.at(-1)!.node.kind).toBe('root')
  })
})

describe('fixture B: simple branch', () => {
  it('creates a secondary lane and releases it after the merge', () => {
    const commits = simpleBranch()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    expect(layout.laneCount).toBe(2)
    // The branch lane is gone once ancestry converges: only the spine lane
    // survives into the continuation state (which is empty after the root).
    expect(layout.continuation.lanes).toHaveLength(0)
  })
})

describe('fixture C: simple merge', () => {
  it('keeps the first parent lane stable and drops the side lane', () => {
    const commits = simpleMerge()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    const mergeRow = layout.rows[0]!
    expect(mergeRow.node.kind).toBe('merge')
    expect(mergeRow.edges.map(edge => edge.kind).sort()).toEqual(['fork', 'vertical'])
    // First-parent ancestry stays on the leftmost lane; the side commit sits
    // on its own lane and both fold together at the shared parent.
    expect(layout.rows[1]!.node.column).toBe(0)
    expect(layout.rows[2]!.node.column).toBe(1)
    const parentRow = layout.rows[3]!
    expect(parentRow.merging).toHaveLength(1)
    expect(parentRow.node.column).toBe(0)
  })
})

describe('fixture D: repeated merges', () => {
  it('never leaks a lane per merge: everything is released at the base', () => {
    const commits = repeatedMerges()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout)
    // Three independent side chains may coexist, but none survives the base
    // commit: no lane is permanently added by repeated merging.
    expect(layout.laneCount).toBeLessThanOrEqual(4)
    expect(layout.continuation.lanes).toHaveLength(0)
  })
})

describe('fixture E: git subtree squash pattern', () => {
  it('keeps the squash chain on one compact side lane that merges locally', () => {
    const commits = subtreePattern()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    // The subtree pattern must never grow beyond spine + one side lane.
    expect(layout.laneCount).toBe(2)
    const squashRow = layout.rows.find(row => row.commit.hash === 'squash-b')!
    const sideLaneId = squashRow.node.laneId
    const sideColor = squashRow.node.colorKey
    // The integration merge folds the side lane in locally (no far travel).
    const mergeRow = layout.rows.find(row => row.commit.hash === 'merge-a')!
    const sideEdge = mergeRow.edges.find(edge => edge.laneId === sideLaneId)!
    expect(sideEdge.kind).toBe('merge')
    expect(sideEdge.colorKey).toBe(sideColor)
    expect(sideEdge.toColumn - mergeRow.node.column).toBeLessThanOrEqual(1)
  })
})

describe('fixture F: two plugins', () => {
  it('reuses one lane per plugin chain instead of accumulating lanes', () => {
    const commits = twoPlugins()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    expect(layout.laneCount).toBe(3)
    // Each squash chain keeps its own lane identity across integrations.
    const sqB2 = layout.rows.find(row => row.commit.hash === 'sqB2')!
    const sqB1 = layout.rows.find(row => row.commit.hash === 'sqB1')!
    expect(sqB2.node.laneId).toBe(sqB1.node.laneId)
    const sqA2 = layout.rows.find(row => row.commit.hash === 'sqA2')!
    const sqA1 = layout.rows.find(row => row.commit.hash === 'sqA1')!
    expect(sqA2.node.laneId).toBe(sqA1.node.laneId)
    expect(sqA2.node.laneId).not.toBe(sqB2.node.laneId)
  })
})

describe('fixture G: octopus merge', () => {
  it('lays out three parents without crashing or leaking lanes', () => {
    const commits = octopusMerge()
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    const octopusRow = layout.rows[0]!
    expect(octopusRow.edges).toHaveLength(3)
    expect(layout.laneCount).toBe(3)
  })
})

describe('fixture I: refs', () => {
  it('decorates commits without changing the topology', () => {
    const decorated = layoutGitGraph(refDecorations())
    const plain = layoutGitGraph(linearHistory())
    expect(decorated.rows.map(row => [row.node.column, row.visibleLaneCount]))
      .toEqual(plain.rows.map(row => [row.node.column, row.visibleLaneCount]))
    expect(decorated.rows[0]!.node.isHead).toBe(true)
    expect(decorated.rows[1]!.node.isHead).toBe(false)
    assertGraphInvariants(refDecorations(), decorated, { singleAncestry: true })
  })
})

describe('fixture H: pagination', () => {
  it('continues lanes across pages exactly like a single-page layout', () => {
    const commits = pagedHistory()
    const whole = layoutGitGraph(commits)
    const pageBreak = 211 // rows include interleaved squash commits
    const first = layoutGitGraph(commits.slice(0, pageBreak))
    const second = layoutGitGraph(commits.slice(pageBreak), { continuation: first.continuation })

    // Invariant 8: two-page layout is topologically identical to one-shot.
    expect(second.rows).toEqual(whole.rows.slice(pageBreak))
    const combined = [...first.rows, ...second.rows]
    expect(combined).toEqual(whole.rows)

    // The page boundary keeps rails running: lanes pending across the break
    // are handed over and their columns match.
    const lastRowOfFirstPage = first.rows.at(-1)!
    const firstRowOfSecondPage = second.rows[0]!
    expect(firstRowOfSecondPage.nodeEntryColumn).toBeDefined()
    expect(firstRowOfSecondPage.nodeEntryColumn).toBeLessThanOrEqual(lastRowOfFirstPage.visibleLaneCount)
    assertGraphInvariants(commits.slice(0, pageBreak), first)
    assertGraphInvariants(commits, whole)
  })

  it('keeps the subtree lane count low across 200 commits', () => {
    const commits = pagedHistory()
    const layout = layoutGitGraph(commits)
    // 20 integration merges, but only spine + one squash lane at any time.
    expect(layout.laneCount).toBe(2)
  })
})

describe('first-parent scope', () => {
  it('follows only first parents and never allocates side lanes', () => {
    // The First Parent scope queries only the HEAD first-parent chain, so
    // the input list contains no side commits at all.
    const chain = subtreePattern().filter(commit => ['merge-b', 'main-b', 'merge-a', 'main-a', 'base'].includes(commit.hash))
    const layout = layoutGitGraph(chain, { firstParentOnly: true })
    assertGraphInvariants(chain, layout, { singleAncestry: true, firstParentOnly: true })
    expect(layout.laneCount).toBe(1)
    for (const row of layout.rows) {
      expect(row.node.column).toBe(0)
      expect(row.edges.every(edge => edge.kind === 'vertical')).toBe(true)
    }
  })
})

describe('spine color', () => {
  it('binds the brand color to the spine lane identity', () => {
    const layout = layoutGitGraph(subtreePattern())
    // Collect every lane's color identity from its node rows.
    const laneColors = new Map(layout.rows.map(row => [row.node.laneId, row.node.colorKey]))
    const spineLaneId = layout.rows[0]!.node.laneId
    expect(layout.rows[0]!.node.colorKey).toBe('0')
    for (const [laneId, colorKey] of laneColors) {
      if (laneId !== spineLaneId) expect(colorKey, `lane ${laneId} color`).not.toBe('0')
    }
  })
})

describe('compaction', () => {
  it('slides the side lane left into a released column without recoloring', () => {
    const commits = [
      commit('m2', ['a2', 'x2']),
      commit('x2', ['a2']),
      commit('a2', ['m1']),
      commit('m1', ['a1', 'x1']),
      commit('x1', ['a1']),
      commit('a1', ['base']),
      commit('base', []),
    ]
    const layout = layoutGitGraph(commits)
    assertGraphInvariants(commits, layout, { singleAncestry: true })
    // After the first side ancestry collapses into `a2`, the second branch
    // reuses the compacted column: the graph never widens over history.
    expect(layout.laneCount).toBe(2)
    const x2Row = layout.rows.find(row => row.commit.hash === 'x2')!
    const x1Row = layout.rows.find(row => row.commit.hash === 'x1')!
    expect(x2Row.node.column).toBe(x1Row.node.column)
    // Same visual slot, different ancestry identities.
    expect(x2Row.node.laneId).not.toBe(x1Row.node.laneId)
  })
})
