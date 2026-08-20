# Agent Note: Electron-owned desktop capabilities via typed Main bridge

Status: implemented

English | [中文](2026-08-21-electron-desktop-capability-ownership.zh.md)

## Problem

After the [standalone Electron renderer](2026-08-21-electron-standalone-renderer.md) cut, BrowserWindow no longer loads the Harness HTTP origin, but OS desktop capabilities remained split: directory picking went through Host `directory-picker-auto` (native/Koffi on Windows), clipboard through `navigator.clipboard`, path opens through `host.openPath`, and only updater/tray/window chrome already lived in Electron Main. That split kept Windows dependent on a Host native picker worker, blurred the Main vs Host crash domain, and left no single typed preload surface for desktop intent.

## Decision

Every OS desktop capability used by the Electron shell is owned by Electron Main and exposed only through the closed `window.deepseekDesktop` bridge (no generic `invoke`, no renderer Node or Electron APIs). DSH Host remains a separate supervised process for Agent, Session, Tool, Model, Workspace, Storage, and plugin backend work. Electron launches Host with an [`apps/electron/runtime`](../../../../apps/electron/runtime) cordis `--patch` overlay that disables Host `directory-picker-auto`, keeps `@deepseek-ai/dsh-host-directory-picker-browse` so `ctx.directoryPicker` still satisfies apiproxy inject (without mounting the browse client), and mounts `@deepseek-ai/dsh-electron-ui-directory-picker` (linked into `$DSH_HOME/profiles/node_modules` before spawn) whose directory-flow occupants call `dialog.pickDirectory()` on the bridge (Main uses `dialog.showOpenDialog`).

Clipboard writes that still call `navigator.clipboard` in upstream UI are redirected by a narrow renderer shim under `apps/electron/src/renderer/` until an upstream injection seam exists. Shell external URLs use an allowlist (`https:`, `http:`, `mailto:`). Updater, theme, and window controls are reachable from the bridge while `quitAndInstall` and Host process lifecycle stay in Main. In-app file path opens may still use Host `host.openPath` until an upstream opener seam exists; desktop-owned callers use `desktop.shell.*`.

Main talks to Host through a `HarnessTransport` interface whose first implementation is `HttpHarnessTransport` wrapping the existing loopback proxy. Removing HTTP entirely is deferred; the renderer never learns the Host URL.

Fork surface stays in `apps/electron/**` plus this Agent Note. Do not modify `packages/`, `vendor/`, or `apps/web/` for these capabilities.

## Alternatives considered

**Keep Host native directory picker and only patch Windows to browse.** Rejected because browse is not the OS chooser Electron already owns, and non-Windows still couples desktop picking to Host plugins.

**Embed DSH Host inside Electron Main.** Rejected because Host/tool crashes must not take down the desktop GUI process; the [loopback shell](2026-08-14-electron-loopback-shell.md) process split remains.

**Change upstream connection/clipboard/picker packages for native Electron seams.** Rejected for this milestone because it expands the downstream fork beyond `apps/electron/**`.

**Eliminate loopback HTTP in the same change.** Rejected as Milestone 3 scope; `HarnessTransport` keeps the renderer decoupled while HTTP remains Main-private.

## Consequences

Packaged builds must include `runtime/**` (Host patch template and the Electron directory-picker plugin `lib/`). The `build:directory-picker` step emits the ModuleLoader client artifact before packaging. Focused `apps/electron` tests cover allowlists, dialog mapping, overlay path substitution, updater/theme snapshots, and the closed channel set. Chromium clipboard-write permission remains as a temporary fallback beside the navigator shim. Product UI theme stays upstream; only `nativeTheme` is bridged.
