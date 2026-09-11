/**
 * Git graph layout engine: turns the normalized commit DAG (newest first)
 * into renderer-ready `GraphLayoutRow`s using the active lane model.
 *
 * Core rules:
 * - The HEAD first-parent ancestry is the visual spine (priority 0, column 0
 *   whenever the topology allows).
 * - A lane is an ancestry path, not a branch: it expects one concrete commit,
 *   is released the moment that expectation is satisfied, and never owns a
 *   permanent visual column.
 * - Duplicate incoming lanes collapse into the commit's primary lane and are
 *   released immediately.
 * - After every row the active lanes compact toward the left, keeping the
 *   first-parent spine stable and preserving cross-row edge continuity.
 * - With `maxLanes`, the active lane count is capped: full-pool secondary
 *   parents draw no lane, and unmatched commits evict the lowest-priority
 *   lane (the spine is never evicted).
 *
 * Pure logic: no Git access, no React, no DOM. Pagination continues from a
 * `GraphContinuationState` instead of restarting from empty lanes.
 */
import type { GitCommitSummary } from '../../types.ts'
import { ActiveLanePool, type PoolLane } from './lanes.ts'
import type {
  GraphEdge,
  GraphLanePlacement,
  GraphLayout,
  GraphLayoutOptions,
  GraphLayoutRow,
  GraphNodeKind,
} from './types.ts'

/**
 * Compute the graph layout for a page of commits.
 * @param commits - Commit rows, newest first, children before parents.
 * @param options - Continuation state from the previous page and scope flags.
 * @returns Renderer-ready layout with continuation state for the next page.
 */
export function layoutGitGraph(commits: readonly GitCommitSummary[], options: GraphLayoutOptions = {}): GraphLayout {
  const firstParentOnly = options.firstParentOnly === true
  const maxLanes = options.maxLanes !== undefined && Number.isInteger(options.maxLanes) && options.maxLanes >= 1
    ? options.maxLanes
    : undefined
  const pool = new ActiveLanePool(options.continuation)
  const spineHashes = collectSpineHashes(commits)
  const rows: GraphLayoutRow[] = []

  for (const commit of commits) {
    const matched = pool.matchedTo(commit.hash)
    const merging: GraphLanePlacement[] = []
    let primary: PoolLane
    let hasEntry: boolean
    const [primaryMatched, ...duplicateMatches] = matched
    if (primaryMatched !== undefined) {
      // Primary = highest-priority matched lane; duplicates collapse into the
      // node and are released instead of lingering forever.
      primary = primaryMatched
      for (const lane of duplicateMatches) {
        merging.push({ laneId: lane.id, colorKey: lane.colorKey, column: lane.column })
        pool.release(lane)
      }
      hasEntry = true
    } else {
      const spine = spineHashes.has(commit.hash)
      const priority = spine ? 0 : Math.max(0.5, pool.minPriority() + 0.5)
      if (maxLanes !== undefined && pool.activeCount() >= maxLanes) evictLowestPriorityLane(pool)
      primary = pool.allocate('', priority, spine)
      hasEntry = false
    }
    const entryColumn = primary.column

    const firstParent = commit.parents[0]
    if (firstParent !== undefined) {
      primary.expectedCommit = firstParent
    } else {
      pool.release(primary)
    }

    const secondaryLanes = (firstParentOnly ? [] : commit.parents.slice(1))
      .map((parent) => {
        const existing = pool.laneExpecting(parent)
        if (existing !== undefined) return { lane: existing, allocated: false }
        // Lane budget exhausted: this secondary ancestry draws no lane or edge.
        if (maxLanes !== undefined && pool.activeCount() >= maxLanes) return undefined
        return { lane: pool.allocate(parent, primary.priority + 0.5, false), allocated: true }
      })
      .filter((placement): placement is { lane: PoolLane; allocated: boolean } => placement !== undefined)

    pool.compact()

    const nodeColumn = primary.column
    const edges: GraphEdge[] = []
    if (firstParent !== undefined) {
      edges.push({
        laneId: primary.id,
        colorKey: primary.colorKey,
        fromColumn: nodeColumn,
        toColumn: nodeColumn,
        kind: 'vertical',
      })
    }
    for (const { lane, allocated } of secondaryLanes) {
      edges.push({
        laneId: lane.id,
        colorKey: lane.colorKey,
        fromColumn: nodeColumn,
        toColumn: lane.column,
        kind: allocated ? 'fork' : 'merge',
      })
    }

    const through: GraphLanePlacement[] = pool.all()
      .filter(lane => lane !== primary && !lane.fresh)
      .map(lane => ({
        laneId: lane.id,
        colorKey: lane.colorKey,
        column: lane.column,
        ...(lane.entryColumn !== lane.column ? { entryColumn: lane.entryColumn } : {}),
      }))

    const visibleLaneCount = Math.max(
      1,
      nodeColumn + 1,
      ...edges.map(edge => edge.toColumn + 1),
      ...through.map(placement => placement.column + 1),
      ...merging.map(placement => placement.column + 1),
    )

    rows.push({
      commit,
      node: {
        laneId: primary.id,
        colorKey: primary.colorKey,
        column: nodeColumn,
        kind: nodeKind(commit),
        isHead: commit.refs.includes('HEAD'),
      },
      ...(hasEntry ? { nodeEntryColumn: entryColumn } : {}),
      through,
      merging,
      edges,
      visibleLaneCount,
    })

    pool.settleRow()
  }

  return {
    rows,
    laneCount: rows.reduce((max, row) => Math.max(max, row.visibleLaneCount), 0),
    continuation: pool.snapshot(),
  }
}

/** Node semantics: merges and roots render differently from normal commits. */
function nodeKind(commit: GitCommitSummary): GraphNodeKind {
  if (commit.parents.length === 0) return 'root'
  if (commit.parents.length > 1) return 'merge'
  return 'normal'
}

/**
 * Make room for a new lane on a full pool: release the least important active
 * lane (highest priority value, rightmost on ties). Spine lanes (priority 0)
 * are never evicted; if only spine lanes remain the pool stays over capacity.
 */
function evictLowestPriorityLane(pool: ActiveLanePool): void {
  const candidates = pool.all().filter(lane => lane.priority > 0)
  if (candidates.length === 0) return
  const victim = candidates.reduce((worst, lane) => {
    if (lane.priority > worst.priority) return lane
    if (lane.priority === worst.priority && lane.column > worst.column) return lane
    return worst
  })
  pool.release(victim)
}

/**
 * Collect the HEAD first-parent ancestry hashes present in the page. Lanes
 * carrying these commits form the visual spine; `git log` guarantees every
 * listed commit is reachable, so the walk stays inside the page.
 */
function collectSpineHashes(commits: readonly GitCommitSummary[]): ReadonlySet<string> {
  const byHash = new Map(commits.map(commit => [commit.hash, commit]))
  const hashes = new Set<string>()
  let current = commits.find(commit => commit.refs.includes('HEAD'))
  while (current !== undefined && !hashes.has(current.hash)) {
    hashes.add(current.hash)
    current = byHash.get(current.parents[0] ?? '')
  }
  return hashes
}
