/**
 * ShellDetailsService (`ctx.shellDetails`): per-session details navigation,
 * takeover, descriptors, and layout open/close.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable, SlotLabel, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_HOST_ENTRY_ID,
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  SHELL_DETAILS_API_VERSION,
  SHELL_DETAILS_ENABLED_FEATURES,
  type DetailsHostInjected,
  type DetailsHostState,
  type DetailsSurfaceCloseReason,
  type DetailsSurfaceDescriptor,
  type DetailsSurfaceInstance,
  type ShellDetailsController,
  type ShellDetailsFeature,
  type ShellDetailsOpenRequest,
  type ShellDetailsSnapshot,
} from './contract.ts'
import {
  DetailsDescriptorRegistry,
  notifyActivated,
  notifyClosed,
  notifyDeactivated,
  notifyOpened,
} from './descriptor.ts'
import {
  DetailsSurfaceDuplicateError,
  DetailsSurfaceNotFoundError,
  DetailsTakeoverConflictError,
} from './errors.ts'
import { createSurfaceInstance } from './instance.ts'
import {
  canGoBack as sessionCanGoBack,
  findDedupedInstance,
  popHistory,
  pruneSurfaceId,
  pushToHistory,
  resolveDedupeKey,
  withUpdatedPayload,
} from './navigation.ts'
import { DetailsSessionStore } from './session-state.ts'
import { DetailsHost } from './DetailsHost.tsx'

/** Mutable snapshot source for DetailsHost inject and public subscribe. */
class DetailsHostStateSource implements HostObservable<DetailsHostState> {
  #snapshot: DetailsHostState = {
    activeId: null,
    activeInstance: null,
    label: null,
    canGoBack: false,
  }
  readonly #listeners = new Set<() => void>()

  /**
   * @returns the current active-surface snapshot.
   */
  getSnapshot(): DetailsHostState {
    return this.#snapshot
  }

  /**
   * Subscribe to snapshot replacement.
   * @param listener - notified after a distinct snapshot is published.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Replace the snapshot when published fields change.
   * @param snapshot - next published state.
   */
  set(snapshot: DetailsHostState): void {
    const prev = this.#snapshot
    if (
      snapshot.activeId === prev.activeId
      && snapshot.label === prev.label
      && snapshot.canGoBack === prev.canGoBack
      && snapshot.activeInstance?.instanceId === prev.activeInstance?.instanceId
      && snapshot.activeInstance?.payload === prev.activeInstance?.payload
    ) {
      return
    }
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}

function resolveLabel(label: SlotLabel | undefined, id: string): string {
  if (typeof label === 'function') return label()
  if (typeof label === 'string') return label
  return id
}

function isOpenRequest(value: string | ShellDetailsOpenRequest): value is ShellDetailsOpenRequest {
  return typeof value === 'object' && value !== null && 'surfaceId' in value
}

/** `ctx.shellDetails` implementation. */
export class ShellDetailsService extends Service implements ShellDetailsController {
  static inject = ['slots', 'layout', 'sessions']

  readonly apiVersion = SHELL_DETAILS_API_VERSION
  readonly features: ReadonlySet<ShellDetailsFeature> = new Set(SHELL_DETAILS_ENABLED_FEATURES)

  private readonly owner: Context
  private readonly state = new DetailsHostStateSource()
  private readonly descriptors = new DetailsDescriptorRegistry()
  private readonly sessions = new DetailsSessionStore()
  private takeover: (() => void) | undefined

  /**
   * @param ctx - owning plugin fiber. Takeover registrations ride this fiber
   * so consumer `open()` calls cannot pin the occupant to another plugin.
   */
  constructor(ctx: Context) {
    super(ctx, 'shellDetails')
    this.owner = ctx
    ctx.effect(() => () => {
      this.disposeAllSessions('host-unload')
      this.descriptors.clear()
      this.sessions.clear()
    }, 'shellDetails: unload')
    ctx.effect(() => {
      const sessions = ctx.sessions
      let current = sessions.list.getSnapshot().current
      return sessions.list.subscribe(() => {
        const snapshot = sessions.list.getSnapshot()
        this.purgeDeletedSessions(snapshot.ids.map(String))
        const next = snapshot.current
        if (next === current) return
        const previous = current
        current = next
        this.onSessionSwitch(
          previous === undefined ? undefined : String(previous),
          next === undefined ? undefined : String(next),
        )
      })
    }, 'shellDetails: session list')
    ctx.effect(() => ctx.slots.subscribe(DETAILS_SURFACE_SLOT, () => { this.onSurfacesChanged() }), 'shellDetails: surface ledger')
    ctx.effect(() => ctx.slots.onEntryError((key, entry) => {
      if (key !== DETAILS_SURFACE_SLOT) return
      const surfaceId = entry.options.id
      if (surfaceId === undefined) return
      this.recoverAfterSurfaceLoss(surfaceId, 'surface-crash')
    }), 'shellDetails: surface crash')
  }

