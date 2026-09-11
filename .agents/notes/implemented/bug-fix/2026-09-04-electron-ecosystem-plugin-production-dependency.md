# Agent Note: Packaged Electron ships declared ecosystem plugins as production dependencies

Status: implemented

English | [中文](2026-09-04-electron-ecosystem-plugin-production-dependency.zh.md)

## Problem

`dshElectron.ecosystemPlugins` listed `@dsh-electron/dsh-plugin-git`, and startup discovery looks for that package under the Electron app `node_modules` (with a monorepo workspace fallback for source checkouts). The Electron app did not declare the package as a production dependency, so electron-builder omitted it from the packaged app. Opening DeepSeek Harness `v0.1.2-beta.1` failed with `ecosystem plugins: @dsh-electron/dsh-plugin-git is declared but not installed`. Source `pnpm start` and unit tests still passed because they resolved `packages/dsh-electron/dsh-plugin-git`.

## Decision

Every name in `dshElectron.ecosystemPlugins` is a production `workspace:` dependency of `@dsh-electron/dsh-electron`. `requiredDesktopWorkspaceDependencies()` concatenates those names with `DESKTOP_ENTRY_WORKSPACE_DEPENDENCIES`, so `sync-version` cannot drop them when it regenerates the CLI workspace graph. Discovery still prefers `app/node_modules/<name>` and keeps the workspace fallback for unpackaged checkouts. The public namespace decision that ecosystem plugins are standard DSH packages remains [the namespace note](../architecture/2026-08-23-public-dsh-ecosystem-plugin-namespace.md).

## Alternatives considered

**Copy plugin files through electron-builder `files` or `extraResources` without a production dependency.** Rejected because discovery, profile linking, and Host package resolution all use npm package names under `node_modules`; a second copy path would drift from the declared roster.

**Mount Git under `runtime/plugins/` like Details Host and Theme Studio.** Rejected because Git is user-disableable ecosystem UI, not required Desktop infrastructure. [Required portable UI](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.md) already owns that split.

**Keep only the monorepo workspace fallback.** Rejected because a packaged `.app` has no `packages/dsh-electron/` tree, which is the `v0.1.2-beta.1` crash.

## Consequences

Packaged Desktop includes each declared ecosystem plugin in `Contents/Resources/app/node_modules`. A later `sync-version` run retains those workspace specifiers. The workspace fallback remains development-only and no longer hides a missing production dependency from packaging tests.

## Testing

- Unit: each `dshElectron.ecosystemPlugins` name is a production `workspace:^` dependency; discovery reads a packaged `node_modules` layout and rejects a declared name with neither install path present; `requiredDesktopWorkspaceDependencies()` keeps Git when synchronizing.
- Manual: install the Desktop artifact and confirm startup no longer throws `declared but not installed` for `@dsh-electron/dsh-plugin-git`.
