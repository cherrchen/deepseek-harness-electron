/**
 * Public Client contract for `ctx.shellDetails` and the `shell.details.surface`
 * list slot. Types only.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Slot key declared by DetailsHost while it occupies `details`. */
export const DETAILS_SURFACE_SLOT = 'shell.details.surface' as const

/**
 * Shadowing rank for the DetailsHost `details` registration.
 * Lower than the upstream DetailsPanel default of 0, so this entry wins the
 * single cell while registered and restoring the default occupant requires
 * only disposing this registration.
 */
export const DETAILS_HOST_PRIORITY = -1

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Active details-column body hosted by DetailsHost. Contributors register
     * with a unique `id`; at most one id is rendered at a time.
     */
    'shell.details.surface': { kind: 'list'; scope: 'session' }
  }
}

/** Snapshot published into the DetailsHost inject `hooks` compartment. */
export interface DetailsHostState {
  /** Currently rendered surface id, or null while takeover is idle. */
  readonly activeId: string | null
  /** Resolved label of the active surface, or null while idle. */
  readonly label: string | null
}

/** Injected business face of the DetailsHost `details` occupant. */
export interface DetailsHostInjected {
  hooks: {
    /** Active surface snapshot bound by the renderer as `useDetailsHost`. */
    detailsHost: HostObservable<DetailsHostState>
  }
  /** Close the details column and release takeover. */
  close(): void
}

/**
 * Cross-plugin controller for the AppFrame details column. Implementations
 * own at most one active surface id and never write panel geometry.
 */
export interface ShellDetailsController {
  /**
   * Occupy `details` with DetailsHost, activate `id`, and open the column.
   * A missing id rolls back takeover so the upstream occupant remains the
   * winner, then throws.
   * @param id - registered `shell.details.surface` contribution id.
   */
  open(id: string): void
  /**
   * Close the details column, clear the active id, and dispose takeover.
   * Idempotent while already closed.
   */
  close(): void
  /**
   * Open `id` when it is not active; close when it is.
   * @param id - registered `shell.details.surface` contribution id.
   */
  toggle(id: string): void
  /** Whether any surface is active. */
  isOpen(): boolean
  /**
   * Whether `id` is the active surface.
   * @param id - surface id to compare.
   */
  isOpen(id: string): boolean
  /** Active surface id, or null while closed. */
  readonly activeId: string | null
}
