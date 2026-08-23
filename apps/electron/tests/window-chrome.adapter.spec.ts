// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  attachLayoutMarkers,
  layoutNeedsReconcile,
  MARKER_SIDEBAR,
  normalizeDesktopPlatform,
  reconcileWindowChromeLayout,
  resolveLayoutFrame,
  resolveLayoutTargets,
  resolveSidebarColumn,
} from '../src/renderer/desktop/window-chrome.ts'

function mountHarnessShell(): HTMLElement {
  document.body.replaceChildren()
  const root = document.createElement('div')
  root.id = 'harness-root'
  root.innerHTML = `
    <div>
      <div class="sidebar-col"></div>
      <div class="center-col">
        <header>
          <div class="title-row">
            <div class="title-cluster"><button type="button">Title</button></div>
            <div class="header-utilities"><button type="button">Session Log</button></div>
          </div>
        </header>
      </div>
      <div class="details-col"></div>
      <div data-shell-overlay></div>
    </div>
  `
  document.body.append(root)
  return root
}

describe('Electron window chrome adapter', () => {
  it('normalizes desktop platforms', () => {
    expect(normalizeDesktopPlatform('darwin')).toBe('darwin')
    expect(normalizeDesktopPlatform('win32')).toBe('win32')
    expect(normalizeDesktopPlatform('linux')).toBe('linux')
    expect(normalizeDesktopPlatform('freebsd')).toBe('linux')
  })

  it('resolves the sidebar from the AppFrame overlay anchor', () => {
    const root = mountHarnessShell()
    const frame = resolveLayoutFrame(root)
    expect(frame).not.toBeNull()
    expect(resolveSidebarColumn(frame!)).toBe(root.querySelector('.sidebar-col'))
  })

  it('marks only the sidebar seam and skips duplicate mutation', () => {
    const root = mountHarnessShell()
    const targets = resolveLayoutTargets(root)
    expect(targets).not.toBeNull()
    expect(attachLayoutMarkers(targets!)).toBe(true)
    expect(targets!.sidebar.hasAttribute(MARKER_SIDEBAR)).toBe(true)
    expect(root.querySelectorAll('[data-dsh-electron-sidebar]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-dsh-electron-drag-region]')).toHaveLength(0)
    expect(attachLayoutMarkers(targets!)).toBe(false)
    expect(layoutNeedsReconcile(root)).toBe(false)
  })

  it('reconciles newly mounted layout nodes', () => {
    const root = mountHarnessShell()
    expect(reconcileWindowChromeLayout(root)).toBe(true)
    expect(reconcileWindowChromeLayout(root)).toBe(false)
  })

})
