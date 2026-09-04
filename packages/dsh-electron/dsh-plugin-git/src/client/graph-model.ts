/**
 * Git graph model: turns the linear `git log` commit page into renderer-ready
 * rows with lane assignments and edge segments. Pure data — no Git access,
 * no React.
 */
import type { GitCommitSummary } from '../types.ts'

/** One edge leaving a commit row toward a parent row. */
export interface GitGraphEdge {
  /** Lane of the commit at this row. */
  readonly from: number
  /** Lane the parent occupies on the next row. */
  readonly to: number
}

/** One rendered commit row. */
export interface GitGraphRow {
  /** The commit at this row. */
  readonly commit: GitCommitSummary
  /** Lane index of the commit node (0 = leftmost). */
  readonly lane: number
  /** Number of lanes this row occupies (controls the rendered width). */
  readonly laneCount: number
  /** Edges from this row's node down to its parents' lanes. */
  readonly edges: readonly GitGraphEdge[]
  /** Lanes that pass straight through this row (continuation lines). */
  readonly through: readonly number[]
}

/** Computed graph for one loaded commit page. */
export interface GitGraphModel {
  readonly rows: readonly GitGraphRow[]
  /** Maximum lane count across all rows (rendered column count). */
  readonly laneCount: number
}

/**
 * Compute the graph model for a commit page (newest first). Every commit
 * lands on the lane its first parent reserved; merge parents allocate new
 * lanes; completed branches free their lane for reuse.
 * @param commits - Commit rows, newest first.
 * @returns The renderer-ready graph model.
 */
export function computeGitGraph(commits: readonly GitCommitSummary[]): GitGraphModel {
  /** Hash expected in each lane on the next row; `undefined` frees the lane. */
  const lanes: Array<string | undefined> = []
  const rows: GitGraphRow[] = []

  for (const commit of commits) {
    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      lane = firstFreeLane(lanes)
      lanes[lane] = commit.hash
    }

    const edges: GitGraphEdge[] = []
    if (commit.parents.length === 0) {
      lanes[lane] = undefined
    } else {
      commit.parents.forEach((parent, index) => {
        let parentLane = lanes.indexOf(parent)
        if (parentLane === -1) {
          parentLane = index === 0 ? lane : firstFreeLane(lanes)
          lanes[parentLane] = parent
        }
        edges.push({ from: lane, to: parentLane })
      })
    }

    const through: number[] = []
    for (let candidate = 0; candidate < lanes.length; candidate += 1) {
      const expected = lanes[candidate]
      if (expected !== undefined && candidate !== lane) through.push(candidate)
    }
    const laneCount = Math.max(lane + 1, edges.reduce((max, edge) => Math.max(max, edge.to + 1), 0), through.length > 0 ? through.at(-1)! + 1 : 0)
    rows.push({ commit, lane, laneCount, edges, through })
  }

  return { rows, laneCount: rows.reduce((max, row) => Math.max(max, row.laneCount), 0) }
}

function firstFreeLane(lanes: Array<string | undefined>): number {
  const free = lanes.indexOf(undefined)
  if (free !== -1) return free
  lanes.push(undefined)
  return lanes.length - 1
}
