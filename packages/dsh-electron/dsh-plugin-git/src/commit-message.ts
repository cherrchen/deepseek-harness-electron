/**
 * Commit message generation: provider abstraction plus the default LLM
 * runtime provider. Generation only ever produces text — the caller stays
 * responsible for staging, committing, and pushing.
 */
import type { GenerateOptions, LlmRuntime, Message, MessageId, TextBlock } from '@deepseek-ai/dsh-llm'

/** Input for one commit message generation. */
export interface CommitMessageInput {
  /** Repository working directory (diagnostics and prompt context only). */
  readonly repository: string
  /** Raw `git diff --cached` text for the staged index. */
  readonly stagedDiff: string
}

/** Provider contract for commit message generation. */
export interface CommitMessageProvider {
  /**
   * Generate one editable commit message proposal from the staged diff.
   * Implementations must not mutate the repository in any way.
   * @param input - Repository identity and staged diff text.
   * @returns The proposed commit message.
   */
  generate(input: CommitMessageInput): Promise<string>
}

/** Thrown when no generation backend is configured. */
export class CommitMessageUnavailableError extends Error {
  constructor() {
    super('commit message generation is not configured')
    this.name = 'CommitMessageUnavailableError'
  }
}

/** Default cap for the staged diff handed to the model. */
export const STAGED_DIFF_MAX_BYTES = 48 * 1024

/**
 * Bound the staged diff for prompt inclusion: whole lines are kept until the
 * byte budget would be exceeded, then a truncation marker is appended.
 * @param stagedDiff - Raw staged diff text.
 * @param maxBytes - Maximum prompt bytes for the diff body.
 * @returns The normalized diff text.
 */
export function normalizeStagedDiff(stagedDiff: string, maxBytes: number = STAGED_DIFF_MAX_BYTES): string {
  const bytes = Buffer.byteLength(stagedDiff, 'utf8')
  if (bytes <= maxBytes) return stagedDiff
  let kept = 0
  let end = 0
  for (const line of stagedDiff.split('\n')) {
    const cost = Buffer.byteLength(line, 'utf8') + 1
    if (kept + cost > maxBytes) break
    kept += cost
    end += line.length + 1
  }
  return `${stagedDiff.slice(0, end).replace(/\n$/u, '')}\n… (diff truncated for length)`
}

/** System prompt for the generation backend. */
export const COMMIT_MESSAGE_SYSTEM = [
  'You write Git commit messages.',
  'Write a clear, concise subject line (imperative mood, no trailing period) that names what changed and why.',
  'Add a short body only when the diff genuinely needs explanation.',
  'Use Conventional Commit type prefixes (feat, fix, chore, docs, refactor, test) when the change fits one.',
  'Answer with the commit message text only: no quotes, no code fences, no commentary.',
].join(' ')

/**
 * Build the user prompt for one staged diff.
 * @param input - Repository identity and normalized staged diff.
 * @returns The user prompt text.
 */
export function buildCommitMessagePrompt(input: { repository: string; stagedDiff: string }): string {
  const folder = input.repository.split('/').filter(part => part.length > 0).at(-1) ?? input.repository
  return [
    `Repository: ${folder}`,
    'Staged diff (`git diff --cached`):',
    '',
    input.stagedDiff,
    '',
    'Write the commit message for this staged change.',
  ].join('\n')
}

/** Configuration for the default LLM-backed provider. */
export interface LlmCommitMessageOptions {
  /** Provider route registered with the LLM runtime. */
  readonly provider: string
  /** Model id resolved by the provider route. */
  readonly model: string
  /** Optional staged-diff byte cap (defaults to {@link STAGED_DIFF_MAX_BYTES}). */
  readonly maxDiffBytes?: number
}

let messageSerial = 0

/**
 * Default {@link CommitMessageProvider}: one-shot streaming completion
 * through the DSH LLM runtime. The provider and model are configuration, so
 * the plugin never binds to one concrete model.
 */
export class LlmCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly llm: LlmRuntime,
    private readonly options: LlmCommitMessageOptions,
  ) {}

  /**
   * @param input - Repository identity and staged diff text.
   * @returns The proposed commit message.
   */
  async generate(input: CommitMessageInput): Promise<string> {
    const stagedDiff = normalizeStagedDiff(input.stagedDiff, this.options.maxDiffBytes)
    messageSerial += 1
    const message: Message = {
      id: `git-commit-message-${messageSerial}` as MessageId,
      role: 'user',
      content: [{ type: 'text', text: buildCommitMessagePrompt({ repository: input.repository, stagedDiff }) } satisfies TextBlock],
      source: { kind: 'user' },
    }
    const request: GenerateOptions = {
      provider: this.options.provider,
      model: this.options.model,
      messages: [message],
      system: COMMIT_MESSAGE_SYSTEM,
      temperature: 0.2,
    }
    let text = ''
    for await (const chunk of this.llm.stream(request)) {
      if (chunk.type === 'text-delta') text += chunk.text
    }
    return postProcessCommitMessage(text)
  }
}

/**
 * Clean model output into a plain commit message: strip wrapping fences and
 * quotes, trim blank padding, and cap the body at a reasonable length.
 * @param text - Raw model output.
 * @returns The editable commit message.
 */
export function postProcessCommitMessage(text: string): string {
  let message = text.trim()
  if (message.startsWith('```')) {
    message = message.replace(/^```[a-zA-Z]*\n?/u, '').replace(/```$/u, '').trim()
  }
  if ((message.startsWith('"') && message.endsWith('"')) || (message.startsWith("'") && message.endsWith("'"))) {
    message = message.slice(1, -1).trim()
  }
  const lines = message.split('\n').map(line => line.replace(/\s+$/u, ''))
  while (lines.length > 0 && lines[0]!.length === 0) lines.shift()
  while (lines.length > 0 && lines.at(-1)!.length === 0) lines.pop()
  return lines.slice(0, 20).join('\n')
}

/** No-op provider used when generation is not configured. */
export class UnavailableCommitMessageProvider implements CommitMessageProvider {
  /**
   * @param _input - Unused input.
   * @throws {@link CommitMessageUnavailableError} always.
   */
  async generate(_input: CommitMessageInput): Promise<string> {
    void _input
    throw new CommitMessageUnavailableError()
  }
}
