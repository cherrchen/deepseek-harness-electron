# Agent Note: Electron-owned renderer with Main Harness compatibility proxy

Status: implemented

English | [中文](2026-08-21-electron-standalone-renderer.zh.md)

## Problem

The desktop shell previously loaded the supervised `dsh web` readiness URL (`http://127.0.0.1:<port>`) directly into `BrowserWindow`. That made the Host HTML document, Vite assets, and localhost transport the page origin, so the Electron app remained a thin container around the Web composition rather than owning its renderer process boundary.

## Decision

[`apps/electron`](../../../../apps/electron) owns a standalone renderer built from `@deepseek-ai/dsh-client-web`, served over the privileged custom scheme `dsh-electron://localhost/`. Electron Main still supervises `dsh web` on a loopback port for Milestone 1 compatibility, but that URL is private to Main. The renderer obtains Host bootstrap through typed preload IPC, loads plugin classic scripts and unary `/api` traffic through the custom-scheme protocol proxy, and carries `/api/events.mux` / `/api/events.host` through a MessagePort WebSocket stand-in that Main bridges onto real Host WebSockets.

The renderer hostname stays `localhost` so upstream client loopback gates (`isLoopbackHostname`) continue to treat the desktop page as local without changing `packages/`. Security stays `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, with `window.deepseekDesktop` as the only bridge (no generic `invoke`).

This decision updates the window-loading half of [the loopback shell note](2026-08-14-electron-loopback-shell.md): Harness supervision and `$DSH_HOME` remain; BrowserWindow no longer navigates to the Harness HTTP origin. Desktop OS capability ownership (directory picker, clipboard, shell, notifications, updater bridge, theme, window controls) is recorded in [the desktop capability note](2026-08-21-electron-desktop-capability-ownership.md).

## Alternatives considered

**Keep loading the Harness readiness URL.** Preserves today's boot injection, but fails the Milestone 1 acceptance that BrowserWindow must not be a Web page container and that renderer DevTools must not talk to `127.0.0.1` directly.

**SSE WebSocket stand-in over custom-scheme fetch.** Network GET `/api/events.*` returns HTTP 426; SSE exists only on the in-process `toFetchHandler` carrier. Milestone 1 keeps the spawned Host process, so Main must open real WebSockets.

**Change upstream connection/web packages for a native Electron transport.** Correct long-term (Milestone 2), but expands the downstream fork surface beyond `apps/electron/**`.

**Use `dsh-electron://app/` as the origin.** Breaks upstream loopback hostname checks without package changes.

## Consequences

Packaged and development Electron builds must emit `dist/renderer` alongside `lib/` and include the renderer artifacts in `electron-builder` files. Runtime still requires a ready Harness process for bootstrap extraction, `/plugins`, and `/api`. Windows packaged smoke evidence is expected from desktop CI while macOS packaged smoke is verified locally.
