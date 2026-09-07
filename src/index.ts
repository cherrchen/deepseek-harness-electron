/** Standard DSH Git plugin: portable service plus optional Connection RPC adapter. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-settings'
import {
  CommitMessageUnavailableError,
  LlmCommitMessageProvider,
  UnavailableCommitMessageProvider,
  type CommitMessageProvider,
  type CommitMessageSelection,
} from './commit-message.ts'
import {
  GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE,
  GIT_COMMIT_MESSAGE_SETTINGS_SCHEMA,
  validateCommitMessageSettings,
  type CommitMessageSettings,
} from './commit-message-settings.ts'
import { GitService } from './service.ts'
import type { GitCommitMessageCapability } from './types.ts'

export { CommitMessageUnavailableError, LlmCommitMessageProvider, UnavailableCommitMessageProvider } from './commit-message.ts'
export type { CommitMessageInput, CommitMessageProvider, CommitMessageSelection, LlmCommitMessageOptions } from './commit-message.ts'
export { GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE, GIT_COMMIT_MESSAGE_SETTINGS_SCHEMA, validateCommitMessageSettings } from './commit-message-settings.ts'
export type { CommitMessageSettings } from './commit-message-settings.ts'
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
  /** Optional commit message generation backend. */
  commitMessage?: CommitMessageSettings
}

export const Config = z.object({
  executable: z.string().default('git'),
  maxOutputBytes: z.natural().min(1024).default(8 * 1024 * 1024),
  graceMs: z.natural().min(1).default(3000),
  commitMessage: z.object({
    mode: z.union([z.const('inherit'), z.const('custom')]),
    provider: z.string(),
    model: z.string(),
    systemPrompt: z.string(),
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
  const generation = assembleGeneration(ctx, config.commitMessage)
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

/** Mutable generation assembly; fibers swap the provider as services attach and detach. */
class GenerationAssembly {
  constructor(public provider: CommitMessageProvider = new UnavailableCommitMessageProvider('llm-unavailable')) {}
}

/**
 * Assemble commit message generation. Without configuration the plugin
 * inherits the host's default (session) model; a named provider/model — from
 * the settings section, else the composition entry — overrides the host
 * default. Generation never mutates the repository.
 * @param ctx - Plugin context whose fibers track service availability.
 * @param config - Composition entry for the settings section.
 * @returns The mutable assembly consumed by the RPC adapter.
 */
function assembleGeneration(ctx: Context, config: CommitMessageSettings | undefined): GenerationAssembly {
  if (config?.mode === 'custom') validateCommitMessageSettings(config)
  const generation = new GenerationAssembly()
  const options = {
    ...(config?.maxDiffBytes !== undefined ? { maxDiffBytes: config.maxDiffBytes } : {}),
    ...(config?.systemPrompt !== undefined ? { systemPrompt: config.systemPrompt } : {}),
  }
  const entry: CommitMessageSettings = config ?? {}
  let readSettings: (() => CommitMessageSettings) | undefined
  let readHostDefault: (() => CommitMessageSelection) | undefined
  const resolveSelection = (): CommitMessageSelection | undefined => {
    const source = readSettings?.() ?? entry
    if (source.provider !== undefined && source.model !== undefined) {
      return { provider: source.provider, model: source.model }
    }
    return readHostDefault?.()
  }
  ctx.inject(['llm'], (llmCtx) => {
    const llm = llmCtx.llm
    generation.provider = new LlmCommitMessageProvider(llm, { resolveSelection, ...options })
    return () => { generation.provider = new UnavailableCommitMessageProvider('llm-unavailable') }
  })
  ctx.inject(['agentDefaultModel'], (modelCtx) => {
    const defaultModel = modelCtx.agentDefaultModel
    readHostDefault = () => {
      const selection = defaultModel.currentSelection()
      return { provider: selection.provider, model: selection.model }
    }
    return () => { readHostDefault = undefined }
  })
  // The settings page (L2) renders this section; without a provider the
  // composition entry above is the only source.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE, GIT_COMMIT_MESSAGE_SETTINGS_SCHEMA, entry, {
      setSource: (current) => { readSettings = current },
      onChange: () => {},
      validate: validateCommitMessageSettings,
    })
    return () => { readSettings = undefined }
  })
  return generation
}

/** Current capability answer for the generation backend, including why it is unavailable. */
function capability(generation: GenerationAssembly): GitCommitMessageCapability {
  const provider = generation.provider
  if (provider instanceof LlmCommitMessageProvider) {
    return provider.isReady() ? { available: true } : { available: false, reason: 'default-model-missing' }
  }
  if (provider instanceof UnavailableCommitMessageProvider) {
    return { available: false, reason: provider.reason }
  }
  return { available: true }
}

async function invoke(
  service: GitService,
  generation: GenerationAssembly,
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
    case 'discard': {
      const modeField = optionalStringField(request, 'mode')
      const mode = modeField === 'head' || modeField === 'untracked' ? modeField : 'worktree'
      return service.discard(stringField(request, 'repository'), optionalStringField(request, 'path'), signal, mode)
    }
    case 'commit': return service.commit(
      stringField(request, 'repository'),
      stringField(request, 'message'),
      signal,
      optionalBooleanField(request, 'amend') === true,
    )
    case 'push': return service.push(stringField(request, 'repository'), signal)
    case 'sync': return service.sync(stringField(request, 'repository'), signal)
    case 'create-branch': return service.createBranch(stringField(request, 'repository'), stringField(request, 'branch'), signal)
    case 'switch-branch': return service.switchBranch(stringField(request, 'repository'), stringField(request, 'branch'), signal)
    case 'log': {
      const limitField = request['limit']
      const skipField = request['skip']
      const scopeField = request['scope']
      const scope = scopeField === 'all' || scopeField === 'first-parent' ? scopeField : 'auto'
      return service.log(
        stringField(request, 'repository'),
        typeof limitField === 'number' ? limitField : 100,
        typeof skipField === 'number' ? skipField : 0,
        scope,
        signal,
      )
    }
    case 'commit-message-capability': return capability(generation)
    case 'generate-commit-message': {
      const provider = generation.provider
      if (provider instanceof UnavailableCommitMessageProvider) {
        throw new CommitMessageUnavailableError(provider.reason)
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

function optionalBooleanField(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'boolean') throw new Error(`Git request ${key} must be a boolean`)
  return field
}
