# Agent Note: Electron unmounts Details Host for the 0.1.5-rc.2 pin

Status: implemented

English | [中文](2026-09-13-electron-unmount-details-host.zh.md)

## Problem

Upstream `dsh-v0.1.5-rc.2` removed the Client `details` slot. `@dsh-electron/dsh-client-ui-details-host` still registers that slot, and the directory picker optionally injected `ctx.shellDetails`. Mounting Details Host would fail Host load.

## Decision

`apps/electron/runtime/host.patch.yml` mounts desktop-capabilities, Theme Studio, the Electron directory-flow client, desktop brand, the Electron Plugin Manager, and the `cordis:include` seat. It does not mount `@dsh-electron/dsh-client-ui-details-host`.

Details Host remains under `runtime/plugins/` and is still discovered, built, and linked. Directory picker does not inject `shellDetails` or list Details Host in `dsh.client.inject`. Plugin Manager remount is owned by [the composition note](2026-09-13-electron-plugin-manager-and-git-sidebar.md).

Reintroduction of Details Host requires a Client occupancy slot (Sidebar or a restored Details column) and a consumer.

## Alternatives considered

**Keep Details Host mounted with no consumer.** Rejected because the plugin still registers `details`, which upstream no longer declares.

**Port Git to Sidebar in order to keep Details Host.** Rejected for Details Host: Git now occupies `sidebarRight` without this plugin ([composition note](2026-09-13-electron-plugin-manager-and-git-sidebar.md)).

**Delete the Details Host tree.** Rejected because subtree identity and later composition still need the source.

**Leave the directory picker's optional `shellDetails` inject.** Rejected because it would keep a Client inject edge onto an unmounted plugin.

## Consequences

Desktop starts without the third-column details host. Overlay tests pin absence of `@dsh-electron/dsh-client-ui-details-host` from the rendered bootstrap patch.
