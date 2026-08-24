# Electron Plugin Lifecycle

English | [中文](plugin-lifecycle.zh.md)

> Status: **Current downstream reference**
>
> Scope: `apps/electron/**`, `apps/electron/runtime/**`
>
> Audience: maintainers, coding agents, reviewers, and future contributors

## Purpose

This document describes the shipped runtime lifecycle for Electron-bundled ecosystem plugins.

Electron owns desired plugin state. DSH Host owns actual Cordis fiber state. The runtime lifecycle path bridges those two facts without restarting Electron Main or the supervised `dsh web` process.

## Managed plugin classes

Electron discovers two bundled plugin classes through `apps/electron/src/runtime-plugins.ts`:

* **Required runtime plugins** under `runtime/plugins/` (Desktop adapters, Electron carriers, and Electron-required portable UI infrastructure) are linked before Host start and are not user-manageable at runtime. Discovery still labels them `source: desktop-runtime`.
* **Bundled ecosystem plugins** are linked before Host start, are user-manageable at runtime, and are composed through a generated include file.

Linking is not the enable-state signal. Electron keeps bundled artifacts available under both `$DSH_HOME/profiles/node_modules` and `$DSH_HOME/electron/node_modules`; runtime enablement is controlled only by generated Cordis composition.

Each lifecycle entry also carries the package `version` and optional `description` read from the bundled npm `package.json`. Electron does not maintain a separate plugin metadata format.

## Runtime-owned files

Electron writes these files below `$DSH_HOME/electron/`:

* `plugins.cordis.yml` is the generated desired roster for manageable ecosystem plugins.
* `plugin-state.json` stores only the persisted disabled package-name set.

Electron also writes `electron-host.patch.yml` into Electron `userData` and passes it to `dsh web --patch`.

The bootstrap patch keeps required runtime plugin rows, enables narrow HMR for `plugins.cordis.yml`, and mounts one stable `cordis:include` seat for that generated file. Individual ecosystem plugins are not listed in the bootstrap overlay. Details Host is a required row: it must stay out of `dshElectron.ecosystemPlugins`.

## Startup sequence

Electron Main starts Host in this order:

1. resolve `DSH_HOME`;
2. discover bundled runtime and ecosystem plugin artifacts;
3. repair all required symlinks;
4. load `plugin-state.json`;
5. generate the initial `plugins.cordis.yml`;
6. render `electron-host.patch.yml`;
7. spawn `dsh web --patch <electron-host.patch.yml>`.

Startup and later lifecycle mutations both act on the same generated `plugins.cordis.yml` path.

## Runtime operations

`PluginLifecycleController` serializes `enable(name)`, `disable(name)`, and `reload(name)` on one global mutation queue. Each mutation can regenerate and apply the complete effective roster, so different plugin names do not receive separate queues.

`list()` bypasses the mutation queue and reads current Host inventory concurrently. Renderer polling can therefore observe transition phases while a mutation settles. During that interval `desiredEnabled` remains the last successfully persisted state; the renderer combines Host runtime state with its current operation record instead of treating desired state as a progress signal.

Operations mutate desired state by rewriting `plugins.cordis.yml`, then poll the existing Host `pluginInventory.list()` Remote truth until the target settles:

* **enable** waits until the package appears and its fiber phase is `active`;
* **disable** waits until the package is absent from inventory;
* **reload** removes the package, waits absent, restores it, then waits active.

If settlement fails, Electron restores the previous generated roster before surfacing the failure. The controller also waits one HMR quiet window between consecutive mutations so a second generated-file write does not land inside the watcher debounce window of the prior change.

## Desktop management view

The preload lifecycle group is adapted through `@dsh-electron/dsh-electron-desktop-capabilities` into `ctx.desktop.plugins`. Desktop feature plugins do not read `window.deepseekDesktop.plugins` directly.

`@dsh-electron/dsh-electron-ui-plugin-manager` registers the `installed` contribution at order `20` in the upstream-owned `settings.plugins.tab` slot. The upstream Plugins section continues to own navigation, tab chrome, selection, keyboard behavior, and mount lifecycle; Electron does not register another `settings.section`.

The Installed tab reads its first lifecycle snapshot only after mount. It shows manageable ecosystem plugins in the main list and required runtime plugins in a collapsed, read-only System Components disclosure. Search filters package name, display name, and description locally.

During one enable, disable, or reload command, the view polls `list()` at a short interval and disables mutation buttons for every plugin. Search, scrolling, and the System Components disclosure remain usable. The view stops polling when the command settles, reads one final snapshot, and replaces local lifecycle state with Main and Host truth. A failed command reports the operation and rollback without rendering the raw rejection to the user.

## Renderer refresh boundary

Electron refreshes the BrowserWindow only after Host settle, and only for manageable plugins whose distribution artifact has a client half (`hasClient === true`).

Host-only plugins do not reload the Renderer.

The refresh boundary is deliberate:

* Host plugin lifecycle remains a true Cordis hot plug.
* Renderer plugin graph reconciliation is still a full-page reload, owned by Electron.
* Electron does not attempt client-side hot reconciliation of the upstream module graph.

## State-file behavior

`plugin-state.json` stores a single current-format object:

```json
{
  "version": 1,
  "disabled": ["@dsh-electron/dsh-plugin-git"]
}
```

Behavior rules:

* a missing file means `disabled: []`;
* invalid JSON logs a warning and falls back without crashing startup;
* duplicate names are deduplicated;
* stale names are dropped on the next successful write.

## Nested include limitation

The generated `plugins.cordis.yml` lives under `$DSH_HOME/electron/`, and a nested `cordis:include` resolves bare package names from that directory.

For that reason Electron keeps bundled plugin links under `$DSH_HOME/electron/node_modules` in addition to the existing profile fallback under `$DSH_HOME/profiles/node_modules`.

If upstream later adds a native runtime-composition API that preserves package resolution across nested includes, this extra link surface may be removed.

## Verification

Focused `apps/electron` coverage verifies:

* runtime overlay rendering and placeholder replacement;
* plugin-state parsing and persistence behavior;
* deterministic runtime config generation;
* lifecycle-controller success, rollback, serialized mutations, concurrent reads, and client-refresh branching;
* lazy `ctx.desktop.plugins` forwarding and Plugin Manager slot redeclaration;
* mutation polling, cleanup, final reconciliation, actions, global locking, local search, and read-only system components;
* real Host disable/enable/reload with stable PID through a fixture plugin and the bundled Git plugin;
* Details Host idle boot against the current SlotRegistry, dummy-surface takeover of `details`, close restoring the upstream occupant, and host unload/reload.
