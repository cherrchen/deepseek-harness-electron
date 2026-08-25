/**
 * Public Client contract for `ctx.shellDetails` and details Host slots.
 * Types and feature vocabulary only.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Slot key declared by DetailsHost while it occupies `details`. */
export const DETAILS_SURFACE_SLOT = 'shell.details.surface' as const

/** Slot key for per-surface Host header action contributions. */
export const DETAILS_HEADER_ACTIONS_SLOT = 'shell.details.header.actions' as const

/**
 * Fixed registrant identity for the DetailsHost `details` takeover entry.
 * The `details` slot is single-cell, so Host stamps this on `registrant`
 * and verifies winner identity after register.
 */
export const DETAILS_HOST_ENTRY_ID = 'dsh-electron.details-host' as const

/**
 * Shadowing rank for the DetailsHost `details` registration.
 * Lower than the upstream DetailsPanel default of 0, so this entry wins the
 * single cell while registered and restoring the default occupant requires
 * only disposing this registration.
 */
export const DETAILS_HOST_PRIORITY = -1

/** Public API version of `ctx.shellDetails`. */
export const SHELL_DETAILS_API_VERSION = 2 as const

/**
 * Feature vocabulary for capability negotiation.
 * Append-only after publish; existing feature meanings must not change.
 */
export type ShellDetailsFeature =
  | 'stateSubscription'
  | 'payloadRouting'
  | 'surfaceInstances'
  | 'conflictDetection'
  | 'surfaceDescriptors'
  | 'surfaceLifecycle'
  | 'headerActions'
  | 'sessionRestore'
  | 'navigationHistory'
  | 'dedupe'

/** Features enabled by the current Host implementation (through P2). */
export const SHELL_DETAILS_ENABLED_FEATURES: readonly ShellDetailsFeature[] = [
  'stateSubscription',
  'payloadRouting',
  'surfaceInstances',
  'conflictDetection',
  'surfaceDescriptors',
  'surfaceLifecycle',
  'headerActions',
  'sessionRestore',
  'navigationHistory',
  'dedupe',
]

/** Features enabled by the P0 Host subset (still exported for consumers). */
export const SHELL_DETAILS_P0_FEATURES: readonly ShellDetailsFeature[] = [
  'stateSubscription',
  'payloadRouting',
  'surfaceInstances',
  'conflictDetection',
]

/**
 * Why a surface instance left the active seat or was dropped from history.
 */
export type DetailsSurfaceCloseReason =
  | 'user'
  | 'replace'
  | 'surface-unload'
  | 'surface-crash'
  | 'host-unload'
  | 'session-close'
  | 'history-evicted'

/**
 * Optional behavior metadata for a surface id. Renderable contributions remain
 * on `shell.details.surface`; a descriptor without a slot contribution cannot
 * open, while a slot contribution without a descriptor still opens.
 */
export interface DetailsSurfaceDescriptor<P = unknown> {
  readonly id: string
  /**
   * Optional dedupe key factory. Matching opens reuse `instanceId` and update
   * payload instead of creating a new instance.
   * @param payload - open payload for this surface.
   * @returns a stable key, or undefined to skip dedupe.
   */
  dedupeKey?: (payload: P) => string | undefined
  /**
   * Invoked when a new instance is committed.
   * @param instance - committed instance.
   */
  onOpen?: (instance: DetailsSurfaceInstance<P>) => void
  /**
   * Invoked when an instance becomes the active details body.
   * @param instance - activated instance.
   */
  onActivate?: (instance: DetailsSurfaceInstance<P>) => void
  /**
   * Invoked when an active instance leaves the seat before close.
   * @param instance - deactivated instance.
   */
  onDeactivate?: (instance: DetailsSurfaceInstance<P>) => void
  /**
   * Invoked after deactivate when the instance is fully closed.
   * @param instance - closed instance.
   * @param reason - why the instance closed.
   */
  onClose?: (instance: DetailsSurfaceInstance<P>, reason: DetailsSurfaceCloseReason) => void
}

/**
 * One live details surface instance. Distinguishes surface type (`surfaceId`),
 * instance identity (`instanceId`), and open arguments (`payload`).
 */
export interface DetailsSurfaceInstance<P = unknown> {
  readonly instanceId: string
  readonly surfaceId: string
  readonly payload: P
  readonly label: string
  readonly sessionId: string
}

/**
 * Open request for the v0.2 `open(request)` overload.
 * @typeParam P - payload type; inferred from the request literal or map.
 */
