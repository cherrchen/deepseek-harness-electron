import { describe, expect, it } from 'vitest'
import { parseBranches, parsePorcelainV2 } from '../src/status.ts'

describe('Git machine output parsers', () => {
  it('normalizes staged, unstaged, untracked, rename, and detached records', () => {
    const parsed = parsePorcelainV2([
      '# branch.oid abcdef',
      '# branch.head (detached)',
      '1 M. N... 100644 100644 100644 a b staged.txt',
      '1 .M N... 100644 100644 100644 a b working tree.txt',
      '2 R. N... 100644 100644 100644 a b R100 renamed.txt',
      'old.txt',
      '? new file.txt',
      '',
    ].join('\0'))
    expect(parsed.branch).toBeNull()
    expect(parsed.head).toBe('abcdef')
    expect(parsed.staged.map(change => change.path)).toEqual(['staged.txt', 'renamed.txt'])
    expect(parsed.staged[1]?.originalPath).toBe('old.txt')
    expect(parsed.unstaged.map(change => change.path)).toEqual(['working tree.txt'])
    expect(parsed.untracked).toEqual(['new file.txt'])
  })

  it('parses local branch identity without human decoration', () => {
    expect(parseBranches('main\0abc\0*\nfeature\0def\0 \n')).toEqual([
      { name: 'main', head: 'abc', current: true },
      { name: 'feature', head: 'def', current: false },
    ])
  })
})