  /**
   * @returns the active surface id, or null while closed.
   */
  get activeId(): string | null {
    return this.state.getSnapshot().activeId
  }

  /**
   * @returns the active surface instance, or null while closed.
   */
  get activeInstance(): DetailsSurfaceInstance | null {
    return this.state.getSnapshot().activeInstance
  }

  /**
   * Read the public reactive snapshot.
   * @returns current shell details state.
   */
  getSnapshot(): ShellDetailsSnapshot {
    const published = this.state.getSnapshot()
    const session = this.sessions.get(this.currentSessionId())
    const historyDepth = session?.backStack.length ?? 0
    return {
      open: published.activeInstance !== null,
      activeId: published.activeId,
      activeInstance: published.activeInstance,
      label: published.label,
      canGoBack: published.canGoBack,
      historyDepth,
    }
  }

  /**
   * Subscribe to public snapshot changes.
   * @param listener - notified after a distinct snapshot is published.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    return this.state.subscribe(listener)
  }

  /**
   * Register optional behavior metadata for a surface id.
   * @param descriptor - lifecycle and dedupe metadata.
   * @returns disposer that removes the descriptor.
   */
  registerSurface<P = unknown>(descriptor: DetailsSurfaceDescriptor<P>): () => void {
    return this.descriptors.register(descriptor)
  }

  /**
   * Occupy `details` with DetailsHost, activate a surface, and open the column.
   * @param id - registered `shell.details.surface` contribution id.
   */
  open(id: string): void
  /**
   * Occupy `details` with DetailsHost, create or reuse an instance from
   * `request`, and open the column.
   * @param request - surface id, optional payload, and navigation mode.
   * @returns the committed active instance.
   */
  open<P = unknown>(request: ShellDetailsOpenRequest<P>): DetailsSurfaceInstance<P>
  open(idOrRequest: string | ShellDetailsOpenRequest): DetailsSurfaceInstance | void {
    const request: ShellDetailsOpenRequest = isOpenRequest(idOrRequest)
      ? idOrRequest
      : { surfaceId: idOrRequest }
    const returnInstance = isOpenRequest(idOrRequest)
    const navigation = request.navigation ?? 'push'
    const sessionId = this.currentSessionId()
    const session = this.sessions.getOrCreate(sessionId)
    const acquiredTakeover = this.takeover === undefined

    if (acquiredTakeover) {
      try {
        this.takeover = this.registerTakeover()
        this.assertTakeoverWinner()
      } catch (error) {
        this.rollbackTakeover()
        throw error
      }
    } else {
      try {
        this.assertTakeoverWinner()
      } catch (error) {
        this.rollbackTakeover()
        throw error
      }
    }

    try {
      const entry = this.requireUniqueSurface(request.surfaceId)
      const label = resolveLabel(entry.options.label, request.surfaceId)
      const payload = request.payload as unknown
      const descriptor = this.descriptors.get(request.surfaceId)
      const dedupeKey = resolveDedupeKey(descriptor, payload)

      if (dedupeKey !== undefined && descriptor !== undefined) {
        const match = findDedupedInstance(session, request.surfaceId, dedupeKey, descriptor)
        if (match !== undefined) {
          const updated = withUpdatedPayload(match.instance, payload, label)
          if (match.where === 'active') {
            session.active = updated
            this.publishSession(session)
            notifyActivated(this.descriptors, updated)
            this.owner.layout.openDetails()
            return returnInstance ? updated : undefined
          }
          session.backStack.splice(match.index, 1)
          this.leaveActive(session, navigation)
          session.active = updated
          this.publishSession(session)
          notifyActivated(this.descriptors, updated)
          this.owner.layout.openDetails()
          return returnInstance ? updated : undefined
        }
      }

      const candidate = createSurfaceInstance(request.surfaceId, payload, label, sessionId)
      this.leaveActive(session, navigation)
      session.active = candidate
      this.publishSession(session)
      notifyOpened(this.descriptors, candidate)
      this.owner.layout.openDetails()
      return returnInstance ? candidate : undefined
    } catch (error) {
      if (acquiredTakeover) this.rollbackTakeover()
      throw error
    }
  }

