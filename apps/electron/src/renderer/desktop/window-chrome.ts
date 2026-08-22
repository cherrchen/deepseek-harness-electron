/**
 * Electron renderer adapter: map native window chrome constraints onto the
 * shared Harness UI without modifying packages/**.
 */

import { desktopApp } from './index.ts'

/** Document root attribute carrying the Electron process platform. */
export const DESKTOP_PLATFORM_ATTR = 'data-dsh-desktop-platform'

/** Sidebar column marker for macOS traffic-light safe area. */
export const MARKER_SIDEBAR = 'data-dsh-electron-sidebar'

/** Main conversation header marker for drag regions and caption inset. */
export const MARKER_MAIN_HEADER = 'data-dsh-electron-main-header'

/** Right-aligned header utilities marker for Windows caption collision avoidance. */
export const MARKER_HEADER_UTILITIES = 'data-dsh-electron-header-utilities'

/** Main center column marker for hero-phase top drag regions. */
export const MARKER_CENTER = 'data-dsh-electron-center'

/** Drag region marker applied to header chrome backgrounds. */
export const MARKER_DRAG_REGION = 'data-dsh-electron-drag-region'

/** Collapsed sidebar rail width (matches ui-layout SIDEBAR_COLLAPSED). */
export const SIDEBAR_COLLAPSED_WIDTH = 56

/** Horizontal safe width for macOS traffic lights from the window origin. */
export const MACOS_TRAFFIC_LIGHT_SAFE_WIDTH = 80

/** Vertical inset under macOS traffic lights before sidebar content starts. */
export const MACOS_SIDEBAR_TOP_INSET = 28

/** Draggable band height at the top of the sidebar column (matches top inset). */
export const MACOS_SIDEBAR_DRAG_HEIGHT = MACOS_SIDEBAR_TOP_INSET

/** Draggable band height along the main column top edge (hero / hidden header). */
export const MACOS_CENTER_DRAG_HEIGHT = 40

/** Width of the sidebar/main seam gradient on macOS. */
export const MACOS_SIDEBAR_SEAM_WIDTH = 8

/** Supported desktop platforms for integrated chrome layout. */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

/** Resolved layout nodes the adapter marks for platform CSS. */
export interface LayoutTargets {
  frame: Element
  sidebar: Element
  center: Element
  mainHeader: HTMLElement | null
  headerUtilities: HTMLElement | null
}

/**
 * Normalize Electron `process.platform` into a closed desktop platform union.
 * @param platform - Raw platform string from the preload bridge.
 * @returns the integrated-chrome platform key.
 */
export function normalizeDesktopPlatform(platform: string): DesktopPlatform {
  if (platform === 'darwin') return 'darwin'
  if (platform === 'win32') return 'win32'
  return 'linux'
}

/**
 * Find the three-column AppFrame via its stable overlay anchor.
 * @param root - DOM subtree to search (typically `#root` or `document`).
 * @returns the frame element, or null before the Harness UI mounts.
 */
export function resolveLayoutFrame(root: ParentNode): Element | null {
  const overlay = root.querySelector('[data-shell-overlay]')
  const frame = overlay?.parentElement ?? null
  if (frame === null) return null
  if (frame.querySelector(':scope > [data-shell-overlay]') !== overlay) return null
  return frame
}

/**
 * Resolve the sidebar grid column (first structural child of the frame).
 * @param frame - AppFrame element from {@link resolveLayoutFrame}.
 * @returns the sidebar column element.
 */
export function resolveSidebarColumn(frame: Element): Element | null {
  const overlay = frame.querySelector('[data-shell-overlay]')
  if (overlay === null) return null
  const candidate = frame.firstElementChild
  while (candidate !== null && candidate !== overlay) {
    return candidate
  }
  return null
}

/**
 * Resolve the center conversation column (second structural child of the frame).
 * @param frame - AppFrame element from {@link resolveLayoutFrame}.
 * @returns the center column element.
 */
export function resolveCenterColumn(frame: Element): Element | null {
  const sidebar = resolveSidebarColumn(frame)
  return sidebar?.nextElementSibling ?? null
}

/**
 * Resolve the session header inside the center column.
 * @param center - Center column element from {@link resolveCenterColumn}.
 * @returns the conversation session header, or null while blank.
 */
export function resolveMainHeader(center: Element): HTMLElement | null {
  const visible = center.querySelector('header:not([aria-hidden="true"])')
  if (visible instanceof HTMLElement) return visible
  const header = center.querySelector('header')
  return header instanceof HTMLElement ? header : null
}

/**
 * Resolve the right-aligned utilities cluster in the session header title row.
 * @param header - Session header from {@link resolveMainHeader}.
 * @returns the utilities container, or null when the header is hidden.
 */
