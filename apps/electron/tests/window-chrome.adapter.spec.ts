// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  attachLayoutMarkers,
  layoutNeedsReconcile,
  MARKER_DRAG_REGION,
  MARKER_HEADER_UTILITIES,
  MARKER_MAIN_HEADER,
  MARKER_SIDEBAR,
  normalizeDesktopPlatform,
  reconcileWindowChromeLayout,
  resolveCenterColumn,
  resolveHeaderUtilities,
  resolveLayoutFrame,
  resolveLayoutTargets,
  resolveMainHeader,
  resolveSidebarColumn,
} from '../src/renderer/desktop/window-chrome.ts'

function mountHarnessShell(options?: { collapsed?: boolean; hiddenHeader?: boolean }): HTMLElement {
  document.body.replaceChildren()
  const root = document.createElement('div')
  root.id = 'harness-root'
  const collapsedAttr = options?.collapsed === true ? ' data-sidebar-collapsed' : ''
  root.innerHTML = `
    <div${collapsedAttr}>
      <div class="sidebar-col"></div>
      <div class="center-col">
        <header${options?.hiddenHeader === true ? ' aria-hidden="true"' : ''}>
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

  it('resolves layout targets from the AppFrame overlay anchor', () => {
    const root = mountHarnessShell()
    const frame = resolveLayoutFrame(root)
    expect(frame).not.toBeNull()
    expect(resolveSidebarColumn(frame!)).toBe(root.querySelector('.sidebar-col'))
    expect(resolveCenterColumn(frame!)).toBe(root.querySelector('.center-col'))
    const header = resolveMainHeader(root.querySelector('.center-col')!)
    expect(header).not.toBeNull()
    expect(resolveHeaderUtilities(header!)).toBe(root.querySelector('.header-utilities'))
  })

  it('attaches markers once and skips duplicate mutation', () => {
    const root = mountHarnessShell()
    const targets = resolveLayoutTargets(root)
    expect(targets).not.toBeNull()
    expect(attachLayoutMarkers(targets!)).toBe(true)
    expect(targets!.sidebar.hasAttribute(MARKER_SIDEBAR)).toBe(true)
    expect(targets!.mainHeader.hasAttribute(MARKER_MAIN_HEADER)).toBe(true)
    expect(targets!.mainHeader.hasAttribute(MARKER_DRAG_REGION)).toBe(true)
    expect(targets!.headerUtilities?.hasAttribute(MARKER_HEADER_UTILITIES)).toBe(true)
    expect(attachLayoutMarkers(targets!)).toBe(false)
    expect(layoutNeedsReconcile(root)).toBe(false)
  })

  it('reconciles newly mounted layout nodes', () => {
    const root = mountHarnessShell()
    expect(reconcileWindowChromeLayout(root)).toBe(true)
    expect(reconcileWindowChromeLayout(root)).toBe(false)
  })

  it('prefers the visible session header over a hidden blank-session header', () => {
    const root = mountHarnessShell({ hiddenHeader: true })
    const center = root.querySelector('.center-col')!
    const visible = document.createElement('header')
    visible.innerHTML = '<div class="title-row"><div></div><div class="utilities"></div></div>'
    center.append(visible)
    expect(resolveMainHeader(center)).toBe(visible)
  })
})
