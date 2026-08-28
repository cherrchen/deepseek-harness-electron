# Agent Note: Package the Web composition through a supervised loopback process

Status: implemented

English | [中文](2026-08-14-electron-loopback-shell.zh.md)

## Problem

The desktop distribution must preserve the upstream Web frontend, RPC routes, plugin roster, profile initialization, and persistence semantics while remaining easy to merge with upstream. Reimplementing these responsibilities in Electron would create a second application composition and make each upstream change a manual port.

## Decision

[`apps/electron`](../../../../apps/electron) is a private workspace application that supervises the built `dsh web` entry in Electron's Node-compatible child mode. It enables Node internals required by the upstream config watcher, requests port zero, and waits for the upstream readiness line. The child receives `<user home>/.dsh` as `DSH_HOME`, matching the CLI default on every operating system, while Electron retains its platform-specific `userData` directory for Chromium and desktop-owned state. The child's initial workspace is the current user's home directory.

BrowserWindow loading is owned by [the standalone renderer note](2026-08-21-electron-standalone-renderer.md): the window loads `dsh-electron://localhost/` and Main proxies Host HTTP/WebSocket traffic. This note still owns Harness supervision, tray, updater, and packaging policy.

The renderer uses context isolation and Chromium sandboxing without Node integration. New HTTP and HTTPS windows are handed to the system browser. Electron terminates the child before it exits and reports startup or unexpected child failures through a native error dialog.

The package-level `productName` supplies `DeepSeek Harness` to Electron and `electron-builder`. Windows packages use the assisted NSIS installer and let users select the installation directory; the release matrix passes the same settings explicitly for both Windows architectures. The system tray loads packaged transparent glyphs: macOS receives a Template Image, while Windows and Linux select black or white artwork from `nativeTheme` and refresh it after a theme change.

The updater preserves the repository's `electron-dsh-v<version>` release tags. It selects the stable-only or inclusive prerelease stream from GitHub Release metadata, points `electron-updater` at the selected release's update files, and leaves metadata validation, semantic-version comparison, download, and installation to that library. The prerelease stream is the desktop default; the selected stream persists as desktop-owned state below Electron `userData`. Complete failures remain in the main-process log, while native dialogs expose only short recovery guidance.

The application package depends on the upstream CLI workspace and explicitly supplies every workspace peer found by traversing the CLI production graph. [`sync-version.mjs`](../../../../apps/electron/scripts/sync-version.mjs) regenerates that root peer set after an upstream merge because `electron-builder` does not auto-install workspace peers while collecting a pnpm application. The application adds no Electron-specific code to upstream packages. `electron-builder` packages the built dependency closure without asar and emits native installer formats from the same application manifest. Real package directories are required because the upstream profile bootstrap creates filesystem symlinks from its user-data module fallback into the installed dependency graph; an external symlink cannot traverse Electron's virtual asar filesystem.

Focused tests pin the executable path and readiness parser. Desktop CI additionally builds the complete upstream application and packages each operating-system target, which exercises the actual production dependency closure.

## Alternatives considered

**Load `apps/web/dist` through `file://` and add an IPC transport.** This matches the upstream documentation's future Electron transport, but the current client connection, plugin bundle loading, and host APIs use the Web server. Implementing IPC would change multiple upstream packages and expand the merge-conflict surface before that transport exists upstream.

**Open the system browser after starting `dsh web`.** This preserves the server but does not produce a desktop application or installable native window.

**Bundle a separately copied Web application and server.** Copies would drift from the upstream workspace graph and turn routine upstream releases into manual reconciliation.

**Use the one-click NSIS installer.** It reduces installation to one action but removes the ordinary destination-selection step. The assisted installer keeps the installation location under user control.

**Rename release tags to satisfy the updater's GitHub feed parser.** The tags are shared release automation input and remain stable. Release metadata identifies the channel without imposing a second version parser or changing the public tag format.

## Consequences

The desktop application inherits upstream Web behavior and updates through ordinary Git merges with a small downstream-only overlay. The local HTTP listener remains an additional process and transport hop; it is constrained to a random loopback port and the existing upstream host checks.

Harness configuration and runtime data share the CLI's `~/.dsh` convention instead of following Electron's application-data location. Desktop preferences and Chromium caches remain separate from Harness state.

The release packages include Electron and the upstream production dependency closure, so they are larger than the browser distribution. The Windows installer requires users to proceed through an installation wizard and may install to their selected directory. Native dependencies must be compatible with Electron's Node ABI, and cross-platform packaging CI is the release evidence for that compatibility.
