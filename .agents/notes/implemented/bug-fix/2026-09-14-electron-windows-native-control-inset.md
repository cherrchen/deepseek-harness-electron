# Agent Note: Windows native-control inset for the tabbed client UI

Status: implemented

English | [中文](2026-09-14-electron-windows-native-control-inset.zh.md)

## Problem

The tabbed client UI draws pane tab strips and a 76-pixel conversation header across the window's top edge. Windows places the native Window Controls Overlay — minimize, maximize, and close, about 138 × 40 CSS pixels — over the top-right corner of that same band, so the right panel's tab strip and the header's right-hand controls land under the system buttons (issue #93).

An inset inside the conversation header clears that one header and nothing else: a pane tab strip is not the conversation header, so every further surface on the window's top edge needs its own reserved width.

## Decision

The columns right of the sidebar keep the native-control row free on Windows and Linux, exactly as the macOS sidebar keeps the traffic-light row free. [`window-chrome.css`](../../../../apps/electron/src/renderer/desktop/window-chrome.css) holds `--dsh-content-top-inset`, which is `0px` by default and `--dsh-native-control-row-height` (40px) on the center and right panel columns under `win32` and `linux`.

The center column takes the inset as `padding-top` with `box-sizing: border-box`, so its in-flow header and conversation move below the row and the column stays inside its grid row. The right panel column holds only the absolutely positioned panel, which ignores that padding, so the panel's `[data-sidebar-right-panel='push']` box takes the inset as its own `top`.

Both columns render a `::before` drag strip of the inset's height over the freed band, so the band stays blank, drags the window, and takes no pointer events from the columns. The blank-session center column extends that strip by one native-control row to keep covering the row its hidden header occupies. Open modal dialogs suspend the strip with the page's other drag regions.

The [`window-chrome.ts`](../../../../apps/electron/src/renderer/desktop/window-chrome.ts) adapter marks the right panel column `data-dsh-electron-rightbar` — the third structural child of the AppFrame, resolved beside the sidebar, center, and conversation-header markers — so the CSS addresses upstream layout through Electron-owned markers. The sidebar keeps the window's top edge, where its brand row shows the collapse control, and the fullscreen right panel stays `position: fixed; inset: 0`, covering the band as it covers every other page drag surface.

## Alternatives considered

**Keep the per-header caption inset.** The right panel's tab strip is not the conversation header, so it stays under the system buttons, and every future top-edge surface would need its own reserved width derived from the overlay geometry.

**Pad the pane tab strips instead of the columns.** The pane chrome lives in `packages/**`, which this fork synchronizes from upstream; Desktop layout stays in `apps/electron`.

**Reserve a full-width blank heading row.** [The desktop integration note](../feature/2026-08-15-electron-desktop-integration.md) rejected a visually independent heading and a product UI pulled away from the window edge; the Windows inset keeps the sidebar's brand row at that edge instead.

## Consequences

Columns right of the sidebar lose 40 pixels of height on Windows and Linux, and gain a blank draggable band where the system buttons sit. The sidebar keeps its full height. macOS is unaffected: its inset stays `0px`, the drag strip collapses to nothing, and the panel keeps the `top` its own stylesheet declares.

The panel rule keys off the shared `data-sidebar-right-panel='push'` attribute, so a client that drops that attribute paints the panel over the band again. This is a named coverage gap: the adapter specs observe Electron's own markers only, and the focused CSS checks pin the inset, not the panel selector's continued existence. Windows acceptance — no pane tab, header control, or panel chrome under the system buttons, and the band dragging the window — needs a hand check on a Windows host.
