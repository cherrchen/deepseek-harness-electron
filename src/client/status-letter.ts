/** Which Changes list a path currently occupies. */
export type GitChangeKind = 'staged' | 'unstaged' | 'untracked'

/**
 * Compact porcelain letter for a change row (M/A/D/R/U).
 * @param status - Two-character porcelain-v2 index/worktree status.
 * @param kind - Which list the row is rendered in.
 * @returns One status letter for the trailing badge.
 */
export function statusLetter(status: string, kind: GitChangeKind): string {
  if (kind === 'untracked') return 'U'
  const char = kind === 'staged' ? status[0] : status[1]
  if (char === undefined || char === '.' || char === ' ') return '?'
  return char.toUpperCase()
}

/**
 * Color token key for a status letter badge.
 * @param letter - Letter from {@link statusLetter}.
 * @returns Tone used by the badge `data-tone` attribute.
 */
export function statusLetterTone(letter: string): 'modify' | 'add' | 'delete' | 'rename' | 'untracked' {
  if (letter === 'A') return 'add'
  if (letter === 'D') return 'delete'
  if (letter === 'R' || letter === 'C') return 'rename'
  if (letter === 'U' || letter === '?') return 'untracked'
  return 'modify'
}
