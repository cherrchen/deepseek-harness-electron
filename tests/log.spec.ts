import { describe, expect, it } from 'vitest'
import { GIT_LOG_FORMAT, parseDecorations, parseGitLog } from '../src/log.ts'

describe('parseGitLog', () => {
  const UNIT = '\u001f'
  const RECORD = '\u001e'

  it('parses delimited records into commit summaries', () => {
    const record = (fields: readonly string[]): string => fields.join(UNIT)
    const text = [
      record(['hash1', 'hash2 hash3', 'h1', 'subject one', 'Ann', '2026-01-01T00:00:00Z', 'HEAD -> main']),
      record(['hash2', '', 'h2', 'subject two', 'Bob', '2026-01-02T00:00:00Z', '']),
    ].join(RECORD) + RECORD
    const commits = parseGitLog(text)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      hash: 'hash1',
      parents: ['hash2', 'hash3'],
      shortHash: 'h1',
      subject: 'subject one',
      author: 'Ann',
      date: '2026-01-01T00:00:00Z',
      refs: ['HEAD', 'main'],
    })
    expect(commits[1]!.parents).toEqual([])
    expect(commits[1]!.refs).toEqual([])
  })

  it('skips malformed records', () => {
    const commits = parseGitLog('')
    expect(commits).toEqual([])
  })

  it('documents the format contract', () => {
    expect(GIT_LOG_FORMAT).toContain('%H')
    expect(GIT_LOG_FORMAT).toContain('%P')
    expect(GIT_LOG_FORMAT).toContain('%D')
  })
})

describe('parseDecorations', () => {
  it('expands HEAD wiring and dedupes refs', () => {
    expect(parseDecorations('HEAD -> main, origin/main, tag: v1.0')).toEqual(['HEAD', 'main', 'origin/main', 'tag: v1.0'])
  })

  it('keeps a detached HEAD marker', () => {
    expect(parseDecorations('HEAD')).toEqual(['HEAD'])
    expect(parseDecorations('')).toEqual([])
  })
})
