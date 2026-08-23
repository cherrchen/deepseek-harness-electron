/**
 * Electron renderer adapter: map native window chrome constraints onto the
 * shared Harness UI without modifying packages/**.
 */

import { desktopApp } from './index.ts'

/** Document root attribute carrying the Electron process platform. */
export const DESKTOP_PLATFORM_ATTR = 'data-dsh-desktop-platform'

/** Sidebar column marker for the macOS column seam. */
export const MARKER_SIDEBAR = 'data-dsh-electron-sidebar'

/** Supported desktop platforms for integrated chrome layout. */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

/** Resolved layout nodes the adapter marks for platform CSS. */
export interface LayoutTargets {
  frame: Element
  sidebar: Element
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
 * Collect layout targets when the Harness shell is mounted.
 * @param root - DOM subtree to search.
 * @returns resolved targets, or null while required nodes are absent.
 */
export function resolveLayoutTargets(root: ParentNode): LayoutTargets | null {
  const frame = resolveLayoutFrame(root)
  if (frame === null) return null
  const sidebar = resolveSidebarColumn(frame)
  return sidebar === null ? null : { frame, sidebar }
}

/**
 * Apply Electron-owned layout markers when missing.
 * @param targets - Resolved layout nodes.
 * @returns whether any marker was newly attached.
 */
export function attachLayoutMarkers(targets: LayoutTargets): boolean {
  if (targets.sidebar.hasAttribute(MARKER_SIDEBAR)) return false
  targets.sidebar.setAttribute(MARKER_SIDEBAR, '')
  return true
}

/**
 * Whether layout markers still need attachment after a DOM mutation.
 * @param root - DOM subtree to inspect.
 * @returns true when reconcile should run.
 */
export function layoutNeedsReconcile(root: ParentNode): boolean {
  const targets = resolveLayoutTargets(root)
  if (targets === null) return true
  return !targets.sidebar.hasAttribute(MARKER_SIDEBAR)
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