export function resolveHeaderUtilities(header: HTMLElement): HTMLElement | null {
  const titleRow = header.firstElementChild
  if (!(titleRow instanceof HTMLElement)) return null
  const last = titleRow.lastElementChild
  return last instanceof HTMLElement ? last : null
}

/**
 * Collect layout targets when the Harness shell is mounted.
 * @param root - DOM subtree to search.
 * @returns resolved targets, or null while required nodes are absent.
 */
export function resolveLayoutTargets(root: ParentNode): LayoutTargets | null {
  const frame = resolveLayoutFrame(root)
  if (frame === null) return null
  const sidebar = resolveSidebarColumn(frame)
  const center = resolveCenterColumn(frame)
  if (sidebar === null || center === null) return null
  const mainHeader = resolveMainHeader(center)
  return {
    frame,
    sidebar,
    center,
    mainHeader,
    headerUtilities: mainHeader === null ? null : resolveHeaderUtilities(mainHeader),
  }
}

/**
 * Apply Electron-owned layout markers when missing.
 * @param targets - Resolved layout nodes.
 * @returns whether any marker was newly attached.
 */
export function attachLayoutMarkers(targets: LayoutTargets): boolean {
  let changed = false
  if (!targets.sidebar.hasAttribute(MARKER_SIDEBAR)) {
    targets.sidebar.setAttribute(MARKER_SIDEBAR, '')
    changed = true
  }
  if (!targets.sidebar.hasAttribute(MARKER_DRAG_REGION)) {
    targets.sidebar.setAttribute(MARKER_DRAG_REGION, '')
    changed = true
  }
  if (!targets.center.hasAttribute(MARKER_CENTER)) {
    targets.center.setAttribute(MARKER_CENTER, '')
    changed = true
  }
  if (!targets.center.hasAttribute(MARKER_DRAG_REGION)) {
    targets.center.setAttribute(MARKER_DRAG_REGION, '')
    changed = true
  }
  if (targets.mainHeader !== null && !targets.mainHeader.hasAttribute(MARKER_MAIN_HEADER)) {
    targets.mainHeader.setAttribute(MARKER_MAIN_HEADER, '')
    changed = true
  }
  if (targets.mainHeader !== null && !targets.mainHeader.hasAttribute(MARKER_DRAG_REGION)) {
    targets.mainHeader.setAttribute(MARKER_DRAG_REGION, '')
    changed = true
  }
  if (
    targets.headerUtilities !== null
    && !targets.headerUtilities.hasAttribute(MARKER_HEADER_UTILITIES)
  ) {
    targets.headerUtilities.setAttribute(MARKER_HEADER_UTILITIES, '')
    changed = true
  }
  return changed
}

/**
 * Whether layout markers still need attachment after a DOM mutation.
 * @param root - DOM subtree to inspect.
 * @returns true when reconcile should run.
 */
export function layoutNeedsReconcile(root: ParentNode): boolean {
  const targets = resolveLayoutTargets(root)
  if (targets === null) return true
  if (!targets.sidebar.hasAttribute(MARKER_SIDEBAR)) return true
  if (!targets.sidebar.hasAttribute(MARKER_DRAG_REGION)) return true
  if (!targets.center.hasAttribute(MARKER_CENTER)) return true
  if (!targets.center.hasAttribute(MARKER_DRAG_REGION)) return true
  if (targets.mainHeader !== null && !targets.mainHeader.hasAttribute(MARKER_MAIN_HEADER)) return true
  if (targets.mainHeader !== null && !targets.mainHeader.hasAttribute(MARKER_DRAG_REGION)) return true
  if (
    targets.headerUtilities !== null
    && !targets.headerUtilities.hasAttribute(MARKER_HEADER_UTILITIES)
  ) {
    return true
  }
  return false
}

/**
 * Attach layout markers to the current Harness shell, if present.
 * @param root - DOM subtree to reconcile (typically `document`).
 * @returns whether any marker was newly attached.
 */
export function reconcileWindowChromeLayout(root: ParentNode): boolean {
  const targets = resolveLayoutTargets(root)
  if (targets === null) return false
  return attachLayoutMarkers(targets)
}

/**
 * Install the desktop platform attribute, reconcile once, and observe `#root`
 * for Harness UI mount/remount without reacting to unrelated mutations.
 * @returns disposer that disconnects the observer.
 */
export async function installWindowChrome(): Promise<() => void> {
  const platform = normalizeDesktopPlatform(await desktopApp.getPlatform())
  document.documentElement.setAttribute(DESKTOP_PLATFORM_ATTR, platform)

  const root = document.getElementById('root')
  if (root === null) throw new Error('desktop window chrome: missing #root')

  reconcileWindowChromeLayout(document)

  const observer = new MutationObserver(() => {
    if (layoutNeedsReconcile(document)) reconcileWindowChromeLayout(document)
  })
  observer.observe(root, { childList: true, subtree: true })

  return () => { observer.disconnect() }
}
