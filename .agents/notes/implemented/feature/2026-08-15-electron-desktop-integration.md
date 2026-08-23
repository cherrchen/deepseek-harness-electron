# Agent Note: Electron owns desktop integration

Status: implemented

English | [中文](2026-08-15-electron-desktop-integration.zh.md)

## Problem

The Electron wrapper displayed the upstream Web UI inside a default browser window. Its operating-system chrome crowded the page, closing the window terminated the supervised Harness process, Chromium's denied clipboard-write permission made upstream copy controls fail, and the wrapper had no desktop context menu, About window, or update lifecycle. Implementing those behaviors in upstream client packages would couple the synchronized source tree to one downstream host.

## Decision

`apps/electron` owns desktop-only window chrome, lifecycle, permissions, menus, application metadata, and update behavior. The upstream Web composition remains unchanged and sandboxed.

The main window reserves a 40-pixel strip above the page as the renderer's only drag region. Page content and full-viewport overlays never receive drag-region markers, so controls and modal masks keep their pointer behavior. macOS uses a hidden title bar with positioned traffic lights; Windows and Linux use the Window Controls Overlay. A close event hides the main window unless an explicit quit or update installation is in progress. The tray retains the application, reopens the window, and provides the only ordinary quit action; a single-instance lock makes another launch reveal the existing window.

The default session admits `clipboard-sanitized-write` only when both the requesting origin and `WebContents` belong to the active loopback Harness window. Native context menus use Chromium edit flags rather than renderer IPC. The About document is a sandboxed data URL with a restrictive Content Security Policy, and only the repository URL parsed from `package.json` may open externally.

`electron-updater` checks the GitHub provider on startup and through application and tray menus, downloads automatically, and installs only after the supervised Harness process stops. `--allow-prerelease-updates` controls GitHub pre-release admission. The release workflow publishes builder metadata and blockmaps with the installers; its merge step combines independently built x64 and ARM64 metadata before creating the release.

## Alternatives considered

- **Modify upstream Web UI packages** — would place Electron layout, permissions, and lifecycle behavior in synchronized source that must also serve ordinary browsers.
- **Expose a preload bridge for every desktop action** — adds a renderer API and IPC validation for operations Electron already supplies through native roles, session permissions, and main-process events.
- **Quit when the last window closes** — preserves the former lifecycle but cannot support background tasks or an explicit tray-controlled exit.
- **Publish one architecture's updater metadata** — makes release discovery select the wrong installer or omit the other architecture; merged file lists let `electron-updater` choose artifacts whose names contain the running architecture.

## Consequences

Desktop behavior remains isolated from upstream packages, and renderer privileges stay limited to the one clipboard write permission needed by existing copy controls. Closing a window no longer implies process exit, so crash handling, explicit quit, and update installation must all coordinate supervised-process shutdown. Release publication installs workspace dependencies in its publish job to merge YAML metadata. Unsigned CI packages demonstrate update metadata and discovery, but macOS installation still requires distribution signing.
