/**
 * Staged editor for commit-message generation: inherit the session model or
 * pin a provider route, plus an optional system-prompt override.
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Settings namespace; spelled here so the Client half never imports Host modules. */
export const GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE = 'git-commit-message'

/** Stored fields this card edits. */
export interface CommitMessageCardSettings {
  mode?: 'inherit' | 'custom'
  provider?: string
  model?: string
  systemPrompt?: string
}

/** One advertised or retained provider/model route. */
export interface CommitMessageModelCandidate {
  /** Opaque identity used only for lookup. */
  key: string
  provider: string
  model: string
  providerName: string
  modelName: string
  available: boolean
}

/** Catalog load outcome used by the card. */
export type CommitMessageCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Result of one adapter-directory read. */
export interface CommitMessageCatalogLoad {
  groups: readonly CommitMessageCatalogGroup[]
  partial: boolean
}

/** One provider group from the Host model catalog. */
export interface CommitMessageCatalogGroup {
  id: string
  name: string
  models: readonly { id: string; name: string }[]
}

/** State rendered by the commit-message settings card. */
export interface CommitMessageSettingsCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
  mode: 'inherit' | 'custom'
  provider: string
  model: string
  systemPrompt: string
  candidates: readonly CommitMessageModelCandidate[]
  catalogStatus: CommitMessageCatalogStatus
  catalogPartial: boolean
}

/** Load the live adapter directory; `undefined` means the Host has no catalog. */
export type CommitMessageCatalogLoader = () => Promise<CommitMessageCatalogLoad | undefined>

/**
 * Stable identity for one exact route.
 * @param route - Provider/model pair.
 * @returns Opaque key for lookup within the card.
 */
export function commitMessageModelKey(route: { provider: string; model: string }): string {
  return `${route.provider}\0${route.model}`
}

/**
 * Join live adapter metadata with a stored custom route that may no longer be advertised.
 * @param groups - Current model directory grouped by provider.
 * @param stored - Custom route in the effective settings value, when one exists.
 * @returns Candidate rows for the card.
 */
export function commitMessageModelCandidates(
  groups: readonly CommitMessageCatalogGroup[],
  stored: { provider: string; model: string } | undefined,
): CommitMessageModelCandidate[] {
  const storedKey = stored === undefined ? undefined : commitMessageModelKey(stored)
  const candidates = groups.flatMap(group => group.models.map((model): CommitMessageModelCandidate => ({
    key: commitMessageModelKey({ provider: group.id, model: model.id }),
    provider: group.id,
    model: model.id,
    providerName: group.name,
    modelName: model.name,
    available: true,
  })))
  if (stored !== undefined && storedKey !== undefined && !candidates.some(candidate => candidate.key === storedKey)) {
    candidates.push({
      key: storedKey,
      provider: stored.provider,
      model: stored.model,
      providerName: stored.provider,
      modelName: stored.model,
      available: false,
    })
  }
  return candidates
}

/**
 * Whether a stored section pins a named provider/model.
 * @param value - Resolved settings section.
 * @returns `custom` when a named route applies, otherwise `inherit`.
 */
export function commitMessageDisplayedMode(value: CommitMessageCardSettings | undefined): 'inherit' | 'custom' {
  if (value?.mode === 'inherit') return 'inherit'
  if (value?.provider !== undefined && value.model !== undefined) return 'custom'
  return 'inherit'
}

interface Draft {
  mode: 'inherit' | 'custom'
  provider: string
  model: string
  systemPrompt: string
  revision: number | undefined
}

/** Bridges the `git-commit-message` scope onto a staged card. */
export class CommitMessageSettingsCardController {
  private catalogGroups: readonly CommitMessageCatalogGroup[] = []
  private catalogPartial = false
  private catalogStatus: CommitMessageCatalogStatus = 'idle'
  private draft: Draft | undefined
  private saving = false
  private failed = false
  private disposed = false
  private saveGeneration = 0
  private catalogGeneration = 0
  private snapshot: CommitMessageSettingsCardState
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void

