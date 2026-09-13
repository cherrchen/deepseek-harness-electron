# Agent Note: Electron plugin pending markers, profile lock, and startup recovery

Status: implemented

English | [中文](2026-09-13-electron-plugin-pending-and-recovery.zh.md)

## Problem

Desktop package mutations ran only in one Electron process. `PluginRestartTracker` was memory-only and `PluginMutationCoordinator` was in-process. A crash during `dsh plugin` left the web profile half-changed with no disk marker, so the next instance started Host on unrepaired state. When Host failed to become ready, Main showed `dialog.showErrorBox` and quit. The main window loads `dsh-client-web` from that Host, so a dead Host left the user no repair UI.

## Decision

Main owns desired plugin state. Before spawning `dsh plugin`, `PluginPackageService` writes `$DSH_HOME/electron/packages-pending` and takes `$DSH_HOME/profiles/web/lock` with `openSync(..., 'wx')`. The lock owner is the Main PID, then the child PID for the duration of that subprocess, then Main again. A new instance waits while `process.kill(pid, 0)` reports a live owner, recycles the file after ESRCH, and times out into recovery instead of starting Host.

Startup reconcile is read-only: parse profile dependencies, repair hot-plugin symlinks, relist the catalog, then clear the marker. It does not roll back disk. The lock only serializes Desktop processes; a manual `dsh plugin --profile web` is outside it.

When pending reconcile fails, the Host ready line times out, or the profile catalog cannot be read, Main opens a bilingual `data:text/html` recovery window with no Host and no `dsh-client-web`. The user may disable every manageable plugin (system/required rows stay composed) or clear `profileManaged`/`disabled` without deleting profile dependencies. Other startup failures still use the error box.

Crash-injection hooks abort after pending write, after the command, after inspect, or before clearing the marker so tests leave residue without killing Electron.

The command runner registers error and close handlers before handing the spawned PID to the lock owner. Spawn errors reject only after close. If owner handoff throws, Main kills the child and waits for close before rejecting, so transaction cleanup cannot race the owned child. Returning immediately after a callback failure would leave the package process running after lock release. Command-runner tests cover event ordering and a real missing executable; these failures do not produce Session events or alter GUI presentation.

## Alternatives considered

**Throw when the lock owner is alive, as Desktop project-manager does.** Rejected because an orphan pnpm child is a live owner the next instance must wait for.

**Staging, journal, or rollback of pnpm disk state.** Rejected because Desktop does not own a second package manager; reconcile repairs links and catalog facts only.

**Host a recovery UI inside the main BrowserWindow.** Rejected because that window loads supervised Host content.

## Consequences

Install and mutatePackage share one pending/lock transaction. Focused Electron tests inject crashes, wait on a live PID, recycle a dead PID, and drive the recovery window through a fake `createWindow` without GUI. Manual `dsh plugin` residue still needs startup reconcile or Repair.
