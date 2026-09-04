/** Standard DSH Git plugin: portable service plus optional Connection RPC adapter. */

import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { CommitMessageUnavailableError, LlmCommitMessageProvider, UnavailableCommitMessageProvider, type CommitMessageProvider } from './commit-message.ts'
import { GitService } from './service.ts'

export { CommitMessageUnavailableError, LlmCommitMessageProvider, UnavailableCommitMessageProvider } from './commit-message.ts'
export type { CommitMessageInput, CommitMessageProvider, LlmCommitMessageOptions } from './commit-message.ts'
export { GitCommandError, GitService, gitService } from './service.ts'
export { parseGitLog, parseDecorations } from './log.ts'
export { parseBranches, parsePorcelainV2 } from './status.ts'
export type * from './types.ts'

export const name = 'dsh-plugin-git'
export const inject = ['subprocess']

/** Deployment-varying Git process policy. */
export interface Config {
  /** Git executable name or absolute path resolved by `ctx.subprocess`. */
  executable?: string
  /** Maximum bytes retained independently for stdout and stderr. */
  maxOutputBytes?: number
  /** Grace period used when managed subprocess termination is requested. */
  graceMs?: number
  /** Optional commit message generation backend (provider + model). */
  commitMessage?: {
    /** Provider route registered with the DSH LLM runtime. */
    provider: string
    /** Model id resolved by the provider route. */
    model: string
    /** Optional staged-diff byte cap for the prompt. */
    maxDiffBytes?: number
  }
}

export const Config = z.object({
  executable: z.string().default('git'),
  maxOutputBytes: z.natural().min(1024).default(8 * 1024 * 1024),
  graceMs: z.natural().min(1).default(3000),
  commitMessage: z.object({
    provider: z.string(),
    model: z.string(),
    maxDiffBytes: z.natural().min(1024),
  }),
})

/** Install the portable service and the transport adapter when Connection is present. */
export function apply(ctx: Context, config: Config): void {
  const service = new GitService(ctx.subprocess, {
    executable: config.executable ?? 'git',
    maxOutputBytes: config.maxOutputBytes ?? 8 * 1024 * 1024,
    graceMs: config.graceMs ?? 3000,
  })
  ctx.provide('git', service)
  // Commit message generation is capability-detected: without a configured
  // provider (or without the LLM runtime) the endpoint reports unavailable
  // and the UI keeps the action disabled. Generation never mutates the repo.
  const generation: { provider: CommitMessageProvider | undefined } = {
    provider: new UnavailableCommitMessageProvider(),
  }
  const generationConfig = config.commitMessage
  if (generationConfig !== undefined) {
    ctx.inject(['llm'], (llmCtx) => {
      const llm = llmCtx.llm
      generation.provider = new LlmCommitMessageProvider(llm, {
        provider: generationConfig.provider,
        model: generationConfig.model,
        ...(generationConfig.maxDiffBytes !== undefined ? { maxDiffBytes: generationConfig.maxDiffBytes } : {}),
      })
      return () => { generation.provider = new UnavailableCommitMessageProvider() }
    })
  }
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    return connection.rpc.handle('/git', async (endpoint, payload, signal) => {
      try {
        return { ok: true, value: await invoke(service, generation, endpoint, payload, signal) }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof CommitMessageUnavailableError ? 'git/generation-unavailable' : 'git/internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        }
      }
    })
  })
}

async function invoke(
  service: GitService,
  generation: { provider: CommitMessageProvider | undefined },
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const request = record(payload)
  switch (endpoint) {
    case 'discover': return service.discover(stringField(request, 'path'), signal)
    case 'status': return service.status(stringField(request, 'repository'), signal)
    case 'diff': return service.diff(
      stringField(request, 'repository'),
      booleanField(request, 'staged'),
      optionalStringField(request, 'path'),
      signal,
    )
    case 'stage': return service.stage(stringField(request, 'repository'), optionalStringField(request, 'path'), signal)
    case 'unstage': return service.unstage(stringField(request, 'repository'), optionalStringField(request, 'path'), signal)
    case 'discard': return service.discard(stringField(request, 'repository'), optionalStringField(request, 'path'), signal)
    case 'commit': return service.commit(stringField(request, 'repository'), stringField(request, 'message'), signal)
    case 'create-branch': return service.createBranch(stringField(request, 'repository'), stringField(request, 'branch'), signal)
    case 'switch-branch': return service.switchBranch(stringField(request, 'repository'), stringField(request, 'branch'), signal)
    case 'log': {
      const limitField = request['limit']
      const skipField = request['skip']
      return service.log(
        stringField(request, 'repository'),
        typeof limitField === 'number' ? limitField : 100,
        typeof skipField === 'number' ? skipField : 0,
        signal,
      )
    }
    case 'commit-message-capability': {
      const provider = generation.provider
      return {
        available: provider !== undefined && !(provider instanceof UnavailableCommitMessageProvider),
      }
    }
    case 'generate-commit-message': {
      const provider = generation.provider
      if (provider === undefined || provider instanceof UnavailableCommitMessageProvider) {
        throw new CommitMessageUnavailableError()
      }
      return provider.generate({
        repository: stringField(request, 'repository'),
        stagedDiff: stringField(request, 'stagedDiff'),
      })
    }
    default: throw new Error(`unknown Git endpoint ${JSON.stringify(endpoint)}`)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Git request must be an object')
  return value as Record<string, unknown>
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) throw new Error(`Git request ${key} must be a non-empty string`)
  return field
}

function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'string' || field.length === 0) throw new Error(`Git request ${key} must be a non-empty string`)
  return field
}

function booleanField(value: Record<string, unknown>, key: string): boolean {
  const field = value[key]
  if (typeof field !== 'boolean') throw new Error(`Git request ${key} must be a boolean`)
  return field
}
