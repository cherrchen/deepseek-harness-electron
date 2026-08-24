/**
 * ShellDetailsService (`ctx.shellDetails`): dynamic `details` takeover,
 * one active `shell.details.surface` id, and layout open/close delegation.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable, SlotLabel, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DETAILS_HOST_PRIORITY,
  DETAILS_SURFACE_SLOT,
  type DetailsHostInjected,
  type DetailsHostState,
  type ShellDetailsController,
} from './contract.ts'
import { DetailsHost } from './DetailsHost.tsx'

/** Mutable snapshot source for the DetailsHost inject hook. */
class DetailsHostStateSource implements HostObservable<DetailsHostState> {
  #snapshot: DetailsHostState = { activeId: null, label: null }
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
   * Replace the snapshot when the active id or label changes.
   * @param snapshot - next published state.
   */
  set(snapshot: DetailsHostState): void {
    if (snapshot.activeId === this.#snapshot.activeId && snapshot.label === this.#snapshot.label) return
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}

function resolveLabel(label: SlotLabel | undefined, id: string): string {
  if (typeof label === 'function') return label()
  if (typeof label === 'string') return label
  return id
}

/** `ctx.shellDetails` implementation. */
export class ShellDetailsService extends Service implements ShellDetailsController {
  static inject = ['slots', 'layout', 'sessions']

  private readonly owner: Context
  private readonly state = new DetailsHostStateSource()
  private takeover: (() => void) | undefined

  /**
   * @param ctx - owning plugin fiber. Takeover registrations ride this fiber
   * so consumer `open()` calls cannot pin the occupant to another plugin.
   */
  constructor(ctx: Context) {
    super(ctx, 'shellDetails')
    this.owner = ctx
    ctx.effect(() => () => { this.close() }, 'shellDetails: unload')
    ctx.effect(() => {
      const sessions = ctx.sessions
      let current = sessions.list.getSnapshot().current
      return sessions.list.subscribe(() => {
        const next = sessions.list.getSnapshot().current
        if (next === current) return
        current = next
        this.close()
      })
    }, 'shellDetails: session switch')
    ctx.effect(() => ctx.slots.subscribe(DETAILS_SURFACE_SLOT, () => { this.onSurfacesChanged() }), 'shellDetails: surface ledger')
    ctx.effect(() => ctx.slots.onEntryError((key, entry) => {
      if (key !== DETAILS_SURFACE_SLOT) return
      if (entry.options.id === this.activeId) this.close()
    }), 'shellDetails: surface crash')
  }

  /**
   * @returns the active surface id, or null while closed.
   */
  get activeId(): string | null {
    return this.state.getSnapshot().activeId
  }

  /**
   * Occupy `details` with DetailsHost, activate `id`, and open the column.
   * @param id - registered `shell.details.surface` contribution id.
   */
  open(id: string): void {
    if (this.takeover !== undefined) {
      this.activate(id)
      this.owner.layout.openDetails()
      return
    }
    try {
      this.takeover = this.owner.slots.register({
        name: 'details',
        priority: DETAILS_HOST_PRIORITY,
        children: {
          'shell.details.surface': { kind: 'list', scope: 'session' },
        },
        inject: (): DetailsHostInjected => ({
          hooks: { detailsHost: this.state },
          close: () => { this.close() },
        }),
      }, DetailsHost)
      this.activate(id)
      this.owner.layout.openDetails()
    } catch (error) {
      this.rollbackTakeover()
      throw error
    }
  }

  /**
   * Close the details column, clear the active id, and dispose takeover.
   */
  close(): void {
    if (this.takeover === undefined && this.activeId === null) return
    try {
      this.owner.layout.closeDetails()
    } catch (error) {
      if (error instanceof Error && /panel actions not wired/.test(error.message)) {
        // Root entry already gone during plugin unload.
      } else {
        throw error
      }
    }
    this.state.set({ activeId: null, label: null })
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
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
    if (id === undefined) return this.activeId !== null
    return this.activeId === id
  }

  private activate(id: string): void {
    const entry = this.requireSurface(id)
    this.state.set({ activeId: id, label: resolveLabel(entry.options.label, id) })
  }

  private requireSurface(id: string): StoredEntry {
    const entry = this.owner.slots.entries(DETAILS_SURFACE_SLOT).find(candidate => candidate.options.id === id)
    if (entry === undefined) {
      throw new Error(`shellDetails: surface ${JSON.stringify(id)} is not registered`)
    }
    return entry
  }

  private rollbackTakeover(): void {
    this.state.set({ activeId: null, label: null })
    const dispose = this.takeover
    this.takeover = undefined
    dispose?.()
  }

  private onSurfacesChanged(): void {
    const activeId = this.activeId
    if (activeId === null) return
    const present = this.owner.slots.entries(DETAILS_SURFACE_SLOT).some(entry => entry.options.id === activeId)
    if (!present) this.close()
  }
}

