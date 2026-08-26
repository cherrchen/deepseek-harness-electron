# Electron Plugin Lifecycle

English | [中文](plugin-lifecycle.zh.md)

> Status: **Current downstream reference**
>
> Scope: `apps/electron/**`, `apps/electron/runtime/**`
>
> Audience: maintainers, coding agents, reviewers, and future contributors

## Purpose

This reference describes the Desktop plugin catalog, profile package lifecycle, and runtime lifecycle.

Electron owns desired plugin state. DSH Host owns actual Cordis fiber state. The runtime lifecycle path bridges those two facts without restarting Electron Main or the supervised `dsh web` process.

## Managed plugin classes

`ProfilePluginCatalog` refreshes and merges three ownership classes:

* **System runtime plugins** under `runtime/plugins/` are linked before Host start and are not user-manageable.
* **Bundled ecosystem plugins** declared by `dshElectron.ecosystemPlugins` are linked before Host start, are user-manageable, and are composed through a generated include file.
* **Profile packages** are direct dependencies in `$DSH_HOME/profiles/web/package.json` installed through Desktop or declared as profile bundles.

Linking is not the enable-state signal. Electron keeps bundled artifacts available under both `$DSH_HOME/profiles/node_modules` and `$DSH_HOME/electron/node_modules`; runtime enablement is controlled only by generated Cordis composition.

System and bundled ownership takes precedence over profile ownership for a duplicate real package name. Each entry separates ownership, package kind (`runtime-plugin`, `bundle`, or `dependency`), installation source, activation mode, package health, and Main-owned package actions. Host runtime state is present only for packages with hot activation.

## Runtime-owned files

Electron writes these files below `$DSH_HOME/electron/`:

* `plugins.cordis.yml` is the generated desired roster for manageable ecosystem plugins.
* `plugin-state.json` stores the persisted disabled runtime package names and Desktop-managed profile dependency membership.

Electron also writes `electron-host.patch.yml` into Electron `userData` and passes it to `dsh web --patch`.

The bootstrap patch keeps required runtime plugin rows, enables narrow HMR for `plugins.cordis.yml`, and mounts one stable `cordis:include` seat for that generated file. Individual ecosystem plugins are not listed in the bootstrap overlay. Details Host and Theme Studio are required rows: they must stay out of `dshElectron.ecosystemPlugins`.

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

`PluginMutationCoordinator` serializes install, update check, update, reinstall, remove, enable, disable, and reload in Electron Main. Each operation can read or change profile state or regenerate the complete effective roster, so different commands do not receive separate queues. `list()` reports the active Main operation while it executes.

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

Electron Main validates the request, converts it to one pnpm-compatible spec, and invokes `dsh plugin --profile web add <spec>`. A Registry request without a version uses an explicit `@latest`, so it replaces an existing Git or local spec instead of retaining that source. Upstream dsh remains responsible for profile initialization and bundle reconciliation. The installed dependency name and manifest, not the request text, determine catalog identity and package kind; unchanged Git and local specs resolve through the dependency value already written by pnpm.

Packaged Desktop includes pnpm at the repository package-manager version. A generated platform shim under `$DSH_HOME/electron/bin` launches bundled pnpm through Electron's Node mode, and Main prepends that directory to the child PATH. Users do not need global Node.js, Corepack, or pnpm.

An ordinary runtime plugin enters `plugins.cordis.yml` and hot-activates through the existing lifecycle controller. A client-bearing plugin refreshes the Renderer after Host settlement. A healthy bundle reports **Installed** because `profile-restart` is its activation mode, not evidence of an unapplied change. A plain dependency reports **Installed as dependency** and exposes no runtime lifecycle controls. Upstream reconciliation adds a bundle only when its patch parses and every declared Host or client package export exists. Electron also verifies ordinary runtime Host and client targets before activation. A direct dependency left by failed pnpm, an invalid bundle excluded from the profile stack, a missing installed package, or a runtime plugin with missing declared output remains visible as **Installation incomplete** with the package actions that can repair or remove it. Electron does not restart Host automatically.

System and bundled package names are reserved because the profile's `node_modules` tree takes precedence during Host package resolution. Registry requests for those names fail before installation. When a Git or local source resolves to a reserved name, Electron removes the newly added dependency before reporting the conflict. A conflicting dependency already present in the profile must be removed with `dsh plugin --profile web remove <package-name>` before Desktop starts.

