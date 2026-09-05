/**
 * ShellDetailsService (`ctx.shellDetails`): per-session tabbed details
 * navigation, launcher registry, takeover, descriptors, and layout open/close.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { HostObservable, SlotLabel, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  CONVERSATION_HEADER_UTILITIES_SLOT,
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_HOST_ENTRY_ID,
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  DETAILS_TOGGLE_ENTRY_ID,
  DETAILS_TOGGLE_PRIORITY,
  SHELL_DETAILS_API_VERSION,
  SHELL_DETAILS_ENABLED_FEATURES,
  SHELL_DETAILS_LOCALE_NS,
  type DetailsHostInjected,
  type DetailsHostState,
  type DetailsLauncherContribution,
  type DetailsSurfaceCloseReason,
  type DetailsSurfaceDescriptor,
  type DetailsSurfaceInstance,
  type DetailsToggleInjected,
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
import { DetailsLauncherRegistry } from './launcher.ts'
import { createSurfaceInstance } from './instance.ts'
import {
  activateTab,
  canGoBack as sessionCanGoBack,
  evictOldestTab,
  findDedupedTab,
  popMru,
  pruneSurfaceId,
  removeTab,
  resolveDedupeKey,
  withUpdatedPayload,
} from './tabs.ts'
import { DetailsSessionStore } from './session-state.ts'
import { DetailsHost } from './DetailsHost.tsx'
import { DetailsToggle } from './DetailsToggle.tsx'
import { en, NS, zh } from './locales.ts'

/** Mutable snapshot source for DetailsHost inject and public subscribe. */
class DetailsHostStateSource implements HostObservable<DetailsHostState> {
  #snapshot: DetailsHostState = {
    tabs: [],
    activeId: null,
    activeInstance: null,
    label: null,
    launcherVisible: false,
    dockVisible: false,
    canGoBack: false,
  }
  readonly #listeners = new Set<() => void>()

  /**
   * @returns the current tab/launcher snapshot.
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
      snapshot.tabs.length === prev.tabs.length
      && snapshot.tabs.every((tab, index) => {
        const before = prev.tabs[index]!
        return tab.instanceId === before.instanceId
          && tab.label === before.label
          && tab.payload === before.payload
      })
      && snapshot.activeId === prev.activeId
      && snapshot.label === prev.label
      && snapshot.launcherVisible === prev.launcherVisible
      && snapshot.dockVisible === prev.dockVisible
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
  static inject = ['slots', 'layout', 'sessions', 'locale']

  readonly apiVersion = SHELL_DETAILS_API_VERSION
  readonly features: ReadonlySet<ShellDetailsFeature> = new Set(SHELL_DETAILS_ENABLED_FEATURES)

  private readonly owner: Context
  private readonly state = new DetailsHostStateSource()
  private readonly descriptors = new DetailsDescriptorRegistry()
  private readonly launchers = new DetailsLauncherRegistry()
  private readonly sessions = new DetailsSessionStore()
  private takeover: (() => void) | undefined
  private dockVisible = false

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
      this.launchers.clear()
      this.sessions.clear()
    }, 'shellDetails: unload')
    ctx.effect(() => {
      const sessions = ctx.sessions as unknown as ISessions
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
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'shellDetails: toggle locale')
    this.registerHeaderToggle()
  }

  /**
   * Header chrome: the App-level Details Toggle in the session header
   * utilities cluster (right of the Session Log entry). Visibility state is
   * the measured `dockVisible`; the toggle never destroys retained tabs.
   */
  private registerHeaderToggle(): void {
    this.owner.effect(() => this.owner.slots.inject(CONVERSATION_HEADER_UTILITIES_SLOT, () =>
      this.owner.slots.register({
        name: CONVERSATION_HEADER_UTILITIES_SLOT,
        id: DETAILS_TOGGLE_ENTRY_ID,
        locale: SHELL_DETAILS_LOCALE_NS,
        priority: DETAILS_TOGGLE_PRIORITY,
        inject: (): DetailsToggleInjected => ({
          hooks: { detailsToggle: this.state },
          toggleDock: () => { this.toggleDock() },
        }),
      }, DetailsToggle)), 'shellDetails: header toggle')
  }

  /**
   * Toggle dock visibility (header toggle entry point). Opening with no live
   * tabs reveals the Launcher; opening with retained tabs re-reveals them.
   * Closing only hides the column — tabs and launcher state survive.
   */
  toggleDock(): void {
    if (this.dockVisible) {
      this.owner.layout.closeDetails()
      return
    }
    const session = this.sessions.get(this.currentSessionId())
    if (session !== undefined && session.tabs.length > 0) {
      this.owner.layout.openDetails()
      return
    }
    this.showLauncher()
  }

  /**
   * Report measured column visibility from the mounted DetailsHost. The
   * false→true transition on an empty session reveals the Launcher.
   * @param visible - whether the dock column currently has width.
   */
  reportDockVisible(visible: boolean): void {
    const wasVisible = this.dockVisible
    this.dockVisible = visible
    if (visible && !wasVisible) {
      this.onDockRevealed()
      return
    }
    this.publishCurrent()
  }

  private onDockRevealed(): void {
    const session = this.sessions.getOrCreate(this.currentSessionId())
    if (session.tabs.length > 0 && session.activeInstanceId !== null) {
      this.publishCurrent()
      return
    }
    this.ensureTakeover()
    session.launcherVisible = true
    this.publishCurrent()
  }

  /**
   * @returns the active tab surface id, or null while no tab is active.
   */
  get activeId(): string | null {
    return this.state.getSnapshot().activeId
  }

  /**
   * @returns the active surface instance, or null while no tab is active.
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
    const historyDepth = session?.mru.length ?? 0
    return {
      open: published.activeInstance !== null || published.launcherVisible,
      activeId: published.activeId,
      activeInstance: published.activeInstance,
      label: published.label,
      tabs: published.tabs,
      launcherVisible: published.launcherVisible,
      dockVisible: published.dockVisible,
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
   * @param descriptor - lifecycle, dedupe, and closability metadata.
   * @returns disposer that removes the descriptor.
   */
  registerSurface<P = unknown>(descriptor: DetailsSurfaceDescriptor<P>): () => void {
    return this.descriptors.register(descriptor)
  }

  /**
   * Register a Launcher contribution. Duplicate contribution ids throw.
   * @param contribution - launcher card metadata and open intent.
   * @returns disposer that removes the contribution.
   */
  registerLauncher(contribution: DetailsLauncherContribution): () => void {
    return this.launchers.register(contribution)
  }

  /**
   * Occupy `details` with DetailsHost, activate a surface as a tab, and open
   * the column.
   * @param id - registered `shell.details.surface` contribution id.
   */
  open(id: string): void
  /**
   * Occupy `details` with DetailsHost, resolve `request` to a tab
   * (create-or-reuse), activate it, and open the column.
   * @param request - surface id, optional payload, and legacy navigation mode.
   * @returns the committed active instance.
   */
  open<P = unknown>(request: ShellDetailsOpenRequest<P>): DetailsSurfaceInstance<P>
  open(idOrRequest: string | ShellDetailsOpenRequest): DetailsSurfaceInstance | void {
    const request: ShellDetailsOpenRequest = isOpenRequest(idOrRequest)
      ? idOrRequest
      : { surfaceId: idOrRequest }
    const returnInstance = isOpenRequest(idOrRequest)
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
        const match = findDedupedTab(session, request.surfaceId, dedupeKey, descriptor)
        if (match !== undefined) {
          const updated = withUpdatedPayload(match, payload, label)
          session.tabs = session.tabs.map(tab => (tab.instanceId === match.instanceId ? updated : tab))
          this.commitActivate(session, updated, { notify: 'activate' })
          this.owner.layout.openDetails()
          return returnInstance ? updated : undefined
        }
      }

      const candidate = createSurfaceInstance(request.surfaceId, payload, label, sessionId, descriptor)
      session.tabs.push(candidate)
      const evicted = evictOldestTab(session)
      if (evicted !== undefined) {
        notifyClosed(this.descriptors, evicted, 'history-evicted')
      }
      this.commitActivate(session, candidate, { notify: 'open' })
      this.owner.layout.openDetails()
      return returnInstance ? candidate : undefined
    } catch (error) {
      if (acquiredTakeover) this.rollbackTakeover()
      throw error
    }
  }

  /**
   * Close the active tab of the current session (reason `user`). Closing the
   * last tab reveals the Launcher; the dock stays mounted.
   */
  close(): void {
    const active = this.activeInstance
    if (active === null) return
    this.closeTab(active.instanceId)
  }

  /**
   * Close the tab with this instance id (reason `user`).
   * @param instanceId - instance id of the tab to close.
   */
  closeTab(instanceId: string): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) return
    const wasActive = session.activeInstanceId === instanceId
    const outcome = removeTab(session, instanceId)
    if (outcome === undefined) return
    notifyClosed(this.descriptors, outcome.removed, 'user', { deactivate: wasActive })
    if (wasActive && outcome.nextActiveId !== null) {
      const next = session.tabs.find(tab => tab.instanceId === outcome.nextActiveId)
      if (next !== undefined) {
        this.publishSession(session)
        notifyActivated(this.descriptors, next)
        return
      }
    }
    this.publishSession(session)
  }

  /**
   * Activate the tab with this instance id and hide the Launcher.
   * @param instanceId - instance id of the tab to activate.
   */
  activate(instanceId: string): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) return
    const tab = session.tabs.find(candidate => candidate.instanceId === instanceId)
    if (tab === undefined) return
    this.commitActivate(session, tab, { notify: 'activate' })
  }

  /** Show the Launcher page and reveal the dock. */
  showLauncher(): void {
    const session = this.sessions.getOrCreate(this.currentSessionId())
    this.ensureTakeover()
    session.launcherVisible = true
    this.publishSession(session)
    this.owner.layout.openDetails()
  }

  /**
   * Restore the most recently active other tab (MRU compatibility face of
   * tab navigation). No-op when there is nothing to restore.
   */
  back(): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) return
    const candidate = popMru(session)
    if (candidate === undefined) return
    const tab = session.tabs.find(entry => entry.instanceId === candidate)
    if (tab === undefined) return
    this.commitActivate(session, tab, { notify: 'activate' })
  }

  /**
   * Whether the current session has an MRU tab to restore.
   * @returns true when {@link back} would activate a tab.
   */
  canGoBack(): boolean {
    const session = this.sessions.get(this.currentSessionId())
    return session !== undefined && sessionCanGoBack(session)
  }

  /**
   * Open `id` as a tab when it is not the active tab; close the active tab
   * when it is.
   * @param id - registered `shell.details.surface` contribution id.
   */
  toggle(id: string): void {
    if (this.isOpen(id)) this.close()
    else this.open(id)
  }

  /**
   * Whether any tab is active (or the Launcher shows), or whether `id` is the
   * active tab's surface.
   * @param id - optional surface id to compare.
   * @returns open state for the requested query.
   */
  isOpen(id?: string): boolean {
    if (id === undefined) return this.activeInstance !== null || this.getSnapshot().launcherVisible
    return this.activeId === id
  }

  private commitActivate(
    session: ReturnType<DetailsSessionStore['getOrCreate']>,
    tab: DetailsSurfaceInstance,
    options: { notify: 'open' | 'activate' },
  ): void {
    const previous = this.activeInstance
    const changed = session.activeInstanceId !== tab.instanceId
    if (changed && previous !== null && previous.instanceId !== tab.instanceId) {
      notifyDeactivated(this.descriptors, previous)
    }
    activateTab(session, tab.instanceId)
    this.publishSession(session)
    if (options.notify === 'open') {
      notifyOpened(this.descriptors, tab)
    } else {
      notifyActivated(this.descriptors, tab)
    }
  }

  private onSessionSwitch(previous: string | undefined, next: string | undefined): void {
    if (previous !== undefined) {
      const prior = this.sessions.get(previous)
      const priorActive = prior?.tabs.find(tab => tab.instanceId === prior?.activeInstanceId)
      if (priorActive !== undefined) {
        notifyDeactivated(this.descriptors, priorActive)
      }
    }
    if (next === undefined) {
      this.publishIdle()
      return
    }
    const session = this.sessions.get(next)
    const active = session?.tabs.find(tab => tab.instanceId === session?.activeInstanceId)
    if (session === undefined || active === undefined) {
      this.publishIdle()
      if (this.dockVisible) {
        const target = this.sessions.getOrCreate(next)
        target.launcherVisible = true
        this.ensureTakeover()
        this.publishSession(target)
      }
      return
    }
    this.ensureTakeover()
    this.publishSession(session)
    notifyActivated(this.descriptors, active)
  }

  private purgeDeletedSessions(liveIds: readonly string[]): void {
    const live = new Set(liveIds)
    for (const sessionId of [...this.sessions.keys()]) {
      if (live.has(sessionId)) continue
      const state = this.sessions.get(sessionId)
      if (state !== undefined) {
        for (const tab of state.tabs) {
          notifyClosed(this.descriptors, tab, 'session-close', {
            deactivate: tab.instanceId === state.activeInstanceId,
          })
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
    const previousActiveId = session.activeInstanceId
    const pruned = pruneSurfaceId(session, surfaceId)
    for (const instance of pruned.removed) {
      notifyClosed(this.descriptors, instance, reason, {
        deactivate: instance.instanceId === previousActiveId,
      })
    }
    const active = session.tabs.find(tab => tab.instanceId === pruned.activeInstanceId)
    if (active !== undefined && pruned.activeInstanceId !== previousActiveId) {
      this.publishSession(session)
      notifyActivated(this.descriptors, active)
      return
    }
    this.publishSession(session)
  }

  private disposeAllSessions(reason: DetailsSurfaceCloseReason): void {
    for (const sessionId of [...this.sessions.keys()]) {
      const session = this.sessions.get(sessionId)
      if (session === undefined) continue
      for (const tab of session.tabs) {
        notifyClosed(this.descriptors, tab, reason, {
          deactivate: tab.instanceId === session.activeInstanceId,
        })
      }
    }
    this.publishIdle()
    this.releaseTakeover()
  }

  private onSurfacesChanged(): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) return
    const missing = new Set<string>()
    for (const tab of session.tabs) {
      if (!this.surfacePresent(tab.surfaceId)) missing.add(tab.surfaceId)
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
    this.dockVisible = false
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
  }

  private registerTakeover(): () => void {
    return this.owner.slots.register({
      name: 'details',
      registrant: DETAILS_HOST_ENTRY_ID,
      priority: DETAILS_HOST_PRIORITY,
      locale: SHELL_DETAILS_LOCALE_NS,
      children: {
        'shell.details.surface': { kind: 'list', scope: 'session' },
        [DETAILS_HEADER_ACTIONS_SLOT]: { kind: 'list', scope: 'session' },
      },
      inject: (): DetailsHostInjected => ({
        hooks: { detailsHost: this.state },
        launcherEntries: this.launchers.list(),
        reportDockVisible: (visible: boolean) => { this.reportDockVisible(visible) },
        activate: (instanceId: string) => { this.activate(instanceId) },
        closeTab: (instanceId: string) => { this.closeTab(instanceId) },
        showLauncher: () => { this.showLauncher() },
        openRequest: (request: ShellDetailsOpenRequest) => { this.open(request) },
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

  private publishSession(session: {
    tabs: DetailsSurfaceInstance[]
    activeInstanceId: string | null
    launcherVisible: boolean
    mru: string[]
  }): void {
    const active = session.tabs.find(tab => tab.instanceId === session.activeInstanceId) ?? null
    this.state.set({
      tabs: [...session.tabs],
      activeId: active?.surfaceId ?? null,
      activeInstance: active,
      label: active?.label ?? null,
      launcherVisible: session.launcherVisible,
      dockVisible: this.dockVisible,
      canGoBack: sessionCanGoBack(session),
    })
  }

  private publishIdle(): void {
    this.state.set({
      tabs: [],
      activeId: null,
      activeInstance: null,
      label: null,
      launcherVisible: false,
      dockVisible: this.dockVisible,
      canGoBack: false,
    })
  }

  /** Republish the current session state (dock visibility changes). */
  private publishCurrent(): void {
    const session = this.sessions.get(this.currentSessionId())
    if (session === undefined) {
      this.publishIdle()
      return
    }
    this.publishSession(session)
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
    const current = (this.owner.sessions as unknown as ISessions).list.getSnapshot().current
    return typeof current === 'string' && current.length > 0 ? current : ''
  }

  private rollbackTakeover(): void {
    this.publishIdle()
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
  }
}
