import { describe, expect, it } from 'vitest'
import {
  COMMIT_MESSAGE_SYSTEM,
  LlmCommitMessageProvider,
  CommitMessageUnavailableError,
  UnavailableCommitMessageProvider,
  buildCommitMessagePrompt,
  normalizeStagedDiff,
  postProcessCommitMessage,
} from '../src/commit-message.ts'

function fakeLlm(chunks: Array<{ type: string; text?: string }>): { stream: (request: unknown) => AsyncIterable<{ type: string; text?: string }>; requests: unknown[] } {
  const requests: unknown[] = []
  return {
    requests,
    async *stream(request) {
      requests.push(request)
      for (const chunk of chunks) yield chunk
    },
  }
}

describe('normalizeStagedDiff', () => {
  it('keeps small diffs intact', () => {
    expect(normalizeStagedDiff('+a\n', 1024)).toBe('+a\n')
  })

  it('truncates whole lines and appends a marker past the budget', () => {
    const diff = Array.from({ length: 100 }, (_, index) => `line-${index}-${'x'.repeat(20)}`).join('\n')
    const normalized = normalizeStagedDiff(diff, 512)
    expect(normalized.length).toBeLessThan(diff.length)
    expect(normalized).toContain('truncated')
    expect(normalized.startsWith('line-0-')).toBe(true)
  })
})

describe('buildCommitMessagePrompt', () => {
  it('names the repository folder and embeds the diff', () => {
    const prompt = buildCommitMessagePrompt({ repository: '/home/dev/my-project', stagedDiff: '+x' })
    expect(prompt).toContain('my-project')
    expect(prompt).toContain('+x')
  })
})

describe('postProcessCommitMessage', () => {
  it('strips code fences, quotes, and blank padding', () => {
    expect(postProcessCommitMessage('```\nfeat: add graph\n```')).toBe('feat: add graph')
    expect(postProcessCommitMessage('"fix: trim quotes"')).toBe('fix: trim quotes')
    expect(postProcessCommitMessage('\n\nfeat: pad\n\n')).toBe('feat: pad')
  })
})

describe('providers', () => {
  it('unavailable provider always rejects without touching a repository', async () => {
    const provider = new UnavailableCommitMessageProvider()
    await expect(provider.generate({ repository: '/repo', stagedDiff: 'diff' })).rejects.toThrow(CommitMessageUnavailableError)
  })

  it('llm provider collects text deltas into an editable proposal', async () => {
    const llm = fakeLlm([
      { type: 'text-delta', text: 'feat' },
      { type: 'text-delta', text: ': add details host\n\n' },
      { type: 'block-end' },
    ])
    const provider = new LlmCommitMessageProvider(llm as never, { provider: 'test', model: 'test-model' })
    const message = await provider.generate({ repository: '/repo', stagedDiff: '+x' })
    expect(message).toBe('feat: add details host')
    const request = llm.requests[0] as { system?: string; messages?: Array<{ content: Array<{ text: string }> }> }
    expect(request.system).toBe(COMMIT_MESSAGE_SYSTEM)
    expect(request.messages![0]!.content[0]!.text).toContain('+x')
  })
})
