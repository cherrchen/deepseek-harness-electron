# Agent Note: Electron installs ecosystem plugins only from npm

Status: implemented

English | [中文](2026-09-14-electron-npm-only-ecosystem-plugins.zh.md)

## Problem

Desktop needs every bundled ecosystem plugin in its production `node_modules` so electron-builder includes the package and runtime discovery can link it into the profile. Mirroring an independently published plugin under `packages/dsh-electron/` created a second source tree, required repository-wide workspace and verification exceptions, and let source checkouts succeed through a workspace fallback that packaged applications cannot use. Dependency synchronization also converted every `dshElectron.ecosystemPlugins` entry to `workspace:^`, so a registry pin could not survive an upstream merge.

## Decision

Bundled ecosystem plugins are exact production npm dependencies of `@dsh-electron/dsh-electron`. The current Git plugin dependency is `@dsh-electron/dsh-plugin-git@0.2.3`; this repository contains no copy of its source. `dshElectron.ecosystemPlugins` remains the distribution roster and runtime lifecycle classification, but it does not imply workspace membership.

`synchronizeDependencies()` regenerates only the upstream CLI graph and explicitly required Desktop workspace imports. It retains existing non-workspace registry dependencies, including ecosystem-plugin pins. Runtime discovery resolves every roster entry only from `apps/electron/node_modules` and fails when the installed package is absent. Electron links the published Host and Client artifacts without rebuilding them.

The repository keeps required Desktop runtime sources under `apps/electron/runtime/plugins/`; portable runtime UI infrastructure is a published npm package declared in `dshElectron.runtimePlugins`. Standard workspace, TypeScript, lint, documentation, translation, hook, and upstream-sync rules apply without a `packages/dsh-electron/` exception.

## Alternatives considered

**Keep the subtree as a development fallback.** Rejected because the fallback creates two package authorities and can hide a missing production install until a packaged application starts.

**Move Git into `runtime/plugins/`.** Rejected because Git is a user-manageable ecosystem feature; runtime inventory members are system-owned and cannot be disabled through Plugin Manager.

**Use a semver range for the npm dependency.** Rejected because each Desktop release must bind the exact plugin artifacts it was tested and packaged with.

## Consequences

Source checkouts and packaged applications use the same npm artifact path. Installing dependencies requires registry access for the pinned plugin, and updating Git requires an explicit dependency-pin and lockfile change. The package remains available under `Contents/Resources/app/node_modules`, while a missing install fails during discovery instead of falling back to repository source.

Focused tests preserve the exact registry pin through dependency synchronization, resolve discovery from an installed `node_modules` package, reject a missing install, and forbid reintroducing the workspace fallback. Repository gates scan the normal `packages/**` corpus without subtree exclusions.
