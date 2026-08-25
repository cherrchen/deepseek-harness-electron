# Electron Plugin Lifecycle

English | [中文](plugin-lifecycle.zh.md)

> Status: **Current downstream reference**
>
> Scope: `apps/electron/**`, `apps/electron/runtime/**`
>
> Audience: maintainers, coding agents, reviewers, and future contributors

## Purpose

This reference describes the Desktop plugin catalog, profile installation path, and runtime lifecycle.

Electron owns desired plugin state. DSH Host owns actual Cordis fiber state. The runtime lifecycle path bridges those two facts without restarting Electron Main or the supervised `dsh web` process.

## Managed plugin classes

`ProfilePluginCatalog` refreshes and merges three ownership classes:

* **System runtime plugins** under `runtime/plugins/` are linked before Host start and are not user-manageable.
* **Bundled ecosystem plugins** declared by `dshElectron.ecosystemPlugins` are linked before Host start, are user-manageable, and are composed through a generated include file.
* **Profile packages** are direct dependencies in `$DSH_HOME/profiles/web/package.json` installed through Desktop or declared as profile bundles.

Linking is not the enable-state signal. Electron keeps bundled artifacts available under both `$DSH_HOME/profiles/node_modules` and `$DSH_HOME/electron/node_modules`; runtime enablement is controlled only by generated Cordis composition.

System and bundled ownership takes precedence over profile ownership for a duplicate real package name. Each entry separates ownership, package kind (`runtime-plugin`, `bundle`, or `dependency`), installation source, and activation behavior. Host runtime state is present only for runtime plugins.

## Runtime-owned files

Electron writes these files below `$DSH_HOME/electron/`:

* `plugins.cordis.yml` is the generated desired roster for manageable ecosystem plugins.
* `plugin-state.json` stores the persisted disabled runtime package names and Desktop-managed profile dependency membership.

Electron also writes `electron-host.patch.yml` into Electron `userData` and passes it to `dsh web --patch`.

The bootstrap patch keeps required runtime plugin rows, enables narrow HMR for `plugins.cordis.yml`, and mounts one stable `cordis:include` seat for that generated file. Individual ecosystem plugins are not listed in the bootstrap overlay. Details Host is a required row: it must stay out of `dshElectron.ecosystemPlugins`.

## Startup sequence

Electron Main starts Host in this order:

1. resolve `DSH_HOME`;
2. discover distribution plugins and refresh the `web` profile catalog;
3. repair all required symlinks;
4. load `plugin-state.json`;
5. generate the initial `plugins.cordis.yml`;
6. render `electron-host.patch.yml`;
7. spawn `dsh web --patch <electron-host.patch.yml>`.

Startup and later lifecycle mutations both act on the same generated `plugins.cordis.yml` path.

## Runtime operations

`PluginMutationCoordinator` serializes install, enable, disable, and reload in Electron Main. Each operation can change profile state or regenerate the complete effective roster, so different commands do not receive separate queues.

`list()` bypasses the mutation queue and reads current Host inventory concurrently. Renderer polling can therefore observe transition phases while a mutation settles. During that interval `desiredEnabled` remains the last successfully persisted state; the renderer combines Host runtime state with its current operation record instead of treating desired state as a progress signal.

Operations mutate desired state by rewriting `plugins.cordis.yml`, then poll the existing Host `pluginInventory.list()` Remote truth until the target settles:

* **enable** waits until the package appears and its fiber phase is `active`;
* **disable** waits until the package is absent from inventory;
* **reload** removes the package, waits absent, restores it, then waits active.

If settlement fails, Electron restores the previous generated roster before surfacing the failure. The controller also waits one HMR quiet window between consecutive mutations so a second generated-file write does not land inside the watcher debounce window of the prior change.

## Desktop management view

The preload lifecycle group is adapted through `@dsh-electron/dsh-electron-desktop-capabilities` into `ctx.desktop.plugins`. Desktop feature plugins do not read `window.deepseekDesktop.plugins` directly.

`@dsh-electron/dsh-electron-ui-plugin-manager` registers the `installed` contribution at order `20` in the upstream-owned `settings.plugins.tab` slot. The upstream Plugins section continues to own navigation, tab chrome, selection, keyboard behavior, and mount lifecycle; Electron does not register another `settings.section`.

