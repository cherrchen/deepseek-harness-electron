import { describe, expect, it } from 'vitest'
import { statusLetter, statusLetterTone } from '../src/client/status-letter.ts'

describe('statusLetter', () => {
  it('reads the index side for staged rows and the worktree side for unstaged rows', () => {
    expect(statusLetter('M ', 'staged')).toBe('M')
    expect(statusLetter(' M', 'unstaged')).toBe('M')
    expect(statusLetter('A ', 'staged')).toBe('A')
    expect(statusLetter('??', 'untracked')).toBe('U')
  })

  it('maps letters onto badge tones', () => {
    expect(statusLetterTone('A')).toBe('add')
    expect(statusLetterTone('D')).toBe('delete')
    expect(statusLetterTone('R')).toBe('rename')
    expect(statusLetterTone('U')).toBe('untracked')
    expect(statusLetterTone('M')).toBe('modify')
  })
})
