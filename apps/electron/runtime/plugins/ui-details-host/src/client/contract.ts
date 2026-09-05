/**
 * Public Client contract for `ctx.shellDetails` and details Host slots.
 * Types and feature vocabulary only.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'

/** Slot key declared by DetailsHost while it occupies `details`. */
export const DETAILS_SURFACE_SLOT = 'shell.details.surface' as const

/** Slot key for per-surface Host header action contributions. */
export const DETAILS_HEADER_ACTIONS_SLOT = 'shell.details.header.actions' as const

/** Slot key of the session header utilities cluster (Session Log and peers). */
export const CONVERSATION_HEADER_UTILITIES_SLOT = 'conversation.session.header.utilities' as const

/** Fixed registrant identity of the Host-owned App Details Toggle entry. */
export const DETAILS_TOGGLE_ENTRY_ID = 'dsh-electron.details-toggle' as const

/**
 * Chain rank of the Details Toggle inside the utilities cluster: ascending
 * priority renders first, so `1` places the toggle after priority-0 entries
 * (the Session Log action) — to its right.
 */
export const DETAILS_TOGGLE_PRIORITY = 1

/** Locale namespace of the Details Toggle strings. */
export const SHELL_DETAILS_LOCALE_NS = 'shell-details-toggle' as const

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
export const SHELL_DETAILS_API_VERSION = 3 as const

/**
 * Feature vocabulary for capability negotiation.
 * Append-only after publish; existing feature meanings must not change.
 * v3 additions: multi-tab navigation (`tabs`), launcher contributions
 * (`launcher`), per-tab close (`tabClose`), and the observable layout
 * visibility source (`dockVisibility`).
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
  | 'tabs'
  | 'launcher'
  | 'tabClose'
  | 'dockVisibility'

/** Features enabled by the current Host implementation (v3). */
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
  'tabs',
  'launcher',
  'tabClose',
  'dockVisibility',
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
   * Whether the user may close a tab of this surface from the tab bar.
   * Default `true`; non-closable tabs render without the per-tab close
   * control (the surface can still be pruned by unload/eviction).
   */
  readonly closable?: boolean
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
  /** Copied from the descriptor at creation; absent means closable. */
  readonly closable?: boolean
}

/**
 * Launcher card icon. A React node contributed by the plugin's client half;
 * keep it to inline SVG or an existing icon-set component.
 */
export type DetailsIcon = ReactNode

/**
 * One Launcher entry. The Launcher is generated dynamically from every live
 * contribution: plugin load registers entries, plugin unload disposes them
 * and the card disappears. No plugin may be hardcoded into the Launcher.
 */
