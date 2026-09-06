/**
 * Active lane pool: owns the set of lanes currently tracking an ancestry
 * path. A lane is created when ancestry needs it, expects one concrete
 * commit, and is released as soon as that expectation is satisfied (or the
 * ancestry ends) — lanes never outlive their pending ancestry.
 *
 * The pool is pure bookkeeping: no Git access, no React, no rendering. Visual
 * columns are assigned by the layout's compaction step and written back into
 * the pool lanes so allocation heuristics can prefer nearby lanes.
 */
import type { GraphContinuationState } from './types.ts'

/** Mutable lane record maintained by the pool. */
export interface PoolLane {
  readonly id: string
  readonly colorKey: string
  priority: number
  /** Commit hash the lane expects on a subsequent row; set while active. */
  expectedCommit: string
  /** Current visual column, maintained by the layout's compaction. */
  column: number
  /**
   * Column at the start of the row currently being laid out; the layout reads
   * it to draw shift diagonals and resets it after each row.
   */
  entryColumn: number
  /** Whether the lane was created on the row currently being laid out. */
  fresh: boolean
}

/**
 * Order used for lane selection and compaction: HEAD first-parent lanes
 * (priority 0) come first, then side lanes by priority and previous column;
 * creation order breaks remaining ties deterministically.
 */
function laneOrder(lane: PoolLane): readonly (number | string)[] {
  return [lane.priority, lane.column, lane.id]
}

/** Active lane pool with deterministic allocation, release, and compaction. */
export class ActiveLanePool {
  private readonly lanes: PoolLane[] = []
  private nextLaneIndex: number
  private nextColorIndex: number

  constructor(continuation?: GraphContinuationState) {
    this.nextLaneIndex = continuation?.nextLaneIndex ?? 0
    this.nextColorIndex = continuation?.nextColorIndex ?? 0
    const snapshots = continuation?.lanes ?? []
    snapshots.forEach((snapshot, index) => {
      this.lanes.push({
        id: snapshot.id,
        colorKey: snapshot.colorKey,
        priority: snapshot.priority,
        expectedCommit: snapshot.expectedCommit,
        column: index,
        entryColumn: index,
        fresh: false,
      })
    })
  }

  /** Active lanes in compaction order (leftmost first). */
  all(): readonly PoolLane[] {
    return [...this.lanes].sort((a, b) => compareOrder(laneOrder(a), laneOrder(b)))
  }

  /** Number of currently active lanes. */
  activeCount(): number {
    return this.lanes.length
  }

  /** Active lanes currently expecting one commit. */
  matchedTo(hash: string): readonly PoolLane[] {
    return this.all().filter(lane => lane.expectedCommit === hash)
  }

  /** The single active lane expecting `hash`, if any. */
  laneExpecting(hash: string): PoolLane | undefined {
    return this.all().find(lane => lane.expectedCommit === hash)
  }

  /** Highest priority among active lanes (0 when empty). */
  maxPriority(): number {
    return this.lanes.reduce((max, lane) => Math.max(max, lane.priority), 0)
  }

  /** Lowest priority among active lanes (0 when empty). */
  minPriority(): number {
    return this.lanes.reduce((min, lane) => Math.min(min, lane.priority), 0)
  }

  /**
   * Allocate a lane for an unmatched commit. Spine commits claim the brand
   * color when it is free; side lanes take the next cycling palette index.
   * @param expectedCommit - Commit the new lane will wait for (its parent).
   * @param priority - Layout priority for the new lane.
   * @param spine - Whether the lane carries the HEAD first-parent spine.
   * @returns The newly allocated lane.
   */
  allocate(expectedCommit: string, priority: number, spine: boolean): PoolLane {
    let colorIndex = this.nextColorIndex
    if (spine && !this.lanes.some(lane => this.colorIndexOf(lane) === 0)) {
      colorIndex = 0
      this.nextColorIndex = Math.max(this.nextColorIndex, 1)
    } else {
      this.nextColorIndex += 1
    }
    const lane: PoolLane = {
      id: `L${this.nextLaneIndex}`,
      colorKey: String(colorIndex),
      priority,
      expectedCommit,
      column: this.lanes.length,
      entryColumn: this.lanes.length,
      fresh: true,
    }
    this.nextLaneIndex += 1
    this.lanes.push(lane)
    return lane
  }

  /** Release one lane immediately; released lanes stop rendering. */
  release(lane: PoolLane): void {
    const index = this.lanes.indexOf(lane)
    if (index !== -1) this.lanes.splice(index, 1)
  }

  /**
   * Compact active lanes toward the left: columns stay left-packed and follow
   * the lane order. Lanes keep their relative position when nothing changed,
   * so compaction only produces shift edges on rows where the lane set
   * actually changed.
   */
  compact(): void {
    const ordered = this.all()
    ordered.forEach((lane, index) => {
      lane.entryColumn = lane.column
      lane.column = index
    })
  }

  /** Clear per-row bookkeeping after a row has been emitted. */
  settleRow(): void {
    for (const lane of this.lanes) {
      lane.entryColumn = lane.column
      lane.fresh = false
    }
  }

  /** Snapshot the pool for pagination continuation. */
  snapshot(): GraphContinuationState {
    return {
      lanes: this.all().map(lane => ({
        id: lane.id,
        colorKey: lane.colorKey,
        priority: lane.priority,
        expectedCommit: lane.expectedCommit,
      })),
      nextLaneIndex: this.nextLaneIndex,
      nextColorIndex: this.nextColorIndex,
    }
  }

  private colorIndexOf(lane: PoolLane): number {
    const parsed = Number.parseInt(lane.colorKey, 10)
    return Number.isNaN(parsed) ? -1 : parsed
  }
}

/** Lexicographic comparison for heterogeneous order tuples. */
function compareOrder(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'number') return left - right
    return String(left) < String(right) ? -1 : 1
  }
  return 0
}