export interface ShellDetailsOpenRequest<P = unknown> {
  surfaceId: string
  payload?: P
  /**
   * Navigation mode. Default `push` retains the previous active instance in
   * the session back stack; `replace` closes it.
   */
  navigation?: 'push' | 'replace'
}

/** Owner props passed into details Host child slots via `renderSlot`. */
export interface DetailsSurfaceOwnerProps {
  detailsInstance: DetailsSurfaceInstance
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Active details-column body hosted by DetailsHost. Contributors register
     * with a unique `id`; at most one id is rendered at a time. Owner props
     * carry the active surface instance for payload routing.
     */
    'shell.details.surface': {
      kind: 'list'
      scope: 'session'
      owner: DetailsSurfaceOwnerProps
    }
    /**
     * Host-header actions for the active surface. Filtered with `only` to the
     * active surface id so inactive plugins do not render controls.
     */
    'shell.details.header.actions': {
      kind: 'list'
      scope: 'session'
      owner: DetailsSurfaceOwnerProps
    }
  }
}

/**
 * Public reactive snapshot of shell details state for the current session.
 */
export interface ShellDetailsSnapshot {
  readonly open: boolean
  readonly activeId: string | null
  readonly activeInstance: DetailsSurfaceInstance | null
  readonly label: string | null
  readonly canGoBack: boolean
  readonly historyDepth: number
}

/** Snapshot published into the DetailsHost inject `hooks` compartment. */
export interface DetailsHostState {
  /** Currently rendered surface id, or null while takeover is idle. */
  readonly activeId: string | null
  /** Active surface instance, or null while idle. */
  readonly activeInstance: DetailsSurfaceInstance | null
  /** Resolved label of the active surface, or null while idle. */
  readonly label: string | null
  /** Whether {@link ShellDetailsController.back} can restore history. */
  readonly canGoBack: boolean
}

/** Injected business face of the DetailsHost `details` occupant. */
export interface DetailsHostInjected {
  hooks: {
    /** Active surface snapshot bound by the renderer as `useDetailsHost`. */
    detailsHost: HostObservable<DetailsHostState>
  }
  /** Close the details column and clear the current session's navigation. */
  close(): void
  /** Restore the previous instance from the current session back stack. */
  back(): void
}

/**
 * Cross-plugin controller for the AppFrame details column. Implementations
 * own at most one active surface instance and never write panel geometry.
 */
export interface ShellDetailsController {
  /** Public API version. */
  readonly apiVersion: typeof SHELL_DETAILS_API_VERSION
  /** Enabled feature set for capability negotiation. */
  readonly features: ReadonlySet<ShellDetailsFeature>
  /**
   * Occupy `details` with DetailsHost, activate `id`, and open the column.
   * Compatibility overload; equivalent to `open({ surfaceId: id })`.
   * @param id - registered `shell.details.surface` contribution id.
   */
  open(id: string): void
  /**
   * Occupy `details` with DetailsHost, create an instance from `request`,
   * and open the column.
   * @param request - surface id plus optional payload.
   * @returns the committed active instance.
   */
  open<P = unknown>(request: ShellDetailsOpenRequest<P>): DetailsSurfaceInstance<P>
  /**
   * Close the details column, clear the current session's navigation, and
   * dispose takeover. Idempotent while already closed. Public closes use
   * reason `user`.
   */
  close(): void
  /**
   * Restore the previous instance from the current session back stack.
   * No-op when the stack is empty.
   */
  back(): void
  /**
   * Whether the current session has a non-empty back stack.
   * @returns true when {@link back} would restore an instance.
   */
  canGoBack(): boolean
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
  /**
   * Active surface id compatibility alias (`activeInstance?.surfaceId ?? null`).
   */
  readonly activeId: string | null
  /** Active surface instance, or null while closed. */
  readonly activeInstance: DetailsSurfaceInstance | null
  /**
   * Read the public reactive snapshot.
   * @returns current shell details state.
   */
  getSnapshot(): ShellDetailsSnapshot
  /**
   * Subscribe to public snapshot changes.
   * @param listener - notified after a distinct snapshot is published.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void
  /**
   * Register optional behavior metadata for a surface id.
   * @param descriptor - lifecycle and future dedupe metadata.
   * @returns disposer that removes the descriptor (HMR-safe).
   */
  registerSurface<P = unknown>(descriptor: DetailsSurfaceDescriptor<P>): () => void
}
