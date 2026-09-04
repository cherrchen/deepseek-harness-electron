/** Count unique changed paths across staged, unstaged, and untracked lists. */

import type { GitRepositorySnapshot } from '../types.ts'

/**
 * Count distinct repository-relative paths with any working-tree change.
 * @param snapshot - Current repository status snapshot.
 * @returns Number of unique changed paths.
 */
export function changedPathCount(snapshot: GitRepositorySnapshot): number {
  const paths = new Set<string>()
  for (const change of snapshot.staged) paths.add(change.path)
  for (const change of snapshot.unstaged) paths.add(change.path)
  for (const path of snapshot.untracked) paths.add(path)
  return paths.size
}
