import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMIT_MESSAGE_SYSTEM } from '../src/commit-message.ts'
import { apply } from '../src/index.ts'

interface FakeChunk {
  type: string
  text?: string
}

interface FakeLlm {
  stream: (request: unknown) => AsyncIterable<FakeChunk>
  requests: unknown[]
}

function fakeLlm(): FakeLlm {
  const requests: unknown[] = []
  return {
    requests,
    async *stream(request) {
      requests.push(request)
      yield { type: 'text-delta', text: 'feat: assembled proposal' }
    },
  }
}

interface CapturedEndpoint {
  channel: string
  call(endpoint: string, payload: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }>
}

/** Mount the plugin on a fresh context with the fake Host services listed as present. */
async function mounted(options: {
  llm?: FakeLlm
  defaultModel?: { provider: string; model: string }
  settings?: Record<string, unknown> | undefined
  config?: Record<string, unknown>
}): Promise<CapturedEndpoint> {
  const ctx = new Context()
  ctx.provide('subprocess', {} as never)
  let captured: CapturedEndpoint | undefined
  ctx.provide('connection', {
    rpc: {
      handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) {
        captured = {
          channel,
          call: (endpoint, payload) => handler(endpoint, payload, new AbortController().signal) as ReturnType<CapturedEndpoint['call']>,
        }
        return () => {}
      },
    },
  } as never)
  if (options.llm !== undefined) ctx.provide('llm', options.llm as never)
  if (options.defaultModel !== undefined) {
    ctx.provide('agentDefaultModel', {
      currentSelection: () => options.defaultModel,
    } as never)
  }
  if (options.settings !== undefined) {
    ctx.provide('settings', {
      installSection: (_owner: unknown, _ns: string, _schema: unknown, entry: Record<string, unknown>, hooks: {
        setSource: (current: () => Record<string, unknown>) => void
        onChange: () => void
      }) => {
        hooks.setSource(() => ({ ...entry, ...options.settings }))
        hooks.onChange()
      },
    } as never)
  }
  apply(ctx, (options.config ?? {}) as never)
  // Settle the capability-detection fibers started inside apply().
  await new Promise((resolve) => setImmediate(resolve))
  if (captured === undefined) throw new Error('connection RPC handler was not registered')
  return captured
}

afterEach(async () => {
  // Nothing to dispose: every context in this suite lives for one test.
})

describe('commit message generation assembly', () => {
  it('reports llm-unavailable and rejects generation without the LLM runtime', async () => {
    const git = await mounted({ defaultModel: { provider: 'main', model: 'main-model' } })
    expect(git.channel).toBe('/git')
    expect(await git.call('commit-message-capability', {})).toEqual({
      ok: true,
      value: { available: false, reason: 'llm-unavailable' },
    })
    const result = await git.call('generate-commit-message', { repository: '/repo', stagedDiff: '+x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('git/generation-unavailable')
  })

  it('inherits the host default model when unconfigured', async () => {
    const llm = fakeLlm()
    const git = await mounted({ llm, defaultModel: { provider: 'main-provider', model: 'main-model' } })
    expect(await git.call('commit-message-capability', {})).toEqual({ ok: true, value: { available: true } })
    const result = await git.call('generate-commit-message', { repository: '/repo', stagedDiff: '+x' })
    expect(result).toEqual({ ok: true, value: 'feat: assembled proposal' })
    const request = llm.requests[0] as { provider?: string; model?: string; system?: string }
    expect(request.provider).toBe('main-provider')
    expect(request.model).toBe('main-model')
    expect(request.system).toBe(COMMIT_MESSAGE_SYSTEM)
  })

  it('reports default-model-missing when the host has a live runtime but no default model', async () => {
    const llm = fakeLlm()
    const git = await mounted({ llm })
    expect(await git.call('commit-message-capability', {})).toEqual({
      ok: true,
      value: { available: false, reason: 'default-model-missing' },
    })
  })

  it('uses the custom provider/model from the composition entry', async () => {
    const llm = fakeLlm()
    const git = await mounted({
      llm,
      config: { commitMessage: { mode: 'custom', provider: 'custom-provider', model: 'custom-model' } },
    })
    expect(await git.call('commit-message-capability', {})).toEqual({ ok: true, value: { available: true } })
    await git.call('generate-commit-message', { repository: '/repo', stagedDiff: '+x' })
    const request = llm.requests[0] as { provider?: string; model?: string }
    expect(request.provider).toBe('custom-provider')
    expect(request.model).toBe('custom-model')
  })

  it('lets the settings section override the composition entry live', async () => {
    const llm = fakeLlm()
    const git = await mounted({
      llm,
      defaultModel: { provider: 'main-provider', model: 'main-model' },
      settings: { mode: 'custom', provider: 'settings-provider', model: 'settings-model' },
    })
    await git.call('generate-commit-message', { repository: '/repo', stagedDiff: '+x' })
    const request = llm.requests[0] as { provider?: string; model?: string }
    expect(request.provider).toBe('settings-provider')
    expect(request.model).toBe('settings-model')
  })
})
