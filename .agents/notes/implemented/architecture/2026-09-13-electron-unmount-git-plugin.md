# Agent Note: Electron unmounts Git for the 0.1.5-rc.2 pin

Status: implemented

English | [中文](2026-09-13-electron-unmount-git-plugin.zh.md)

## Problem

`@dsh-electron/dsh-plugin-git` occupies `ctx.shellDetails` and the Client `details` slot. Upstream `dsh-v0.1.5-rc.2` removed that slot. Declaring Git in `dshElectron.ecosystemPlugins` therefore fails Client typecheck and Host load even when the package remains in the workspace.

## Decision

Desktop does not compose Git. `apps/electron/package.json` keeps `dshElectron.ecosystemPlugins` as `[]`. `sync-version` therefore drops `@dsh-electron/dsh-plugin-git` from Electron production dependencies.

The package remains a workspace member at `packages/dsh-electron/dsh-plugin-git` for subtree maintenance. Host and Client aggregates exclude `packages/dsh-electron/**` so repository `tsc` does not typecheck the uncomposed Client against the removed slot.

Reintroduction is a later change: port the Client to `ctx.sidebarRight` / `sidebarRightTabs`, then put the package name back in `dshElectron.ecosystemPlugins`. This pin does not perform that port.

Hot-plug and packaging still treat `ecosystemPlugins` as the composition list; an empty list is valid. Fixture tests may still use the Git package name as a dummy roster entry.

## Alternatives considered

**Port Git to Sidebar in the same pin.** Rejected because the requested product change is to stop composing Git, not to replace Details with Sidebar.

**Keep Git composed and fork a private `details` slot.** Rejected because the upstream Client no longer has that slot, and a private fork would fight the pin.

**Delete `packages/dsh-electron/dsh-plugin-git`.** Rejected because subtree identity and later Sidebar work still need the tree.

**Leave Git sources in the host/client aggregates.** Rejected because uncomposed Client sources that reference `details` fail `pnpm run build`.

## Consequences

Desktop starts without Git UI. Users who need repository controls must wait for a Sidebar port or install the plugin separately against a host that still provides Details.

`requiredDesktopWorkspaceDependencies()` keeps only declared ecosystem names; the empty list is not a packaging bug. Focused Electron tests pin absence from discovery and allow an empty `ecosystemPlugins` array.