Installation executes third-party package and plugin code with Harness process permissions, outside the agent sandbox. The dialog warns users to install only trusted packages. Stable error categories distinguish invalid requests, missing packages or paths, Git failures, blocked install-time build scripts, profile reconciliation, and activation failure while preserving technical details. A blocked-build diagnostic names the packages parsed from pnpm instead of attributing an existing dependency's script to the requested plugin. When pnpm changes profile dependencies before returning failure, the error records that fact and the Renderer refreshes the catalog without claiming rollback.

## Profile package update, repair, and removal

The Renderer requests package lifecycle operations by direct dependency name only. Main rereads the catalog entry, requested dependency spec, source, kind, ownership, health, and permitted actions; Renderer fields never authorize a mutation. System and bundled packages cannot update, reinstall, or remove. Profile Registry packages support range-respecting update checks, update, reinstall, and remove. Git and local `file:` dependencies refresh from their recorded source. A healthy local `link:` dependency uses runtime reload instead of package update; an incomplete link may be repaired. Unknown profile dependencies default to removal only.

Update checks run only when the user selects **Check for Updates**. Main invokes the bundled pnpm through `dsh plugin --profile web outdated --format json`, filters results to Registry-owned direct dependencies, and keeps `wanted` distinct from `latest`. Registry and Git update invoke `dsh plugin --profile web update <name>`; the Registry dependency range therefore selects the target without opting into a new major version. Copied local packages and explicit reinstall invoke `add <requestedSpec> --force`, while remove invokes `remove <name>` through the same upstream interface. Upstream dsh remains the sole owner of `dsh.profile.bundles` reconciliation.

Before update, reinstall, or removal changes package files, `PluginLifecycleController.quiesceForPackageMutation()` removes an active hot plugin from the generated roster and waits until Host inventory reports it absent. This temporary quiescence does not edit the persisted disabled preference. If the package command fails without changing the dependency manifest, lockfile, or installed package manifest, the controller restores the prior runtime. If any captured disk state changes, Electron leaves the plugin unloaded, refreshes the catalog, and reports `profile-changed`; it does not execute a possibly partial artifact. Successful removal deletes the package name from both `profileManaged` and `disabled`.

Package kind is inspected again after every successful update or reinstall. A managed runtime package hot-activates unless its startup kind was a bundle. A transition from a running bundle never hot-loads the new runtime entry because the Host still contains the startup bundle composition. Any transition into or out of a bundle instead creates a pending restart change.

Runtime reactivation uses a Main-generated revision query on the package's Host entry. Removing and restoring the same bare package request would otherwise reuse Node's cached ESM module and execute the previous package version. Host settlement matches the stable nested loader entry id as well as the module request, so cache-busted requests still project onto the canonical package name.

`PluginRestartTracker` captures the profile package baseline before Host starts and keeps pending bundle install, update, reinstall, and removal changes in Electron Main memory. It retains removal tombstones after catalog rows disappear and treats same-version source refresh as a change. Installing and then removing a bundle absent from the baseline cancels the pending change. A new Main process captures a new baseline, so pending restart state clears after Desktop restart without changing `plugin-state.json` version 2.

During one mutation, the view polls `list()` at a short interval and disables conflicting actions for every plugin. Search, scrolling, and the System Components disclosure remain usable. The view stops polling when the command settles, reads one final snapshot, and replaces local lifecycle state with Main and Host truth. Package actions live in an overflow menu except for an available Registry update, which becomes a primary row action. Removal requires confirmation. Pending bundle changes appear in a banner even when removal has deleted the package row. A failed runtime command reports the operation and rollback without rendering the raw rejection to the user; package failures show their stable recovery outcome.

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
* bundled pnpm shim generation, update-result parsing, install-service reconciliation, and package mutation recovery;
* deterministic runtime config generation;
* lifecycle-controller success, rollback, serialized mutations, concurrent reads, and client-refresh branching;
* lazy `ctx.desktop.plugins` forwarding and Plugin Manager slot redeclaration;
* install-dialog source switching, native directory selection, update checks and badges, package menus, removal confirmation, pending restart tombstones, mutation polling, and global locking;
* real Host disable/enable/reload with stable PID through a fixture plugin and the bundled Git plugin;
* real Host local-package v1 refresh to v2 and removal with stable PID, plus pinned-pnpm copied-source refresh through paths containing spaces;
* Details Host idle boot against the current SlotRegistry, dummy-surface takeover of `details`, close restoring the upstream occupant, and host unload/reload.
