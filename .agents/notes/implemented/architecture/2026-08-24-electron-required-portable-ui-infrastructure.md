# Agent Note: Electron-required portable UI infrastructure

Status: implemented

English | [中文](2026-08-24-electron-required-portable-ui-infrastructure.zh.md)

## Problem

Desktop needs built-in Client UI that is portable — no Electron, no `ctx.desktop`, no preload imports — yet must never be user-disableable through Plugin Manager, and whose canonical source is not the Electron monorepo. Upstream DSH packages place such features under `packages/` and public plugin repositories; Desktop must rebuild them into its runtime plugin inventory without turning them into ecosystem plugins.

## Decision

`runtime/plugins/` may hold Electron-required portable DSH UI infrastructure: a `platform: web` public package whose canonical repository is separate and whose directory here is a git subtree mirror. Edit the standalone repository, then `git subtree pull`; do not patch the mirror as the source of truth. Electron rebuilds Host and Client artifacts from the subtree source; the standalone `lib/` is the public npm artifact, not the Electron load source.

The package uses only upstream DSH client services, is a required `host.patch.yml` mount when composed, and never joins `dshElectron.ecosystemPlugins`. Discovery reports `source: desktop-runtime`. Loading the package MUST NOT occupy product UI until a consumer calls the published service.

`@dsh-electron/dsh-theme-studio` is the current member: it overlays builtin color palettes through `ctx.theme.overrideTokens()` and registers Settings → General → Themes. The former Details Host member was deleted when upstream removed the Client `details` slot ([removal note](2026-09-13-electron-remove-details-host.md)).

Desktop rebuilds this category with the runtime plugin builder and still forbids Electron, `ctx.desktop`, and preload imports. User-disableable product features remain independently published npm dependencies under the [npm-only ecosystem plugin rule](2026-09-14-electron-npm-only-ecosystem-plugins.md).

## Alternatives considered

**Ship it as a manageable ecosystem plugin.** Rejected because users could disable required UI infrastructure through Plugin Manager.

**Develop in the Electron mirror and copy back.** Rejected because two trees would compete as source of truth.

**Bundle a Desktop-specific variant instead of the portable package.** Rejected because the portable build must stay byte-identical to what standalone `dsh` users install.

## Consequences

Desktop's required-UI inventory distinguishes mounted members from absent plugins only by `host.patch.yml` rows; adding a member without a mount silently ships dead code.

Theme Studio's subtree tests and the Electron discovery/classification tests pin the category facts: `platform: web`, no Electron or desktop imports, system ownership, required, not manageable, and absent from `dshElectron.ecosystemPlugins`. Coverage does not include a headed Electron window visual check of idle UI.
