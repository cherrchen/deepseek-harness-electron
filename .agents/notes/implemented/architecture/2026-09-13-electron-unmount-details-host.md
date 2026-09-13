# Agent Note: Electron unmounts Details Host and Plugin Manager for the 0.1.5-rc.2 pin

Status: implemented

English | [中文](2026-09-13-electron-unmount-details-host.zh.md)

## Problem

Upstream `dsh-v0.1.5-rc.2` removed the Client `details` slot. `@dsh-electron/dsh-client-ui-details-host` still registers that slot, and the directory picker optionally injected `ctx.shellDetails`. Git, the only product consumer, is already uncomposed ([Git unmount](2026-09-13-electron-unmount-git-plugin.md)). Mounting Details Host would fail Host load. The Electron Plugin Manager UI also sits on a lifecycle path this pin keeps on Electron Main rather than mixing with upstream Desktop install models.

## Decision

`apps/electron/runtime/host.patch.yml` mounts desktop-capabilities, Theme Studio, the Electron directory-flow client, desktop brand, and the `cordis:include` seat. It does not mount `@dsh-electron/dsh-client-ui-details-host` or `@dsh-electron/dsh-electron-ui-plugin-manager`.

Both packages remain under `runtime/plugins/` and are still discovered, built, and linked. Directory picker no longer injects `shellDetails` or lists Details Host in `dsh.client.inject`.

Reintroduction of Details Host requires a Client occupancy slot (Sidebar or a restored Details column) and a consumer. Reintroduction of the Installed tab is a later composition choice that must not mix this pin's Main + generated-roster path with a second install model.

## Alternatives considered

**Keep Details Host mounted with no consumer.** Rejected because the plugin still registers `details`, which upstream no longer declares.

**Port Git to Sidebar in order to keep Details Host.** Rejected because Git is uncomposed for this pin.

**Delete the Details Host and Plugin Manager trees.** Rejected because subtree identity and later composition still need the sources.

**Leave the directory picker's optional `shellDetails` inject.** Rejected because it would keep a Client inject edge onto an unmounted plugin.

## Consequences

Desktop starts without the third-column details host and without the Electron Installed settings tab. Theme Studio, directory picking, and brand occupants remain. Overlay tests pin absence of the two unmounted package names from the rendered bootstrap patch.
