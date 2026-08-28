# Agent Note: Theme Studio as a required runtime plugin

Status: implemented

English | [中文](2026-08-26-theme-studio-runtime-plugin.zh.md)

## Problem

Desktop needs builtin color overlays under **Settings → General → Themes** without replacing official Appearance (Light / Dark / System). Theme presentation already belongs to `ctx.theme`. A second ThemeRuntime, DOM writes, or an Electron-only theme IPC would split token authority. Shipping Theme Studio as a user-disableable `packages/dsh-electron/` ecosystem plugin would hide the Themes row when the package is disabled.

## Decision

`@dsh-electron/dsh-theme-studio` is Electron-required portable UI in the same class as Details Host ([required portable UI](2026-08-24-electron-required-portable-ui-infrastructure.md)). Canonical source is `cherrchen/dsh-theme-studio`. This monorepo mirrors it at `apps/electron/runtime/plugins/dsh-theme-studio` with git subtree. Electron rebuilds Host and Client artifacts from that source. The package is a required `runtime/host.patch.yml` mount and is not a member of `dshElectron.ecosystemPlugins`.

Theme Studio does not present CSS. It calls `ctx.theme.overrideTokens()` with two fixed sources:

* `@dsh-electron/dsh-theme-studio:active` for the persisted overlay
* `@dsh-electron/dsh-theme-studio:preview` for a transient overlay that never writes settings

Official Appearance remains `settings.general.item` `id = appearance` `order = 10`. Theme Studio registers `id = themes` `order = 20`. Restoring Default disposes Theme Studio layers only; it never calls `ctx.theme.setTheme()`.

The Host half registers the `theme-studio` settings namespace (`activeThemeId: string | null`) when `ctx.settings` exists, and is a no-op otherwise so Headless compositions boot. Durable Host snapshots remain the authority after optimistic visual updates.

## Alternatives considered

**Ship Theme Studio under `packages/dsh-electron/` and list it in `dshElectron.ecosystemPlugins`.** Rejected because Themes is always-on Desktop product UI. Users could disable the overlay from Plugin Manager and leave General without the Themes row.

**Implement Theme Studio inside Electron Main, preload, or renderer.** Rejected because overlay, persistence, and the Themes row are ordinary DSH plugin work; Electron would then own product UI that a standard Web host could not load.

**Replace or duplicate official Appearance.** Rejected because Light / Dark / System is the base preference ThemeRuntime already resolves, including `prefers-color-scheme` for `system`. Overlay palettes must follow that base, not own it.

**Add a second ThemeRuntime or write `document.documentElement` from Theme Studio.** Rejected because `overrideTokens()` already stacks later sources over earlier ones, replaces a source atomically, and selects light/dark values from the active color scheme.

**Expose `ctx.themeStudio` in Stage 1.** Rejected because Stage 3 owns the cross-plugin catalog API; the Settings row uses the plugin-internal runtime until that API exists.

## Consequences

Desktop distribution of Theme Studio is package inclusion, required `host.patch.yml` membership, and Cordis lifecycle. Overlay correctness, preview, persistence, and the Themes row stay in the standalone package. Stage 2 import/export and Stage 3 agent/catalog work extend that runtime instead of replacing it.
