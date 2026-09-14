# Agent Note: Electron does not compose a Details-based Git client

Status: implemented

English | [中文](2026-09-13-electron-unmount-git-plugin.zh.md)

## Problem

A Git client that occupies `ctx.shellDetails` and the Client `details` slot cannot load on upstream `dsh-v0.1.5-rc.2`, which removed that slot. Declaring such a client in `dshElectron.ecosystemPlugins` fails Client typecheck and Host load.

## Decision

Desktop does not compose a Details-based Git client. The Sidebar port is the composed Git client ([composition note](2026-09-13-electron-plugin-manager-and-git-sidebar.md)).

Forking a private `details` slot, or keeping Details-based sources in the host/client aggregates, remains rejected.

## Alternatives considered

**Keep a Details-based Git client composed and fork a private `details` slot.** Rejected because the upstream Client no longer has that slot, and a private fork would fight the pin.

**Delete `packages/dsh-electron/dsh-plugin-git`.** Rejected while the Sidebar port still depended on that source tree. The published package later made the [npm-only distribution](2026-09-14-electron-npm-only-ecosystem-plugins.md) possible.

**Leave Details-based Git sources in the host/client aggregates.** Rejected because Client sources that reference `details` fail `pnpm run build`.

## Consequences

Git UI that depends on Details Host is unavailable. Repository controls go through `ctx.sidebarRight`. Overlay tests still forbid `@dsh-electron/dsh-plugin-git` in `host.patch.yml` because ecosystem composition uses the generated include file.
