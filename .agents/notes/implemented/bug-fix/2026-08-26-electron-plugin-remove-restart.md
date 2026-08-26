# Agent Note: Electron plugin remove restart without soft-refresh crash

Status: implemented

English | [中文](2026-08-26-electron-plugin-remove-restart.zh.md)

## Problem

Removing an externally installed client-bearing Bundle deleted its package files and then soft-refreshed the Renderer while Host still held the startup Bundle composition. The reload attempted `/plugins/<name>/client.js` against missing files and failed plugin bootstrap with a full-screen load error instead of the same success-plus-restart path used after Bundle install.

## Decision

Package removal soft-refreshes the Renderer only for hot-activated packages. `profile-restart` removals update disk state, record a pending restart tombstone, and leave Host composition untouched until Desktop relaunches. The Installed tab mirrors install UX: removal that requires restart shows a success dialog, and both that dialog and the pending-restart banner expose **Restart Now** through `ctx.desktop.app.relaunch()`, which drains Host then calls Electron `app.relaunch()` / `app.exit(0)`.

## Alternatives considered

**Keep soft-refresh after every client-bearing removal.** Rejected because Host still serves startup Bundle client modules until process restart; refreshing after file deletion is the crash.

**Ask users to quit manually without a relaunch API.** Rejected because install and remove both already instruct a restart; a Main-owned relaunch is the same path updater install uses to drain Host first.

## Consequences

Bundle removal no longer collapses Desktop into the failed-plugin screen. Pending composition still requires relaunch; Desktop does not hot-unload startup Bundles. See [profile package lifecycle](2026-08-25-electron-profile-plugin-package-lifecycle.md) for the broader mutation and restart-tracker rules.

## Required verification

- Unit: Bundle remove skips `refreshAfterPackageRemoval`; hot runtime remove still refreshes.
- UI: remove success dialog and install/banner **Restart Now** invoke `app.relaunch`.
- Manual: install Bundle → relaunch → remove Bundle → success + banner → Restart Now recovers without the failed-plugin screen.