  /**
   * Close the details column and clear the current session's navigation.
   */
  close(): void {
    this.clearCurrentSession('user')
  }

  /**
   * Restore the previous instance from the current session back stack.
   */
  back(): void {
    const sessionId = this.currentSessionId()
    const session = this.sessions.get(sessionId)
    if (session === undefined || session.backStack.length === 0) return
    const leaving = session.active
    if (leaving !== null) {
      notifyClosed(this.descriptors, leaving, 'user')
    }
    const restored = popHistory(session)
    session.active = restored ?? null
    if (restored === undefined) {
      this.publishSession(session)
      this.releaseTakeover()
      return
    }
    this.ensureTakeover()
    this.publishSession(session)
    notifyActivated(this.descriptors, restored)
    this.owner.layout.openDetails()
  }

  /**
   * Whether the current session has a non-empty back stack.
   * @returns true when {@link back} would restore an instance.
   */
  canGoBack(): boolean {
    const session = this.sessions.get(this.currentSessionId())
    return session !== undefined && sessionCanGoBack(session)
  }

  /**
   * Open `id` when it is not active; close when it is.
   * @param id - registered `shell.details.surface` contribution id.
   */
  toggle(id: string): void {
    if (this.isOpen(id)) this.close()
    else this.open(id)
  }

  /**
   * Whether any surface is active, or whether `id` is the active surface.
   * @param id - optional surface id to compare.
   * @returns open state for the requested query.
   */
  isOpen(id?: string): boolean {
    if (id === undefined) return this.activeInstance !== null
    return this.activeId === id
  }

  private leaveActive(
    session: ReturnType<DetailsSessionStore['getOrCreate']>,
    navigation: 'push' | 'replace',
  ): void {
    const previous = session.active
    if (previous === null) return
    if (navigation === 'replace') {
      notifyClosed(this.descriptors, previous, 'replace')
      session.active = null
      return
    }
    notifyDeactivated(this.descriptors, previous)
    const evicted = pushToHistory(session, previous)
    session.active = null
    for (const dropped of evicted) {
      notifyClosed(this.descriptors, dropped, 'history-evicted', { deactivate: false })
    }
  }

  private clearCurrentSession(reason: DetailsSurfaceCloseReason): void {
    const sessionId = this.currentSessionId()
    const session = this.sessions.get(sessionId)
    if (
      this.takeover === undefined
      && this.activeInstance === null
      && (session === undefined || (session.active === null && session.backStack.length === 0))
    ) {
      return
    }
    if (session !== undefined) {
      if (session.active !== null) {
        notifyClosed(this.descriptors, session.active, reason)
      }
      for (const entry of session.backStack) {
        notifyClosed(this.descriptors, entry, reason, { deactivate: false })
      }
      session.active = null
      session.backStack = []
    }
    this.publishIdle()
    this.releaseTakeover()
  }

  private onSessionSwitch(previous: string | undefined, next: string | undefined): void {
    if (previous !== undefined) {
      const prior = this.sessions.get(previous)
      if (prior?.active !== null && prior !== undefined) {
        notifyDeactivated(this.descriptors, prior.active)
      }
    }
    if (next === undefined) {
      this.publishIdle()
      this.releaseTakeover()
      return
    }
    const session = this.sessions.get(next)
    if (session?.active == null) {
      this.publishIdle()
      this.releaseTakeover()
      return
    }
    this.ensureTakeover()
    this.publishSession(session)
    notifyActivated(this.descriptors, session.active)
    this.owner.layout.openDetails()
  }

  private purgeDeletedSessions(liveIds: readonly string[]): void {
    const live = new Set(liveIds)
    for (const sessionId of [...this.sessions.keys()]) {
      if (live.has(sessionId)) continue
      const state = this.sessions.get(sessionId)
      if (state !== undefined) {
        if (state.active !== null) {
          notifyClosed(this.descriptors, state.active, 'session-close')
        }
        for (const entry of state.backStack) {
          notifyClosed(this.descriptors, entry, 'session-close', { deactivate: false })
        }
      }
      this.sessions.delete(sessionId)
    }
  }