The Installed tab reads its first catalog snapshot only after mount. It shows manageable plugins, bundles, and plain dependencies in the main list and required runtime plugins in a collapsed, read-only System Components disclosure. Search filters package name, display name, and description locally.

## Profile package installation

The Installed header opens one dialog with Registry, GitHub/Git, and Local sources. Local installation uses the native Electron directory picker and supports `file:` or development `link:` semantics. The Renderer sends a typed request and never receives filesystem, child-process, shell-command, or arbitrary pnpm access.

Electron Main validates the request, converts it to one pnpm-compatible spec, and invokes `dsh plugin --profile web add <spec>`. Upstream dsh remains responsible for profile initialization and bundle reconciliation. The installed dependency name and manifest, not the request text, determine catalog identity and package kind.

Packaged Desktop includes pnpm at the repository package-manager version. A generated platform shim under `$DSH_HOME/electron/bin` launches bundled pnpm through Electron's Node mode, and Main prepends that directory to the child PATH. Users do not need global Node.js, Corepack, or pnpm.

An ordinary runtime plugin enters `plugins.cordis.yml` and hot-activates through the existing lifecycle controller. A client-bearing plugin refreshes the Renderer after Host settlement. A bundle remains outside the runtime include and reports **Restart required**; a plain dependency reports **Installed as dependency** and exposes no lifecycle controls. Electron does not restart Host automatically.

Installation executes third-party package and plugin code with Harness process permissions, outside the agent sandbox. The dialog warns users to install only trusted packages. Stable error categories distinguish invalid requests, missing packages or paths, Git failures, blocked install-time build scripts, profile reconciliation, and activation failure while preserving technical details.

During one enable, disable, or reload command, the view polls `list()` at a short interval and disables mutation buttons for every plugin. Search, scrolling, and the System Components disclosure remain usable. The view stops polling when the command settles, reads one final snapshot, and replaces local lifecycle state with Main and Host truth. A failed command reports the operation and rollback without rendering the raw rejection to the user.

## Renderer refresh boundary

Electron refreshes the BrowserWindow only after Host settle, and only for manageable plugins whose distribution artifact has a client half (`hasClient === true`).

Host-only plugins do not reload the Renderer.

The refresh boundary is deliberate:

* Host plugin lifecycle remains a true Cordis hot plug.
* Renderer plugin graph reconciliation is still a full-page reload, owned by Electron.
* Electron does not attempt client-side hot reconciliation of the upstream module graph.

## State-file behavior

`plugin-state.json` stores a versioned current-format object:

```json
{
  "version": 2,
  "disabled": ["@dsh-electron/dsh-plugin-git"],
  "profileManaged": ["@example/dsh-plugin-example"]
}
```

Behavior rules:

* a missing file means empty `disabled` and `profileManaged` sets;
* version 1 migrates to version 2 without losing disabled names;
* invalid JSON logs a warning and falls back without crashing startup;
* duplicate names are deduplicated;
* stale disabled and profile-managed names are dropped on reconciliation.

## Nested include limitation

The generated `plugins.cordis.yml` lives under `$DSH_HOME/electron/`, and a nested `cordis:include` resolves bare package names from that directory.

For that reason Electron keeps bundled plugin links under `$DSH_HOME/electron/node_modules` in addition to the existing profile fallback under `$DSH_HOME/profiles/node_modules`.

If upstream later adds a native runtime-composition API that preserves package resolution across nested includes, this extra link surface may be removed.

## Verification

Focused `apps/electron` coverage verifies:

* runtime overlay rendering and placeholder replacement;
* plugin-state migration, parsing, persistence, and stale-name reconciliation;
* catalog precedence and runtime-plugin/bundle/dependency classification;
* Registry, Git, and local request normalization across POSIX and Windows paths;
* bundled pnpm shim generation and install-service reconciliation;
* deterministic runtime config generation;
* lifecycle-controller success, rollback, serialized mutations, concurrent reads, and client-refresh branching;
* lazy `ctx.desktop.plugins` forwarding and Plugin Manager slot redeclaration;
* install-dialog source switching, native directory selection, pending state, success and failure, plus lifecycle mutation polling and global locking;
* real Host disable/enable/reload with stable PID through a fixture plugin and the bundled Git plugin;
* Details Host idle boot against the current SlotRegistry, dummy-surface takeover of `details`, close restoring the upstream occupant, and host unload/reload.
