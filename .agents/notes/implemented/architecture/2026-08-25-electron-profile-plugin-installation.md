# Agent Note: Electron profile plugin installation

Status: implemented

English | [中文](2026-08-25-electron-profile-plugin-installation.zh.md)

## Problem

The Electron Plugin Manager could control only the distribution-owned plugin inventory assembled at application startup. Installing a package into the `web` profile did not add it to that inventory, so an installation dialog alone could not connect a new ordinary plugin to enable, disable, reload, Host truth, or client refresh behavior. Packaged Desktop users also could not rely on a global Node.js or pnpm installation.

## Decision

Electron exposes profile plugin installation as a typed Desktop capability while preserving the upstream profile and bundle model described by [profile plugin bundles](2026-08-05-profile-plugin-bundles.md).

`ProfilePluginCatalog` is the current inventory authority. Each read merges required Electron runtime plugins, bundled ecosystem plugins, and direct dependencies installed in `$DSH_HOME/profiles/web`, with system and bundled entries taking precedence by real package name. Catalog entries separate ownership, package kind, installation source, activation behavior, and optional Host runtime state. Ordinary runtime plugins use hot activation, reconciled `dsh.bundle` packages require the next profile start, and packages without a runtime declaration remain visible as plain dependencies without lifecycle controls. A direct dependency left outside Desktop management or carrying an unloadable declared entry remains visible as an incomplete installation rather than disappearing from the catalog or entering the startup roster.

`plugin-state.json` version 2 preserves the disabled runtime package names and records which direct profile dependencies belong to Desktop management. Version 1 migrates without losing its disabled set. Dependency specs remain authoritative in the profile `package.json`; Electron does not copy them into its state file.

The Renderer sends one of three closed requests: registry package plus optional version, Git repository plus optional ref, or absolute local path plus `file`/`link` mode. Electron Main validates and normalizes the request to one pnpm-compatible spec. The Renderer receives no filesystem, child-process, shell-command, or pnpm argument interface.

`PluginPackageService` invokes the upstream `dsh plugin --profile web add <spec>` interface. It does not run `pnpm add` directly, because the upstream command owns profile initialization and `dsh.profile.bundles` reconciliation. Electron inspects the real dependency name and installed manifest written by pnpm before updating Desktop state or choosing activation behavior; user input is never treated as installed package identity. Registry requests without a version normalize to `@latest`, so pnpm replaces an existing Git or local source. A repeated Git or local request identifies the installed package through the unchanged dependency spec.

Upstream bundle reconciliation uses `inspectBundlePackage` before adding a direct dependency to `dsh.profile.bundles`. The relative patch must parse, and every Host or `dsh.client` package export declared by the manifest must exist. Invalid source packages remain direct dependencies but cannot enter the next profile composition. Electron validates the installed Host and client targets of ordinary runtime plugins as well as bundle entries before reporting success; an invalid package remains incomplete and cannot enter `plugins.cordis.yml`.

Distribution-owned package names are reserved because a direct profile dependency wins bare-package resolution and could shadow required application code. Registry conflicts fail before pnpm runs. Git and local sources reveal their real package name only after installation, so Electron removes a newly added conflicting dependency before reporting the conflict; a failed removal is reported as a residual profile change.

Packaged Electron carries pnpm at the repository package-manager version. Main writes a platform-specific `pnpm`/`pnpm.cmd` shim below `$DSH_HOME/electron/bin` that launches the packaged Electron executable in Node mode with the bundled pnpm entrypoint, then prepends that directory to the child PATH. Upstream dsh continues to call `pnpm` through its existing interface, while Desktop installation remains independent of global Node.js, Corepack, pnpm, and the user's PATH ordering.

`PluginMutationCoordinator` serializes install, enable, disable, and reload operations under one Main-owned queue. A successful ordinary plugin installation is persisted before hot activation and enters the same generated `plugins.cordis.yml`, Host inventory polling, rollback, and client-bearing Renderer refresh path as a bundled ecosystem plugin. If activation fails, the package and its Desktop-managed membership remain installed and the error states that activation failed; Electron does not claim an installation rollback that did not occur. A failed pnpm command is also compared against the pre-command dependency snapshot: when package metadata changed before failure, the error carries that fact, the Installed view refreshes, and the residual dependency appears as incomplete. Bundle installation does not rewrite the runtime include or restart Host, and the UI reports the restart requirement.

The Installed view owns the three-source dialog. It uses the existing native directory picker for local repositories, disables duplicate submission while Main is mutating, shows the third-party-code trust warning, keeps stable error categories with expandable technical details, and refreshes the existing catalog after settlement. No profile selector, marketplace, update, removal, automatic Host restart, credential UI, or plugin sandbox is part of this decision.

## Alternatives considered

**Create an Electron-only plugin directory and dependency resolver.** Rejected because it would form a second plugin ecosystem with different installation, bundle, resolution, and lifecycle semantics from DSH profiles.

**Run `pnpm add` directly from Electron.** Rejected because Electron would have to duplicate upstream bundle inspection and `dsh.profile.bundles` reconciliation, and the two implementations could disagree after package updates.

**Require users to install pnpm globally or use Corepack.** Rejected because packaged Desktop installation must work in a clean user environment and must use a package-manager version controlled by the application distribution.

**Treat every installed package as a hot-loadable Cordis plugin.** Rejected because bundles join profile composition only at profile start, while plain dependencies may expose no Cordis entrypoint. Presenting lifecycle controls for either class would misstate runtime behavior.

**Restart Host automatically after installing a bundle.** Rejected because restarting the active profile interrupts broader session and agent state. Installation reports the boundary and leaves restart ownership to a later graceful-restart design.

**Use separate mutation queues for installation and runtime lifecycle.** Rejected because both paths can rewrite Desktop state and the generated runtime roster; Renderer button state is not concurrency protection.

## Consequences

Profile package installation and runtime lifecycle share one refreshable catalog and one mutation authority. The bundled Git plugin retains bundled ownership and hot lifecycle behavior, while a same-named profile dependency cannot create a duplicate card.

The installation path executes third-party package and plugin code with Harness process permissions, outside the agent sandbox. The UI states this explicitly. Install-time build scripts may still require pnpm `allowBuilds`; Main names the packages from pnpm's blocked-build diagnostic without assuming the requested plugin owns the script, and retains the upstream details.

Focused Electron coverage pins state migration, catalog precedence and classification, registry/Git/local normalization including Windows paths, packaged pnpm shim generation, install-state reconciliation, activation dispatch, capability forwarding, dialog behavior, and the existing hot-plug regression path.