  private recoverAfterSurfaceLoss(
    surfaceId: string,
    reason: Extract<DetailsSurfaceCloseReason, 'surface-unload' | 'surface-crash'>,
  ): void {
    const sessionId = this.currentSessionId()
    const session = this.sessions.get(sessionId)
    if (session === undefined) return
    const previousActiveId = this.activeInstance?.instanceId
    const removed = pruneSurfaceId(session, surfaceId)
    for (const instance of removed) {
      notifyClosed(this.descriptors, instance, reason, {
        deactivate: instance.instanceId === previousActiveId,
      })
    }
    if (session.active !== null) {
      this.publishSession(session)
      return
    }
    while (session.backStack.length > 0) {
      const candidate = popHistory(session)!
      if (!this.surfacePresent(candidate.surfaceId)) {
        notifyClosed(this.descriptors, candidate, reason, { deactivate: false })
        continue
      }
      session.active = candidate
      this.ensureTakeover()
      this.publishSession(session)
      notifyActivated(this.descriptors, candidate)
      this.owner.layout.openDetails()
      return
    }
    this.publishSession(session)
    this.releaseTakeover()
  }

  private disposeAllSessions(reason: DetailsSurfaceCloseReason): void {
    for (const sessionId of [...this.sessions.keys()]) {
      const session = this.sessions.get(sessionId)
      if (session === undefined) continue
      if (session.active !== null) {
        notifyClosed(this.descriptors, session.active, reason)
      }
      for (const entry of session.backStack) {
        notifyClosed(this.descriptors, entry, reason, { deactivate: false })
      }
    }
    this.publishIdle()
    this.releaseTakeover()
  }

  private onSurfacesChanged(): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) return
    const missing = new Set<string>()
    if (session.active !== null && !this.surfacePresent(session.active.surfaceId)) {
      missing.add(session.active.surfaceId)
    }
    for (const entry of session.backStack) {
      if (!this.surfacePresent(entry.surfaceId)) missing.add(entry.surfaceId)
    }
    for (const surfaceId of missing) {
      this.recoverAfterSurfaceLoss(surfaceId, 'surface-unload')
    }
  }

  private surfacePresent(surfaceId: string): boolean {
    return this.owner.slots.entries(DETAILS_SURFACE_SLOT).some(entry => entry.options.id === surfaceId)
  }

  private ensureTakeover(): void {
    if (this.takeover !== undefined) {
      this.assertTakeoverWinner()
      return
    }
    this.takeover = this.registerTakeover()
    this.assertTakeoverWinner()
  }

  private releaseTakeover(): void {
    try {
      this.owner.layout.closeDetails()
    } catch (error) {
      if (error instanceof Error && /panel actions not wired/.test(error.message)) {
        // Root entry already gone during plugin unload.
      } else {
        throw error
      }
    }
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
  }

  private registerTakeover(): () => void {
    return this.owner.slots.register({
      name: 'details',
      registrant: DETAILS_HOST_ENTRY_ID,
      priority: DETAILS_HOST_PRIORITY,
      children: {
        'shell.details.surface': { kind: 'list', scope: 'session' },
        [DETAILS_HEADER_ACTIONS_SLOT]: { kind: 'list', scope: 'session' },
      },
      inject: (): DetailsHostInjected => ({
        hooks: { detailsHost: this.state },
        close: () => { this.close() },
        back: () => { this.back() },
      }),
    }, DetailsHost)
  }

  private assertTakeoverWinner(): void {
    const winner = this.owner.slots.entriesOfSlot('details')[0]
    if (winner === undefined || winner.component !== DetailsHost) {
      throw new DetailsTakeoverConflictError(winner?.registrant ?? winner?.options.id)
    }
  }

  private publishSession(session: { active: DetailsSurfaceInstance | null; backStack: DetailsSurfaceInstance[] }): void {
    const active = session.active
    this.state.set({
      activeId: active?.surfaceId ?? null,
      activeInstance: active,
      label: active?.label ?? null,
      canGoBack: session.backStack.length > 0,
    })
  }

  private publishIdle(): void {
    this.state.set({
      activeId: null,
      activeInstance: null,
      label: null,
      canGoBack: false,
    })
  }

  private requireUniqueSurface(id: string): StoredEntry {
    const matches = this.owner.slots.entries(DETAILS_SURFACE_SLOT)
      .filter(candidate => candidate.options.id === id)
    if (matches.length === 0) {
      throw new DetailsSurfaceNotFoundError(id)
    }
    if (matches.length > 1) {
      throw new DetailsSurfaceDuplicateError(id, matches.length)
    }
    return matches[0]!
  }

  private currentSessionId(): string {
    const current = this.owner.sessions.list.getSnapshot().current
    return typeof current === 'string' && current.length > 0 ? current : ''
  }

  private rollbackTakeover(): void {
    this.publishIdle()
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
  }
}
