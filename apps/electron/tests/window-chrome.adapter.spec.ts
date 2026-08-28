// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  attachLayoutMarkers,
  layoutNeedsReconcile,
  MARKER_CENTER,
  MARKER_MAIN_HEADER,
  MARKER_SIDEBAR,
  normalizeDesktopPlatform,
  reconcileWindowChromeLayout,
  resolveLayoutFrame,
  resolveLayoutTargets,
  resolveCenterColumn,
  resolveMainHeader,
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
    expect(resolveCenterColumn(frame!)).toBe(root.querySelector('.center-col'))
    expect(resolveMainHeader(root.querySelector('.center-col')!)).toBe(root.querySelector('header'))
  })

  it('marks the existing sidebar, center, and conversation header nodes', () => {
    const root = mountHarnessShell()
    const targets = resolveLayoutTargets(root)
    expect(targets).not.toBeNull()
    expect(attachLayoutMarkers(targets!)).toBe(true)
    expect(targets!.sidebar.hasAttribute(MARKER_SIDEBAR)).toBe(true)
    expect(targets!.center.hasAttribute(MARKER_CENTER)).toBe(true)
    expect(targets!.mainHeader.hasAttribute(MARKER_MAIN_HEADER)).toBe(true)
    expect(root.querySelectorAll('[data-dsh-electron-sidebar]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-dsh-electron-center]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-dsh-electron-main-header]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-dsh-electron-drag-region]')).toHaveLength(0)
    expect(attachLayoutMarkers(targets!)).toBe(false)
    expect(layoutNeedsReconcile(root)).toBe(false)
  })

  it('reconciles newly mounted layout nodes', () => {
    const root = mountHarnessShell()
    expect(reconcileWindowChromeLayout(root)).toBe(true)
    expect(reconcileWindowChromeLayout(root)).toBe(false)
  })

  it('moves the header marker when a visible session header replaces the blank one', () => {
    const root = mountHarnessShell()
    const hidden = root.querySelector('header')!
    hidden.setAttribute('aria-hidden', 'true')
    expect(reconcileWindowChromeLayout(root)).toBe(true)

    const visible = document.createElement('header')
    root.querySelector('.center-col')!.append(visible)
    expect(layoutNeedsReconcile(root)).toBe(true)
    expect(reconcileWindowChromeLayout(root)).toBe(true)
    expect(visible.hasAttribute(MARKER_MAIN_HEADER)).toBe(true)
  })

})