  /**
   * @param scope - bound `git-commit-message` settings scope.
   * @param loadCatalog - optional Host model catalog reader.
   */
  constructor(
    private readonly scope: SettingsScope<CommitMessageCardSettings>,
    private readonly loadCatalog: CommitMessageCatalogLoader | undefined = undefined,
  ) {
    this.snapshot = this.projection()
    this.unsubscribe = scope.subscribe(() => { this.publish() })
    if (this.mode() === 'custom') void this.ensureCatalog()
  }

  /** Stop observing settings and suppress late catalog/write settlements. */
  dispose(): void {
    this.disposed = true
    this.saveGeneration += 1
    this.catalogGeneration += 1
    this.unsubscribe()
  }

  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * @returns the current card snapshot (stable until the next change).
   */
  getSnapshot = (): CommitMessageSettingsCardState => this.snapshot

  /**
   * Stage inherit vs custom. Switching to custom loads the model catalog.
   * @param mode - Selection strategy to stage.
   */
  setMode(mode: 'inherit' | 'custom'): void {
    if (this.disposed || !this.scope.getSnapshot().writable || this.saving) return
    this.beginDraft().mode = mode
    this.failed = false
    if (mode === 'custom') void this.ensureCatalog()
    this.publish()
  }

  /**
   * Stage one advertised or retained route as the custom selection.
   * @param key - Opaque candidate identity.
   */
  setModel(key: string): void {
    if (this.disposed || !this.scope.getSnapshot().writable || this.saving) return
    const candidate = this.candidates().find(entry => entry.key === key)
    if (candidate === undefined) return
    const draft = this.beginDraft()
    draft.mode = 'custom'
    draft.provider = candidate.provider
    draft.model = candidate.model
    this.failed = false
    this.publish()
  }

  /**
   * Stage a provider route typed by the user when no catalog row applies.
   * @param provider - Provider id.
   */
  setProviderText(provider: string): void {
    if (this.disposed || !this.scope.getSnapshot().writable || this.saving) return
    const draft = this.beginDraft()
    draft.mode = 'custom'
    draft.provider = provider
    this.failed = false
    this.publish()
  }

  /**
   * Stage a model id typed by the user when no catalog row applies.
   * @param model - Model id.
   */
  setModelText(model: string): void {
    if (this.disposed || !this.scope.getSnapshot().writable || this.saving) return
    const draft = this.beginDraft()
    draft.mode = 'custom'
    draft.model = model
    this.failed = false
    this.publish()
  }

  /**
   * Stage the system-prompt override; empty text clears it back to the built-in prompt.
   * @param systemPrompt - Draft prompt text.
   */
  setSystemPrompt(systemPrompt: string): void {
    if (this.disposed || !this.scope.getSnapshot().writable || this.saving) return
    this.beginDraft().systemPrompt = systemPrompt
    this.failed = false
    this.publish()
  }

  /** Reload the adapter directory. */
  retryCatalog(): void {
    this.catalogStatus = 'idle'
    void this.ensureCatalog()
  }

  /** Persist every staged field as one revision-fenced mutation. */
  save(): void {
    void this.commit()
  }

  /** Drop every staged edit. */
  discard(): void {
    if (this.saving) return
    this.draft = undefined
    this.failed = false
    this.publish()
  }

  private current(): CommitMessageCardSettings {
    return this.scope.getSnapshot().value ?? {}
  }

  private mode(): 'inherit' | 'custom' {
    return this.draft?.mode ?? commitMessageDisplayedMode(this.current())
  }

  private provider(): string {
    return this.draft?.provider ?? this.current().provider ?? ''
  }

  private model(): string {
    return this.draft?.model ?? this.current().model ?? ''
  }

  private systemPrompt(): string {
    return this.draft?.systemPrompt ?? this.current().systemPrompt ?? ''
  }

  private storedCustom(): { provider: string; model: string } | undefined {
    const provider = this.provider()
    const model = this.model()
    if (provider === '' || model === '') return undefined
    return { provider, model }
  }

  private candidates(): CommitMessageModelCandidate[] {
    return commitMessageModelCandidates(this.catalogGroups, this.storedCustom())
  }

