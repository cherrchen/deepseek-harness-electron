# Agent Note: Electron-required portable UI infrastructure

Status: implemented

English | [中文](2026-08-24-electron-required-portable-ui-infrastructure.zh.md)

## Problem

AppFrame's `details` column is a single slot occupied by the upstream DetailsPanel. Desktop needs a shared details host that other client plugins can occupy without stealing the column at boot, without user-disableable ecosystem membership, and without an Electron-only overlay. The package must remain a public portable DSH plugin whose canonical source is not the Electron monorepo.

## Decision

`@dsh-electron/dsh-client-ui-details-host` is Electron-required portable DSH UI infrastructure.

Canonical source is `cherrchen/dsh-client-ui-details-host`. `apps/electron/runtime/plugins/ui-details-host` is a git subtree mirror. Edit the standalone repository, then `git subtree pull`; do not patch the mirror as the source of truth. Electron rebuilds Host and Client artifacts from the subtree source. Standalone `lib/` is the public npm artifact, not the Electron load source.

The package is a required `runtime/host.patch.yml` mount and is not a member of `dshElectron.ecosystemPlugins`. Discovery still reports `source: desktop-runtime`, `required: true`, `manageable: false`.

`ctx.shellDetails` is a Cordis service. Boot registers the service and does not register a `details` occupant. `open(id)` registers DetailsHost at `DETAILS_HOST_PRIORITY` (`-1`, lower than the upstream default of `0`), declares `shell.details.surface`, requires that id to exist, then calls `ctx.layout.openDetails()`. A missing id disposes takeover and throws so the third column never shows empty. Switching ids keeps DetailsHost mounted. `close()` is idempotent: `layout.closeDetails()`, clear `activeId`, dispose takeover, restore the upstream occupant. Active surface unload, surface crash, session switch, and host unload also close.

This category is the exception to putting every portable public plugin under `packages/dsh-electron/`: Desktop always mounts it, rebuilds it with the runtime plugin builder, and still forbids Electron, `ctx.desktop`, and preload imports. User-disableable product features stay in the ecosystem island ([public namespace](2026-08-23-public-dsh-ecosystem-plugin-namespace.md)).

## Alternatives considered

**Occupy `details` as soon as the package loads.** Rejected because boot would steal or blank the third column whenever no surface is open.

**Ship it as an ecosystem plugin under `packages/dsh-electron/`.** Rejected because users could disable required UI infrastructure through Plugin Manager.

**Develop in the Electron mirror and copy back.** Rejected because two trees would compete as source of truth.

**DOM query, React portal, CSS overlay, or editing upstream DetailsPanel / `ui-layout` / `ui-conversation`.** Rejected because single-slot shadowing and registration disposal already restore the previous winner.

**Control details-column geometry from Details Host.** Rejected because `ctx.layout.openDetails()` / `closeDetails()` already own panel width and animation.

## Consequences

Loading Details Host at Electron boot MUST leave the upstream DetailsPanel as the `details` winner. `open` / `close` MUST be real slot shadowing. Git is not a Details Host consumer in this change.

Standalone package tests pin the public controller with dummy `test.alpha` / `test.beta` surfaces. Electron tests pin the same takeover against the workspace SlotRegistry, required-vs-ecosystem classification, and bootstrap overlay membership. Coverage does not include a headed Electron window visual check of the idle third column.
