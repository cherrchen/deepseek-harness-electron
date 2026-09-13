# Agent Note: Electron remounts Plugin Manager and composes Git through sidebarRight

Status: implemented

English | [中文](2026-09-13-electron-plugin-manager-and-git-sidebar.zh.md)

## Problem

The 0.1.5-rc.2 pin left Plugin Manager and Git uncomposed because Git occupied the removed Client `details` slot ([Details unmount](2026-09-13-electron-unmount-details-host.md), [Git unmount](2026-09-13-electron-unmount-git-plugin.md)). `settings.plugins.tab` still exists, so the Installed tab could remount without Details Host. Git needed a Sidebar port before it could return to `dshElectron.ecosystemPlugins`.

## Decision

`apps/electron/runtime/host.patch.yml` inserts `@dsh-electron/dsh-electron-ui-plugin-manager`. Details Host stays unmounted.

`packages/dsh-electron/dsh-plugin-git` tracks `cherrchen/dsh-plugin-git` branch `chore/0.1.5-adapt`. That client injects `sidebarRight` / `sidebarRightTabs` and has no runtime dependency on `details`, `shellDetails`, or `@dsh-electron/dsh-client-ui-details-host`. Desktop lists `@dsh-electron/dsh-plugin-git` in `dshElectron.ecosystemPlugins` and keeps it as a production `workspace:` dependency. Host and Client aggregates include `packages/dsh-electron/**` again.

## Alternatives considered

**Remount Details Host so the previous Git client could load.** Rejected because upstream still has no `details` slot.

**Remount Plugin Manager while leaving Git uncomposed after the Sidebar port landed.** Rejected because the port is details-free and `sync-version` can keep the production dependency.

**Delete the Details Host tree.** Rejected because subtree identity remains useful while the slot is absent.

## Consequences

Desktop Settings shows the Installed tab. Git UI lives in the right sidebar. Overlay tests require Plugin Manager in the bootstrap patch and still forbid Details Host there. Git remains absent from `host.patch.yml` because ecosystem composition uses the generated include file. DSH documentation gates skip `packages/dsh-electron/dsh-plugin-git/` because that subtree owns its own bilingual docs and `docs:check`.
