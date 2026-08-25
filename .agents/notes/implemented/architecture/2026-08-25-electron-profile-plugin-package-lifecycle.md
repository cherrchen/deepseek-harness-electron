# Agent Note: Electron profile plugin package lifecycle

Status: implemented

English | [中文](2026-08-25-electron-profile-plugin-package-lifecycle.zh.md)

## Problem

Profile package installation alone left Desktop unable to check for compatible updates, refresh Git or local sources, repair incomplete dependencies, or remove packages safely. Treating a bundle's startup activation mechanism as current restart state also made every healthy bundle appear permanently unapplied. Updating or deleting an active runtime plugin in place could replace files while Host still executed them, while ordinary disable could not provide temporary quiescence because it persists the user's disabled preference.

## Decision

`PluginLifecycleEntry` separates `activationMode` from `health`. `activationMode` describes `hot`, `profile-restart`, or no activation; `health` reports whether installed entries are healthy or require reconciliation. Main also supplies `packageActions`, so the Renderer never infers update or removal authority from source, ownership, or kind.

System and distribution-bundled packages have no package actions. Registry-owned direct profile dependencies support explicit update checks, range-respecting update, reinstall, and removal. Git and local `file:` dependencies refresh from their recorded `requestedSpec`. Healthy `link:` dependencies use runtime reload; incomplete links can be repaired. Unknown direct profile dependencies allow removal but no source operation. CLI-installed profile dependencies follow the same package policy, while `profileManaged` continues to decide whether an ordinary runtime dependency joins Desktop hot lifecycle.

All package commands remain closed tagged values created by Main and execute through `dsh plugin --profile web`; the Renderer receives no pnpm arguments or generic subprocess access. Registry and Git update use `update <name>`, copied local refresh and reinstall use `add <requestedSpec> --force`, removal uses `remove <name>`, and update checking uses `outdated --format json`. Registry results preserve both `wanted` and `latest`; ordinary update follows the existing dependency range and does not opt into a new major version. Upstream dsh remains responsible for profile initialization and bundle reconciliation.

`PluginMutationCoordinator` serializes package and runtime operations and exposes its current descriptor through lifecycle snapshots. Before update, reinstall, or removal, `PluginLifecycleController` temporarily removes an active hot plugin from runtime composition and waits for Host absence without editing `plugin-state.json`. A successful runtime-to-runtime mutation activates the newly inspected package. Runtime-to-bundle and bundle transitions remain unloaded until restart. Bundle-to-runtime never hot-loads because the running Host still contains the startup bundle composition.

Reactivation assigns the installed Host entry a Main-generated file-URL revision. Without that request change, Node's ESM cache would execute the previous module after package files changed. Lifecycle settlement follows the stable nested loader entry id in addition to its revisioned module request.

Package recovery compares the dependency manifest, pnpm lockfile, and installed package manifest captured before the command. An unchanged failure restores the prior runtime when it was active. Any captured disk change leaves the plugin unloaded and reports `profile-changed`; Desktop does not execute a possibly partial artifact. Successful removal clears both `profileManaged` and `disabled` membership.

`PluginRestartTracker` captures profile packages before Host starts and keeps bundle composition differences in Main memory. Bundle install, update, reinstall, removal, and kind transitions appear in `pendingRestart`; removal remains as a tombstone after its catalog row disappears. Same-version source refresh remains pending because package version does not identify source content. Installing then removing a bundle absent from the startup baseline cancels the change. A new Desktop process captures a new baseline, so no persisted state version is required.

The Installed view checks updates only on user request. It promotes an available Registry update to a primary row action, keeps other package actions in an overflow menu, confirms removal, and renders pending restart changes in a dedicated banner. A healthy bundle displays Installed unless the tracker records a change after Host startup. Desktop does not restart Host automatically.

## Alternatives considered

**Create update and removal services beside the install service.** Rejected because every operation shares the same catalog authority, package command adapter, runtime quiescence, recovery classification, and mutation coordinator.

**Run pnpm directly from Electron.** Rejected because Electron would duplicate upstream bundle reconciliation and could diverge from CLI-managed profiles.

**Persist restart-required flags in `plugin-state.json`.** Rejected because restart state belongs to the current Host composition and would become stale after crashes or a successful process restart.

**Use ordinary disable before package mutation.** Rejected because disable records a durable user preference, while package replacement needs temporary runtime quiescence only.

**Restore runtime after every package-manager failure.** Rejected because a failed command may have changed dependency or installed package files; executing that artifact is unsafe.

**Check registries automatically when Settings opens.** Rejected because it adds view latency, network traffic, and private-registry authentication failures without user intent.

## Consequences

Desktop provides one profile package lifecycle for GUI- and CLI-installed dependencies without expanding Renderer privilege. Runtime code is absent before its package files change, and recovery states state whether runtime was restored or the disk profile changed. Bundle restart status reflects only differences from the running Host baseline and survives removal rows without adding durable state.

Package rollback is deliberately limited: Desktop restores runtime only when captured profile and installed-manifest state is unchanged. It does not retain historical package versions or automatically reverse a partially successful pnpm transaction. Update All, background checks, major-version selection, and automatic Host restart remain outside this decision.
