/** Stable Git right-sidebar tab identities shared by registration and `ctx.sidebarRight`. */
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** Implementation id (body-seat key) of the Git Changes tab type. */
export const GIT_CHANGES_ID = '@dsh-electron/dsh-plugin-git/changes' as const

/** Implementation id (body-seat key) of the Git Diff tab type. */
export const GIT_DIFF_ID = '@dsh-electron/dsh-plugin-git/diff' as const

/** Implementation id (body-seat key) of the Git Graph tab type. */
export const GIT_GRAPH_ID = '@dsh-electron/dsh-plugin-git/graph' as const

/** Tab kind (`openTab` discriminator) of the Git Changes page. */
export const GIT_CHANGES_KIND = 'git.changes' as const

/** Tab kind claimed by Git diff resource addresses. */
export const GIT_DIFF_KIND = 'git.diff' as const

/** Tab kind (`openTab` discriminator) of the Git Graph page. */
export const GIT_GRAPH_KIND = 'git.graph' as const

/** Which sides of the comparison a Diff tab shows. */
export type GitDiffMode = 'worktree' | 'staged'

/** Open arguments for the Changes page; the repository follows the workspace. */
export interface GitChangesPayload {}

/** Open arguments for one Diff tab. */
export interface GitDiffPayload {
  /** Repository-relative changed path. */
  readonly path: string
  /** `true` compares index↔HEAD; `false` compares working tree↔index. */
  readonly staged: boolean
}

/** Open arguments for the Graph page; the repository follows the workspace. */
export interface GitGraphPayload {}

/** The resource type (host segment after `dsh-resource://`) Git diffs are addressed under. */
export const GIT_DIFF_RESOURCE_PROTOCOL = 'git' as const

const DIFF_PATH_PREFIX = '/diff/'
const STAGED_SEGMENT = '/staged'

/**
 * Address of one diff tab: the path is percent-encoded, and the trailing
 * segment names the compared side. The exact address is the tab identity, so
 * re-opening the same file and side reveals the existing tab.
 * @param path - Repository-relative changed path.
 * @param staged - `true` for index↔HEAD, `false` for working tree↔index.
 * @returns The `dsh-resource://git/...` address.
 */
export function gitDiffAddress(path: string, staged: boolean): string {
  return `dsh-resource://git${DIFF_PATH_PREFIX}${encodeURIComponent(path)}${staged ? STAGED_SEGMENT : '/worktree'}`
}

/**
 * Decode a diff address back into its open payload.
 * @param address - The tab's navigation address.
 * @returns The payload, or `undefined` when the address is not a Git diff.
 */
export function parseGitDiffAddress(address: string): GitDiffPayload | undefined {
  const prefix = `dsh-resource://${GIT_DIFF_RESOURCE_PROTOCOL}${DIFF_PATH_PREFIX}`
  if (!address.startsWith(prefix)) return undefined
  const tail = address.slice(prefix.length)
  const slash = tail.lastIndexOf('/')
  if (slash <= 0) return undefined
  const side = tail.slice(slash + 1)
  if (side !== 'staged' && side !== 'worktree') return undefined
  let path: string
  try {
    path = decodeURIComponent(tail.slice(0, slash))
  } catch {
    return undefined
  }
  if (path.length === 0) return undefined
  return { path, staged: side === 'staged' }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    [GIT_DIFF_RESOURCE_PROTOCOL]: GitDiffPayload
  }
}
