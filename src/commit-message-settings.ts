/**
 * Settings seam for commit message generation. The namespace and schema are
 * installed whenever a settings provider is mounted (composition entry is the
 * base layer). The Client half registers the matching card into
 * Settings → Plugins → Plugin configuration under this namespace.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace carrying the commit message generation section. */
export const GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE = 'git-commit-message'

/** Stored shape of the commit message generation settings section. */
export interface CommitMessageSettings {
  /**
   * Selection strategy. `inherit` uses the host session model; `custom`
   * requires both `provider` and `model`. A named provider/model without
   * `inherit` still wins, matching a composition entry that omits `mode`.
   */
  mode?: 'inherit' | 'custom'
  /** Provider route registered with the DSH LLM runtime. */
  provider?: string
  /** Model id resolved by the provider route. */
  model?: string
  /** System prompt override; defaults to the built-in commit message prompt. */
  systemPrompt?: string
  /** Staged-diff byte cap for the prompt. */
  maxDiffBytes?: number
}

/** Schema of the commit message generation settings section. */
export const GIT_COMMIT_MESSAGE_SETTINGS_SCHEMA: z<CommitMessageSettings> = z.object({
  mode: z.union([z.const('inherit'), z.const('custom')]),
  provider: z.string(),
  model: z.string(),
  systemPrompt: z.string(),
  maxDiffBytes: z.natural().min(1024),
})

/**
 * Reject a resolved section this implementation cannot act on: a custom
 * selection needs both halves of the provider/model route.
 * @param value - Schema-valid resolved section.
 * @throws {Error} when `mode` is `custom` without a complete provider/model.
 */
export function validateCommitMessageSettings(value: CommitMessageSettings): void {
  if (value.mode === 'custom' && (value.provider === undefined || value.model === undefined)) {
    throw new Error('commit message mode "custom" requires both provider and model')
  }
}
