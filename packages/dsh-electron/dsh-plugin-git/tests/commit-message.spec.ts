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

type FakeChunk = { type: string; text?: string }

interface FakeLlm {
  stream: (request: unknown) => AsyncIterable<FakeChunk>
  requests: unknown[]
}

function fakeLlm(chunks: FakeChunk[]): FakeLlm {
  const requests: unknown[] = []
  const llm: FakeLlm = {
    requests,
    async *stream(request) {
      requests.push(request)
      for (const chunk of chunks) yield chunk
    },
  }
  return llm
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

  it('unavailable provider reports its configured reason', async () => {
    const provider = new UnavailableCommitMessageProvider('llm-unavailable')
    await expect(provider.generate({ repository: '/repo', stagedDiff: 'diff' })).rejects.toMatchObject({ reason: 'llm-unavailable' })
  })

  it('llm provider collects text deltas into an editable proposal', async () => {
    const llm = fakeLlm([
      { type: 'text-delta', text: 'feat' },
      { type: 'text-delta', text: ': add details host\n\n' },
      { type: 'block-end' },
    ])
    const provider = new LlmCommitMessageProvider(llm as never, {
      resolveSelection: () => ({ provider: 'test', model: 'test-model' }),
    })
    const message = await provider.generate({ repository: '/repo', stagedDiff: '+x' })
    expect(message).toBe('feat: add details host')
    const request = llm.requests[0] as { system?: string; provider?: string; model?: string; messages?: Array<{ content: Array<{ text: string }> }> }
    expect(request.system).toBe(COMMIT_MESSAGE_SYSTEM)
    expect(request.provider).toBe('test')
    expect(request.model).toBe('test-model')
    expect(request.messages![0]!.content[0]!.text).toContain('+x')
  })

  it('re-resolves the selection on every generation', async () => {
    const llm = fakeLlm([{ type: 'text-delta', text: 'a' }, { type: 'text-delta', text: 'b' }])
    let model = 'first-model'
    const provider = new LlmCommitMessageProvider(llm as never, {
      resolveSelection: () => ({ provider: 'route', model }),
    })
    await provider.generate({ repository: '/repo', stagedDiff: '+x' })
    model = 'second-model'
    await provider.generate({ repository: '/repo', stagedDiff: '+y' })
    expect(llm.requests.map(request => (request as { model?: string }).model)).toEqual(['first-model', 'second-model'])
  })

  it('rejects with default-model-missing when no selection resolves', async () => {
    const llm = fakeLlm([])
    const provider = new LlmCommitMessageProvider(llm as never, { resolveSelection: () => undefined })
    await expect(provider.generate({ repository: '/repo', stagedDiff: '+x' }))
      .rejects.toMatchObject({ reason: 'default-model-missing' })
    expect(llm.requests).toHaveLength(0)
  })

  it('honors the configured system prompt override', async () => {
    const llm = fakeLlm([{ type: 'text-delta', text: 'chore: x' }])
    const provider = new LlmCommitMessageProvider(llm as never, {
      resolveSelection: () => ({ provider: 'test', model: 'test-model' }),
      systemPrompt: 'Custom prompt.',
    })
    await provider.generate({ repository: '/repo', stagedDiff: '+x' })
    expect((llm.requests[0] as { system?: string }).system).toBe('Custom prompt.')
  })

  it('re-resolves the system prompt on every generation', async () => {
    const llm = fakeLlm([{ type: 'text-delta', text: 'ok' }])
    let prompt = 'first'
    const provider = new LlmCommitMessageProvider(llm as never, {
      resolveSelection: () => ({ provider: 'test', model: 'test-model' }),
      resolveSystemPrompt: () => prompt,
    })
    await provider.generate({ repository: '/repo', stagedDiff: '+x' })
    prompt = 'second'
    await provider.generate({ repository: '/repo', stagedDiff: '+y' })
    expect(llm.requests.map(request => (request as { system?: string }).system)).toEqual(['first', 'second'])
  })
})
