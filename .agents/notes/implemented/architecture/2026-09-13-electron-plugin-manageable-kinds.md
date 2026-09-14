# Agent Note: Electron requires Desktop intent before hot-loading profile packages

Status: implemented

English | [中文](2026-09-13-electron-plugin-manageable-kinds.zh.md)

## Problem

Many ordinary npm libraries expose `main` or a root export, so package entry points alone cannot prove that a direct web-profile dependency is a Cordis plugin. Adding every importable CLI dependency to Electron's generated roster can make Host startup execute unrelated library modules.

## Decision

A healthy profile `runtime-plugin` is manageable only when Desktop recorded its name in `profileManaged`. The list records both Desktop installation provenance and the user's intent to execute that package through Electron's private generated roster. An importable CLI dependency remains catalogued by its inspected kind but stays out of the roster. `plugin-state.json` stays at version 2.

Desktop installs append valid runtime plugins to `profileManaged` before activation. Bundles stay shared profile composition (`profile-restart`) because `dsh.bundle.patch` is their explicit plugin discriminator. Distribution-owned ecosystem plugins remain manageable independently of profile state.

## Alternatives considered

**Treat every healthy package with a root entry as a runtime plugin.** Rejected because ordinary libraries use the same npm entry fields and would execute during Host startup.

**Add another package-manifest discriminator for hot plugins.** Rejected because Desktop installation already records explicit execution intent without changing the public package format.

## Consequences

Startup composition and package reactivation require catalog health, runtime-plugin kind, and Desktop membership. CLI dependencies remain visible for package actions without receiving runtime controls or entering `plugins.cordis.yml`.