  private beginDraft(): Draft {
    if (this.draft === undefined) {
      const snapshot = this.scope.getSnapshot()
      const current = this.current()
      this.draft = {
        mode: commitMessageDisplayedMode(current),
        provider: current.provider ?? '',
        model: current.model ?? '',
        systemPrompt: current.systemPrompt ?? '',
        revision: snapshot.revision,
      }
    }
    return this.draft
  }

  private async ensureCatalog(): Promise<void> {
    if (this.disposed || this.catalogStatus === 'loading') return
    if (this.loadCatalog === undefined) {
      this.catalogStatus = 'error'
      this.publish()
      return
    }
    const generation = this.catalogGeneration
    this.catalogStatus = 'loading'
    this.publish()
    try {
      const loaded = await this.loadCatalog()
      if (this.disposed || generation !== this.catalogGeneration) return
      if (loaded === undefined) {
        this.catalogStatus = 'error'
      } else {
        this.catalogGroups = loaded.groups
        this.catalogPartial = loaded.partial
        this.catalogStatus = 'ready'
      }
    } catch {
      if (this.disposed || generation !== this.catalogGeneration) return
      this.catalogStatus = 'error'
    }
    this.publish()
  }

  private async commit(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const mode = this.mode()
    const provider = this.provider().trim()
    const model = this.model().trim()
    const systemPrompt = this.systemPrompt()
    if (this.disposed || snapshot.status !== 'ready' || !snapshot.writable || this.saving) return
    if (mode === 'custom' && (provider === '' || model === '')) return
    if (!this.dirty()) return
    if (this.draft !== undefined && snapshot.revision !== this.draft.revision) {
      this.failed = true
      this.publish()
      return
    }
    const generation = this.saveGeneration
    this.saving = true
    this.failed = false
    this.publish()
    const ops: Array<{ op: 'set'; path: string[]; value: string } | { op: 'unset'; path: string[] }> = [
      { op: 'set', path: ['mode'], value: mode },
    ]
    if (mode === 'custom') {
      ops.push({ op: 'set', path: ['provider'], value: provider }, { op: 'set', path: ['model'], value: model })
    } else {
      ops.push({ op: 'unset', path: ['provider'] }, { op: 'unset', path: ['model'] })
    }
    const trimmedPrompt = systemPrompt.trim()
    if (trimmedPrompt === '') ops.push({ op: 'unset', path: ['systemPrompt'] })
    else ops.push({ op: 'set', path: ['systemPrompt'], value: trimmedPrompt })
    await this.scope.mutate(ops, this.draft?.revision)
    if (generation !== this.saveGeneration) return
    this.saving = false
    const landed = this.matches(mode, provider, model, trimmedPrompt)
    this.failed = !landed
    if (landed) this.draft = undefined
    this.publish()
  }

  private matches(mode: 'inherit' | 'custom', provider: string, model: string, systemPrompt: string): boolean {
    const current = this.current()
    if (commitMessageDisplayedMode(current) !== mode) return false
    if (mode === 'custom' && (current.provider !== provider || current.model !== model)) return false
    return (current.systemPrompt ?? '') === systemPrompt
  }

  private dirty(): boolean {
    const current = this.current()
    if (this.mode() !== commitMessageDisplayedMode(current)) return true
    if (this.mode() === 'custom'
      && (this.provider().trim() !== (current.provider ?? '') || this.model().trim() !== (current.model ?? ''))) {
      return true
    }
    return this.systemPrompt().trim() !== (current.systemPrompt ?? '')
  }

  private projection(): CommitMessageSettingsCardState {
    const snapshot = this.scope.getSnapshot()
    const mode = this.mode()
    const provider = this.provider()
    const model = this.model()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.dirty(),
      invalid: mode === 'custom'
        && this.catalogStatus !== 'loading'
        && (provider.trim() === '' || model.trim() === ''),
      saving: this.saving,
      failed: this.failed,
      mode,
      provider,
      model,
      systemPrompt: this.systemPrompt(),
      candidates: this.candidates(),
      catalogStatus: this.catalogStatus,
      catalogPartial: this.catalogPartial,
    }
  }

  private publish(): void {
    this.snapshot = this.projection()
    for (const listener of this.listeners) listener()
  }
}
