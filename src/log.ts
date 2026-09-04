/**
 * `git log --graph`-free commit record parsing: the service emits a
 * record/field delimited format and this module normalizes it into
 * {@link GitCommitSummary} rows for the graph model.
 */
import type { GitCommitSummary } from './types.ts'

/** Record separator between commits (%x1e). */
const RECORD = '\u001e'
/** Field separator inside one commit record (%x1f). */
const UNIT = '\u001f'

/** Format string producing one delimited record per commit. */
export const GIT_LOG_FORMAT = '%H%x1f%P%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%D%x1e'

/**
 * Parse `git log --format=${GIT_LOG_FORMAT}` output.
 * @param text - Raw command output.
 * @returns Commit rows in output order (newest first); malformed records are skipped.
 */
export function parseGitLog(text: string): GitCommitSummary[] {
  const commits: GitCommitSummary[] = []
  for (const record of text.split(RECORD)) {
    const trimmed = record.replace(/^\n+/u, '')
    if (trimmed.length === 0) continue
    const [hash, parents, shortHash, subject, author, date, decorations] = trimmed.split(UNIT)
    if (hash === undefined || hash.length === 0 || shortHash === undefined || subject === undefined) continue
    commits.push({
      hash,
      parents: parents === undefined || parents.length === 0 ? [] : parents.split(' '),
      shortHash,
      subject,
      author: author ?? '',
      date: date ?? '',
      refs: parseDecorations(decorations ?? ''),
    })
  }
  return commits
}

/**
 * Split the `%D` decoration list into display refs, dropping `HEAD ->` wiring
 * (the branch name itself remains) and empties.
 * @param decorations - Raw `%D` value, comma separated.
 * @returns Ref names in decoration order; `HEAD` first when present.
 */
export function parseDecorations(decorations: string): readonly string[] {
  const refs: string[] = []
  for (const raw of decorations.split(',')) {
    const ref = raw.trim()
    if (ref.length === 0) continue
    if (ref.startsWith('HEAD -> ')) {
      const branch = ref.slice('HEAD -> '.length)
      if (!refs.includes('HEAD')) refs.push('HEAD')
      if (branch.length > 0 && !refs.includes(branch)) refs.push(branch)
      continue
    }
    if (!refs.includes(ref)) refs.push(ref)
  }
  return refs
}
