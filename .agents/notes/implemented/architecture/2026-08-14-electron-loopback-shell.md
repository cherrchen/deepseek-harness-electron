# Agent Note: Package the Web composition through a supervised loopback process

Status: implemented

English | [中文](2026-08-14-electron-loopback-shell.zh.md)

## Problem

The desktop distribution must preserve the upstream Web frontend, RPC routes, plugin roster, profile initialization, and persistence semantics while remaining easy to merge with upstream. Reimplementing these responsibilities in Electron would create a second application composition and make each upstream change a manual port.

## Decision

[`apps/electron`](../../../../apps/electron) is a private workspace application that supervises the built `dsh web` entry in Electron's Node-compatible child mode. It enables Node internals required by the upstream config watcher, requests port zero, waits for the upstream readiness line, and loads the reported `127.0.0.1` URL. The child receives an application-specific `DSH_HOME`, while its initial workspace is the current user's home directory.

The renderer uses context isolation and Chromium sandboxing without Node integration or permission grants. Navigation stays on the ready URL's origin; new HTTP and HTTPS windows are handed to the system browser. Electron terminates the child before it exits and reports startup or unexpected child failures through a native error dialog.

The application package depends on the upstream CLI workspace and explicitly supplies every workspace peer found by traversing the CLI production graph. [`sync-version.mjs`](../../../../apps/electron/scripts/sync-version.mjs) regenerates that root peer set after an upstream merge because `electron-builder` does not auto-install workspace peers while collecting a pnpm application. The application adds no Electron-specific code to upstream packages. `electron-builder` packages the built dependency closure without asar and emits native installer formats from the same application manifest. Real package directories are required because the upstream profile bootstrap creates filesystem symlinks from its user-data module fallback into the installed dependency graph; an external symlink cannot traverse Electron's virtual asar filesystem.

Focused tests pin the executable path and readiness parser. Desktop CI additionally builds the complete upstream application and packages each operating-system target, which exercises the actual production dependency closure.

## Alternatives considered

**Load `apps/web/dist` through `file://` and add an IPC transport.** This matches the upstream documentation's future Electron transport, but the current client connection, plugin bundle loading, and host APIs use the Web server. Implementing IPC would change multiple upstream packages and expand the merge-conflict surface before that transport exists upstream.

**Open the system browser after starting `dsh web`.** This preserves the server but does not produce a desktop application or installable native window.

**Bundle a separately copied Web application and server.** Copies would drift from the upstream workspace graph and turn routine upstream releases into manual reconciliation.

## Consequences

The desktop application inherits upstream Web behavior and updates through ordinary Git merges with a small downstream-only overlay. The local HTTP listener remains an additional process and transport hop; it is constrained to a random loopback port and the existing upstream host checks.

The release packages include Electron and the upstream production dependency closure, so they are larger than the browser distribution. Native dependencies must be compatible with Electron's Node ABI, and cross-platform packaging CI is the release evidence for that compatibility.
