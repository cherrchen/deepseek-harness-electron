# Agent Note: Electron treats healthy runtime-plugins as manageable without profileManaged

Status: implemented

English | [中文](2026-09-13-electron-plugin-manageable-kinds.zh.md)

## Problem

`ProfilePluginCatalog` used `profileManaged` as the manageable gate. A runtime-plugin installed with `dsh plugin --profile web` became a `dependency` in Electron, so the Installed tab could not enable, disable, reload, or remove it even though Host could load it.

## Decision

A healthy `runtime-plugin` with `activationMode === 'hot'` is `manageable: true` whether or not Desktop recorded the name in `profileManaged`. CLI-installed runtime-plugins keep kind `runtime-plugin`. `profileManaged` is source accounting only and is projected as `desktopInstalled` for UI copy and uninstall confirmation. `plugin-state.json` stays at version 2.

Desktop installs still append to `profileManaged`. Bundles stay shared profile composition (`profile-restart`). Runtime-plugins stay Electron-private via `plugins.cordis.yml`. Plain dependencies stay inert. Authors who need `dsh web` as well declare `dsh.bundle.patch`.

## Alternatives considered

**Keep `profileManaged` as the enable/disable gate.** Rejected because it hid CLI-installed runtime-plugins from the only Desktop management UI.

**Bump `plugin-state.json` to version 3 to store source separately.** Rejected because the existing `profileManaged` list already records Desktop installs.

## Consequences

Startup roster and `activateAfterPackageMutation` follow catalog health and kind, not Desktop membership. Overlay and catalog tests pin that `apps/cli` and `packages/boot` stay unmodified. The Installed tab shows category copy for bundles and runtime-plugins and warns on CLI uninstall.
