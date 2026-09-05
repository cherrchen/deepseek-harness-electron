/** Shared fixtures and invariant checkers for the Git graph layout engine. */
import { expect } from 'vitest'
import type { GitCommitSummary } from '../../src/types.ts'
import { layoutGitGraph } from '../../src/client/graph/layout.ts'
import type { GraphLayout, GraphLayoutRow } from '../../src/client/graph/types.ts'

/** Build one synthetic commit row. */
export function commit(hash: string, parents: readonly string[], refs: readonly string[] = []): GitCommitSummary {
  return {
    hash,
    parents,
    shortHash: hash.slice(0, 7),
    subject: `commit ${hash}`,
    author: 'tester',
    date: '2026-01-01T00:00:00Z',
    refs,
  }
}

/** Fixture A: linear history — one lane, column 0 forever. */
export function linearHistory(): readonly GitCommitSummary[] {
  return [commit('c3', ['c2']), commit('c2', ['c1']), commit('c1', [])]
}

/** Fixture B: simple branch that merges back — lane is created then released. */
export function simpleBranch(): readonly GitCommitSummary[] {
  return [
    commit('a', ['c']),
    commit('c', ['d']),
    commit('b', ['d']),
    commit('d', []),
  ]
}

/** Fixture C: simple merge — first parent stays stable, side lane disappears. */
export function simpleMerge(): readonly GitCommitSummary[] {
  return [
    commit('m', ['a', 'b']),
    commit('a', ['p']),
    commit('b', ['p']),
    commit('p', []),
  ]
}

/** Fixture D: repeated merges of independent short-lived branches. */
export function repeatedMerges(): readonly GitCommitSummary[] {
  return [
    commit('m3', ['c3', 's3']),
    commit('s3', ['base']),
    commit('c3', ['m2']),
    commit('m2', ['c2', 's2']),
    commit('s2', ['base']),
    commit('c2', ['m1']),
    commit('m1', ['c1', 's1']),
    commit('s1', ['base']),
    commit('c1', ['base']),
    commit('base', []),
  ]
}

/**
 * Fixture E: the repository's subtree squash pattern — each integration
 * merge carries a squashed side commit whose parent is the previous squash
 * of the same subtree.
 */
export function subtreePattern(): readonly GitCommitSummary[] {
  return [
    commit('merge-b', ['main-b', 'squash-b'], ['HEAD', 'main']),
    commit('squash-b', ['squash-a']),
    commit('main-b', ['merge-a']),
    commit('merge-a', ['main-a', 'squash-a']),
    commit('squash-a', ['base']),
    commit('main-a', ['base']),
    commit('base', []),
  ]
}

/** Fixture F: two plugins alternating subtree integrations share side lanes. */
export function twoPlugins(): readonly GitCommitSummary[] {
  return [
    commit('b2', ['a2', 'sqB2'], ['HEAD', 'main']),
    commit('sqB2', ['sqB1']),
    commit('a2', ['b1', 'sqA2']),
    commit('sqA2', ['sqA1']),
    commit('b1', ['a1', 'sqB1']),
    commit('sqB1', ['base']),
    commit('a1', ['base', 'sqA1']),
    commit('sqA1', ['base']),
    commit('base', []),
  ]
}

/** Fixture G: an octopus merge with three parents must not crash or leak. */
export function octopusMerge(): readonly GitCommitSummary[] {
  return [
    commit('o', ['a', 'b', 'c']),
    commit('a', ['p']),
    commit('b', ['p']),
    commit('c', ['p']),
    commit('p', []),
  ]
}

/** Fixture H: 200 commits with subtree merges every 10 rows, for pagination. */
export function pagedHistory(pageSize = 100): readonly GitCommitSummary[] {
  const commits: GitCommitSummary[] = []
  const total = pageSize * 2
  const hash = (index: number): string => `c${String(index).padStart(3, '0')}`
  const parent = (index: number): string => (index <= 1 ? 'base' : hash(index - 1))
  const squash = (index: number): string => `s${String(index).padStart(3, '0')}`
  for (let index = total; index >= 1; index -= 1) {
    if (index % 10 === 0) {
      // Integration rows in date order: the merge lands first, the squashed
      // side commit right below it, chained to the previous squash.
      const previousSquash = index > 10 ? squash(index - 10) : 'base'
      commits.push(commit(hash(index), [parent(index), squash(index)]))
      commits.push(commit(squash(index), [previousSquash]))
    } else {
      commits.push(commit(hash(index), [parent(index)]))
    }
  }
  commits.push(commit('base', []))
  return commits
}

/** Fixture I: refs decorate commits without changing topology. */
export function refDecorations(): readonly GitCommitSummary[] {
  return [
    commit('c3', ['c2'], ['HEAD', 'main']),
    commit('c2', ['c1'], ['tag: v1.0']),
    commit('c1', [], ['origin/main']),
  ]
}

/**
 * Column accessor covering every lane rendered on a row: the node column,
 * through rails, and outgoing edge targets.
 */
function rowColumns(row: GraphLayoutRow): number[] {
  return [row.node.column, ...row.through.map(p => p.column), ...row.edges.map(e => e.toColumn)]
}