export interface DetailsLauncherContribution {
  /** Unique contribution id (namespaced, e.g. `git.changes`). */
  readonly id: string
  /** Owning plugin id; used for diagnostics and unload grouping. */
  readonly pluginId: string
  /** Card title. */
  readonly title: string
  /** Optional card icon. */
  readonly icon?: DetailsIcon
  /** Optional one-line description under the title. */
  readonly description?: string
  /** Ascending sort rank among cards (default 0, ties by registration). */
  readonly order?: number
  /** Optional visibility predicate, evaluated at Launcher render time. */
  readonly when?: () => boolean
  /**
   * Build the open request for this entry. Called on card activation; the
   * Host performs the navigation (create-or-reuse tab, activate, reveal).
   * @returns the open request to commit.
   */
  open(): ShellDetailsOpenRequest
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
 * v3: `tabs`, `launcherVisible`, and `dockVisible` join the snapshot; `open`
 * reports dock content visibility (a tab active or the Launcher showing).
 */
export interface ShellDetailsSnapshot {
  readonly open: boolean
  readonly activeId: string | null
  readonly activeInstance: DetailsSurfaceInstance | null
  readonly label: string | null
  /** Live tabs of the current session, oldest first. */
  readonly tabs: readonly DetailsSurfaceInstance[]
  /** Whether the Launcher page is showing (also implied by empty tabs). */
  readonly launcherVisible: boolean
  /** Whether the dock column is physically revealed (measured when mounted). */
  readonly dockVisible: boolean
  readonly canGoBack: boolean
  readonly historyDepth: number
}

/** Snapshot published into the DetailsHost inject `hooks` compartment. */
export interface DetailsHostState {
  /** Live tabs of the current session, oldest first. */
  readonly tabs: readonly DetailsSurfaceInstance[]
  /** Currently rendered surface id, or null while no tab is active. */
  readonly activeId: string | null
  /** Active surface instance, or null while no tab is active. */
  readonly activeInstance: DetailsSurfaceInstance | null
  /** Resolved label of the active surface, or null while no tab is active. */
  readonly label: string | null
  /** Whether the Launcher page is showing (also implied by empty tabs). */
  readonly launcherVisible: boolean
  /**
   * Whether the dock column is physically revealed. Measured by the mounted
   * DetailsHost (column width); false while the takeover is idle or the
   * layout closed the column without destroying the tabs.
   */
  readonly dockVisible: boolean
  /** Whether {@link ShellDetailsController.back} can restore an MRU tab. */
  readonly canGoBack: boolean
}

/** Injected business face of the DetailsHost `details` occupant. */
export interface DetailsHostInjected {
  hooks: {
    /** Tab/launcher snapshot bound by the renderer as `useDetailsHost`. */
    detailsHost: HostObservable<DetailsHostState>
  }
  /** Live Launcher contributions, resolved at inject time. */
  launcherEntries: readonly DetailsLauncherContribution[]
  /** Report the measured column visibility from the mounted DetailsHost. */
  reportDockVisible(visible: boolean): void
  /** Activate the tab with this instance id (hides the Launcher). */
  activate(instanceId: string): void
  /** Close one tab (lifecycle `user`); recovers the MRU or neighbor tab. */
  closeTab(instanceId: string): void
  /** Show the Launcher page (`+` button). */
  showLauncher(): void
  /** Perform a launcher navigation: open request → tab + reveal dock. */
  openRequest(request: ShellDetailsOpenRequest): void
  /** Compatibility alias for `closeTab(activeInstanceId)`. */
  close(): void
  /** Compatibility: activate the most recently active other tab. */
  back(): void
}

/**
 * Injected face of the Host-owned header Details Toggle. It shares the
 * DetailsHost observable (tab state plus measured `dockVisible`) and toggles
 * the dock without ever destroying retained tabs.
 */
export interface DetailsToggleInjected {
  hooks: {
    /** Shared tab/dock snapshot bound by the renderer as `useDetailsToggle`. */
    detailsToggle: HostObservable<DetailsHostState>
  }
  /** Toggle dock visibility; an empty dock reveals the Launcher. */
  toggleDock(): void
}

/**
 * Cross-plugin controller for the AppFrame details column. Implementations
 * own the current session's tab list and never write panel geometry.
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
   * Occupy `details` with DetailsHost, create or reuse an instance from
   * `request`, and open the column. v3 semantics: the request resolves to a
   * tab — an existing tab with the same surface id + dedupe key is reused and
   * activated, otherwise a tab is created. `navigation` is accepted for
   * v2 call compatibility and ignored (tabs replace the push/replace stack).
   * @param request - surface id, optional payload, and legacy navigation mode.
   * @returns the committed active instance.
   */
  open<P = unknown>(request: ShellDetailsOpenRequest<P>): DetailsSurfaceInstance<P>
  /**
   * Close the active tab of the current session. Closing the last tab shows
   * the Launcher; the dock stays mounted (visibility belongs to the layout
   * toggle). Compatibility note: v2 cleared the whole navigation and released
   * the takeover; v3 never destroys retained tabs beyond the one closed.
   */
  close(): void
  /**
   * Close the tab with this instance id (reason `user`). Activating fallback:
   * the MRU tab, else the adjacent tab, else none (Launcher shows).
   * @param instanceId - instance id of the tab to close.
   */
  closeTab(instanceId: string): void
  /**
   * Activate the tab with this instance id and hide the Launcher.
   * @param instanceId - instance id of the tab to activate.
   */
  activate(instanceId: string): void
  /** Show the Launcher page (`+` entry point or empty dock). */
  showLauncher(): void
  /**
   * Register a Launcher contribution. Duplicate contribution ids throw.
   * @param contribution - launcher card metadata and open intent.
   * @returns disposer that removes the contribution (HMR-safe).
   */
  registerLauncher(contribution: DetailsLauncherContribution): () => void
  /**
   * Restore the most recently active other tab (MRU compatibility face of
   * tab navigation; the v2 back stack dissolved into tabs).
   * No-op when there is nothing to restore.
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
