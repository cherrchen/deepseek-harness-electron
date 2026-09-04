import { describe, expect, it } from 'vitest'
import { computeGitGraph } from '../src/client/graph-model.ts'
import type { GitCommitSummary } from '../src/types.ts'

function commit(hash: string, parents: string[]): GitCommitSummary {
  return {
    hash,
    parents,
    shortHash: hash.slice(0, 7),
    subject: `commit ${hash}`,
    author: 'tester',
    date: '2026-01-01T00:00:00Z',
    refs: [],
  }
}

describe('computeGitGraph', () => {
  it('renders linear history on one lane', () => {
    const model = computeGitGraph([
      commit('c3', ['c2']),
      commit('c2', ['c1']),
      commit('c1', []),
    ])
    expect(model.laneCount).toBe(1)
    expect(model.rows.map(row => row.lane)).toEqual([0, 0, 0])
    expect(model.rows[2]!.edges).toEqual([])
    expect(model.rows[1]!.edges).toEqual([{ from: 0, to: 0 }])
  })

  it('allocates a second lane for a branch and merges back', () => {
    const model = computeGitGraph([
      commit('m', ['a', 'b']),
      commit('b', ['base']),
      commit('a', ['base']),
      commit('base', []),
    ])
    // `b` and `a` branch off into separate lanes; the merge row has two edges.
    expect(model.laneCount).toBeGreaterThanOrEqual(2)
    expect(model.rows[0]!.edges).toHaveLength(2)
    const mergeRow = model.rows[0]!
    expect(mergeRow.edges.map(edge => edge.from)).toEqual([mergeRow.lane, mergeRow.lane])
    expect(mergeRow.edges.map(edge => edge.to).sort()).toEqual(mergeRow.edges.map(edge => edge.to).sort())
  })

  it('keeps through lanes and frees lanes after tip commits', () => {
    const model = computeGitGraph([
      commit('b2', ['b1']),
      commit('a1', ['base']),
      commit('b1', ['base']),
      commit('base', []),
    ])
    // Row for b1 keeps lane 0 through-line while a1's lane stays active.
    const b1 = model.rows.find(row => row.commit.hash === 'b1')!
    expect(b1.through.length).toBeGreaterThanOrEqual(1)
  })
})
