# Agent Note: Public DSH ecosystem plugin namespace

Status: implemented

English | [中文](2026-08-23-public-dsh-ecosystem-plugin-namespace.zh.md)

## Problem

Desktop product features need independent npm releases without creating an Electron-only plugin model or making their portable behavior depend on the Desktop runtime. The downstream fork also needs a path that upstream synchronization cannot overwrite.

## Decision

`packages/dsh-electron/**` is a downstream-owned namespace island inside the otherwise upstream-owned `packages/**` tree. Each direct child mirrors a canonical standalone repository through Git subtree and retains its own npm version, registry semver dependencies, and prebuilt Host and Client artifacts.

`@dsh-electron/dsh-plugin-*` identifies public DSH ecosystem features. The publisher scope does not imply Electron. Portable plugins use upstream DSH/Cordis services; Desktop-aware plugins keep the main fiber portable and install native behavior in an optional `ctx.inject(['desktop'], ...)` child fiber against the smallest structural interface they consume. `@dsh-electron/dsh-electron-*` remains reserved for Desktop-required adapters and infrastructure under `apps/electron/runtime/plugins/`.

The upstream sync merge driver preserves the namespace during ordinary conflicts and stops before merging when the upstream tree first claims `packages/dsh-electron`. A workspace check asks pnpm for its resolved package graph and rejects any downstream subtree package excluded from that graph.

Electron declares standard ecosystem packages as dependencies, discovers their installed artifacts, links them into the supervised Host profile, and mounts them through `runtime/host.patch.yml`. The Desktop runtime builder continues to compile only Electron-owned adapters under `apps/electron/runtime/plugins/`.

## Alternatives considered

**Electron Plugin SDK.** A separate manifest, loader, context, and lifecycle would duplicate Cordis service injection, fibers, configuration, Host/Client composition, and UI slots while making one product feature publish two incompatible artifacts.

**All downstream features under `apps/electron/runtime/plugins/`.** This makes package location imply Desktop ownership and encourages otherwise portable features to depend on the preload provider or Electron-specific build process.

**Require the complete Desktop contract package.** A public plugin would become coupled to one provider and every unrelated Desktop capability. Structural typing lets another DSH desktop runtime provide the exact enhancement methods without adopting Electron infrastructure.

## Consequences

Native DSH and Electron load one package version and one artifact set. Missing or unloaded Desktop capability affects only the optional child fiber. Repository checks validate each subtree package's invariant source and publication metadata while accepting canonical registry ranges and standalone build configuration. The downstream fork must maintain explicit sync protection, standalone dependency ranges, artifact compatibility tests, and subtree synchronization with each canonical plugin repository.
