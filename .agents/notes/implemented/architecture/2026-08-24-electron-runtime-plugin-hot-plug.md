# Agent Note: Electron-owned runtime plugin hot plug

Status: implemented

English | [中文](2026-08-24-electron-runtime-plugin-hot-plug.zh.md)

## Problem

Electron previously launched Host with a static `apps/electron/runtime/host.patch.yml` overlay that always mounted bundled ecosystem plugins such as `@dsh-electron/dsh-plugin-git`. A user could not disable, re-enable, or reload a bundled plugin without restarting the supervised `dsh web` process, and Electron had no durable desired-state owner for plugin lifecycle intent.

## Decision

Electron Main owns desired runtime state for bundled ecosystem plugins.

`apps/electron/src/runtime-plugins.ts` still discovers and validates every bundled plugin artifact and still links them all before Host start, but now classifies them into:

* required desktop runtime adapters, which remain non-manageable; and
* manageable bundled ecosystem plugins, whose runtime presence is controlled by generated Cordis composition.

Electron writes `plugin-state.json` and `plugins.cordis.yml` below `$DSH_HOME/electron/`. `plugin-state.json` stores only the persisted disabled package-name set. `plugins.cordis.yml` is the generated desired roster for manageable ecosystem plugins, using package names as stable entry ids and preserving the packaged ecosystem order.

Host bootstrap now comes from a runtime-rendered `electron-host.patch.yml`. That overlay keeps desktop-required infrastructure rows, enables narrow HMR rooted only at `plugins.cordis.yml`, and mounts one stable `cordis:include` seat for the generated roster. Static ecosystem rows no longer live in the bootstrap overlay.

Electron applies runtime changes through `PluginLifecycleController`, which serializes `list()`, `enable(name)`, `disable(name)`, and `reload(name)`. The controller rewrites `plugins.cordis.yml`, then polls the existing Host `pluginInventory.list()` Remote truth until the target package is absent or `active`. On failure it restores the previous generated roster before reporting the error. The controller also waits one HMR quiet window between consecutive generated-file writes so a follow-up mutation does not land inside the prior watcher's debounce window.

The generated include file is nested under `$DSH_HOME/electron/`, and nested `cordis:include` resolves bare package names from that directory. Electron therefore keeps bundled plugin symlinks under `$DSH_HOME/electron/node_modules` in addition to the existing `$DSH_HOME/profiles/node_modules` fallback. Runtime enablement is still owned by generated composition; the extra link location only preserves package resolution for the nested include subtree.

Renderer refresh stays an Electron-owned boundary. After Host settle, Electron reloads BrowserWindow only when the managed plugin's artifact has a client half (`hasClient === true`). Host-only plugins hot-plug through Cordis lifecycle alone; Electron does not attempt client-graph reconciliation inside the running page.

## Alternatives considered

**Keep ecosystem rows in the static bootstrap patch and treat symlink presence as enable state.** Rejected because linking is a distribution concern, not runtime intent; using symlink presence as state would couple lifecycle control to filesystem repair.

**Restart the supervised Host process for plugin lifecycle changes.** Rejected because the requirement is true Cordis hot plug on the Host side, not a process-level restart disguised as reload.

**Push runtime composition ownership into upstream packages before proving the downstream path.** Rejected because this milestone fits downstream-owned surfaces, and the downstream implementation demonstrates the exact upstream limitation that still matters: nested include package resolution needs the extra `$DSH_HOME/electron/node_modules` link surface.

**Hot-reconcile the Renderer module graph for every client plugin change.** Rejected because the upstream client graph still expects a fresh bootstrap path; Electron-owned full-page reload is the narrower shipped boundary.

## Consequences

Electron runtime lifecycle now has one desired-state owner and one runtime truth source. Startup and later lifecycle mutations both operate on the same generated `plugins.cordis.yml` path, so the first Host mount and later runtime changes stay aligned.

The shipped behavior is pinned by focused `apps/electron` coverage for overlay rendering, plugin-state parsing, deterministic runtime config generation, lifecycle-controller rollback and serialization, bridge exposure, and real Host disable/enable/reload with stable PID through both a fixture plugin and the bundled Git plugin.

If upstream later ships a native runtime-composition API or client-graph reconciliation path that preserves package resolution through nested includes, Electron can replace the generated-file backend and remove the extra `electron/node_modules` link surface without changing the public desktop bridge semantics.
