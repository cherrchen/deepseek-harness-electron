# Agent Note: Drop stale Electron workspace specifiers during upstream sync

Status: implemented

English | [中文](2026-08-20-drop-stale-electron-workspace-specifiers.zh.md)

## Problem

[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) merges `upstream/master` into `develop`, then [`sync-version.mjs`](../../../../apps/electron/scripts/sync-version.mjs) rewrites `apps/electron/package.json` from the merged CLI production graph. Upstream package deletions and moves remove those directories from the workspace while the Electron manifest still lists them as `workspace:^`. Synchronization kept every current name that was not in the discovered workspace set, so leftover `workspace:` specifiers were treated as desktop-owned registry dependencies. [`assertResolvedWorkspaceDependencies`](../../../../apps/electron/scripts/sync-version-dependencies.mjs) then aborted because those specifiers still used the workspace protocol, and `pnpm install` cannot fetch `workspace:` from npm. The lockfile conflict policy accepts upstream and regenerates; leftover `workspace:` specifiers still stopped the scheduled sync after that resolution.

## Decision

[`synchronizeDependencies`](../../../../apps/electron/scripts/sync-version-dependencies.mjs) retains a current specifier only when it is not a `workspace:` protocol specifier and the name is not a discovered workspace package. The generated CLI-graph peer set replaces every workspace dependency. `assertResolvedWorkspaceDependencies` still rejects a constructed map that names a missing workspace package. Operator-facing wording lives in [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md); the [loopback-shell decision](../architecture/2026-08-14-electron-loopback-shell.md) still owns why Electron lists those peers.

## Alternatives considered

**Abort the sync when a leftover `workspace:` specifier does not resolve.** That is the failure that stops the workflow. Upstream package deletions and moves are expected; the Electron manifest must follow the merged graph rather than freeze the previous peer set.

**Treat leftover `workspace:` specifiers as registry dependencies.** The `workspace:` protocol cannot be fetched from npm. `pnpm install --no-frozen-lockfile` would fail even if the assertion were removed.

**Keep leftover `workspace:` specifiers and skip the assertion.** The later install would still fail, and the Electron manifest would keep names that no longer exist in the merged workspace.

## Consequences

An upstream merge that deletes or relocates a former CLI workspace peer updates the Electron manifest and regenerates the lockfile without a manual conflict resolution. A generated peer that is missing from the merged workspace still fails loudly. Focused Electron tests pin that a leftover `workspace:` specifier absent from the workspace is dropped while `electron-updater` is retained.