/**
 * Assert the universal layout invariants (task spec §29) for one layout.
 * @param commits - The commits that were laid out.
 * @param layout - The layout under test.
 * @param options - Fixture-specific expectations (single-ancestry endings,
 *   first-parent scope).
 */
export function assertGraphInvariants(
  commits: readonly GitCommitSummary[],
  layout: GraphLayout,
  options: { singleAncestry?: boolean; firstParentOnly?: boolean } = {},
): void {
  // Invariant 1: exactly one node per visible commit, order preserved.
  expect(layout.rows).toHaveLength(commits.length)
  layout.rows.forEach((row, index) => {
    expect(row.commit.hash).toBe(commits[index]!.hash)
    expect(row.visibleLaneCount).toBeGreaterThanOrEqual(1)
    for (const column of rowColumns(row)) {
      expect(column).toBeGreaterThanOrEqual(0)
      expect(column).toBeLessThan(row.visibleLaneCount)
    }
    // Left-packed columns: node + through + edge targets cover 0..k.
    const columns = [...new Set(rowColumns(row))].sort((a, b) => a - b)
    columns.forEach((column, position) => expect(column).toBe(position))
  })

  const rowIndexByHash = new Map(commits.map((c, index) => [c.hash, index] as const))

  // Invariants 2/3/4: every parent edge targets a real parent row and no
  // ancestry is invented or silently dropped.
  layout.rows.forEach((row, index) => {
    const parents = row.commit.parents
    const secondaryEdges = row.edges.filter(edge => edge.kind !== 'vertical')
    parents.forEach((parent, parentIndex) => {
      const parentIndexInPage = rowIndexByHash.get(parent)
      if (parentIndexInPage === undefined) return
      expect(parentIndexInPage).toBeGreaterThan(index)
      const parentRow = layout.rows[parentIndexInPage]!
      if (parentIndex === 0) {
        expect(row.edges.some(edge => edge.kind === 'vertical')).toBe(true)
        const carried = parentRow.node.laneId === row.node.laneId
          || parentRow.merging.some(placement => placement.laneId === row.node.laneId)
        expect(carried, `first parent edge ${row.commit.hash} -> ${parent}`).toBe(true)
      } else {
        const edge = secondaryEdges.shift()
        expect(edge, `secondary edge ${row.commit.hash} -> ${parent}`).toBeDefined()
        const carried = parentRow.node.laneId === edge!.laneId
          || parentRow.merging.some(placement => placement.laneId === edge!.laneId)
        expect(carried, `secondary edge landing ${row.commit.hash} -> ${parent}`).toBe(true)
      }
    })
  })

  // Truncated parents (below the page end) must stay expected in the
  // continuation state instead of vanishing.
  const continuationExpectations = new Set(layout.continuation.lanes.map(lane => lane.expectedCommit))
  for (const item of commits) {
    for (const [parentIndex, parent] of item.parents.entries()) {
      if (options.firstParentOnly === true && parentIndex !== 0) continue
      if (!rowIndexByHash.has(parent)) {
        expect(continuationExpectations.has(parent), `parent ${parent} of ${item.hash} pending across pages`).toBe(true)
      }
    }
  }

  // Invariant 7: one lane keeps one colorKey everywhere it appears.
  const laneColors = new Map<string, string>()
  const trackLane = (laneId: string, colorKey: string): void => {
    const known = laneColors.get(laneId)
    if (known === undefined) laneColors.set(laneId, colorKey)
    else expect(colorKey, `lane ${laneId} color stability`).toBe(known)
  }
  for (const row of layout.rows) {
    trackLane(row.node.laneId, row.node.colorKey)
    for (const placement of row.through) trackLane(placement.laneId, placement.colorKey)
    for (const placement of row.merging) trackLane(placement.laneId, placement.colorKey)
    for (const edge of row.edges) trackLane(edge.laneId, edge.colorKey)
  }

  // Spine stability: HEAD first-parent rows sit on the priority-0 lane.
  const spineHashes = new Set<string>()
  const byHash = new Map(commits.map(item => [item.hash, item] as const))
  let spine = commits.find(item => item.refs.includes('HEAD'))
  while (spine !== undefined && !spineHashes.has(spine.hash)) {
    spineHashes.add(spine.hash)
    spine = byHash.get(spine.parents[0] ?? '')
  }
  const spineLaneId = layout.rows.find(row => spineHashes.has(row.commit.hash))?.node.laneId
  for (const row of layout.rows) {
    if (!spineHashes.has(row.commit.hash)) continue
    expect(row.node.column, `spine row ${row.commit.hash} column`).toBe(0)
    expect(row.node.laneId).toBe(spineLaneId)
    expect(row.node.colorKey).toBe(laneColors.get(spineLaneId!))
  }

  // Invariant 6 (opt-in): a page that ends on a fully consumed ancestry
  // releases every lane instead of leaking them into the continuation state.
  if (options.singleAncestry === true) {
    expect(layout.continuation.lanes).toHaveLength(0)
  }
}

/** Layout helper for specs. */
export function layoutOf(commits: readonly GitCommitSummary[], options?: Parameters<typeof layoutGitGraph>[1]): GraphLayout {
  return layoutGitGraph(commits, options)
}
