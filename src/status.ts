/** Parsers for machine-readable Git output. */

import type { GitBranch, GitFileChange } from './types.ts'

/** Parsed porcelain-v2 repository state. */
export interface ParsedGitStatus {
  branch: string | null
  head: string | null
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
}

/**
 * Parse `git status --porcelain=v2 --branch -z` without reading human output.
 * @param output - NUL-delimited porcelain-v2 output.
 * @returns normalized branch and change records.
 */
export function parsePorcelainV2(output: string): ParsedGitStatus {
  const result: ParsedGitStatus = {
    branch: null,
    head: null,
    staged: [],
    unstaged: [],
    untracked: [],
  }
  const records = output.split('\0')
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (record === undefined || record === '') continue
    if (record.startsWith('# branch.oid ')) {
      const head = record.slice('# branch.oid '.length)
      result.head = head === '(initial)' ? null : head
      continue
    }
    if (record.startsWith('# branch.head ')) {
      const branch = record.slice('# branch.head '.length)
      result.branch = branch === '(detached)' ? null : branch
      continue
    }
    if (record.startsWith('? ')) {
      result.untracked.push(record.slice(2))
      continue
    }
    if (!record.startsWith('1 ') && !record.startsWith('2 ') && !record.startsWith('u ')) continue
    const fields = record.split(' ')
    const status = fields[1]
    if (status === undefined || status.length !== 2) continue
    const pathField = record.startsWith('1 ')
      ? fields.slice(8).join(' ')
      : fields.slice(9).join(' ')
    const originalPath = record.startsWith('2 ') ? records[++index] : undefined
    const change: GitFileChange = {
      path: pathField,
      status,
      ...originalPath === undefined || originalPath === '' ? {} : { originalPath },
    }
    if (status[0] !== '.') result.staged.push(change)
    if (status[1] !== '.') result.unstaged.push(change)
  }
  return result
}

/**
 * Parse local branch rows emitted with NUL field separators.
 * @param output - newline-delimited branch rows.
 * @returns normalized local branches.
 */
export function parseBranches(output: string): GitBranch[] {
  return output.split('\n').flatMap((line) => {
    if (line === '') return []
    const [name, head, current] = line.split('\0')
    if (name === undefined || name === '' || head === undefined) return []
    return [{ name, head, current: current === '*' }]
  })
}
