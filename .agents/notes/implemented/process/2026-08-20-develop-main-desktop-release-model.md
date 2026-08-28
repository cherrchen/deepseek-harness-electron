# Agent Note: develop/main branch model and Beta/RC/Stable desktop releases

Status: implemented

English | [中文](2026-08-20-develop-main-desktop-release-model.zh.md)

## Problem

The desktop fork synchronized upstream directly into `main`, published desktop releases from detached upstream snapshots tagged `electron-dsh-v*`, and mixed routine development with release promotion on one branch. That made the downstream branch model unclear, complicated conflict handling for fork-owned files, and prevented independent Beta iteration on `develop` while keeping RC and Stable versions aligned with upstream on `main`.

## Decision

Adopt `feature branch → develop → main`:

- [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) merges `upstream/master` into `develop`, applies downstream conflict policy, prepares and pushes the next Beta commit, and publishes its `v{a.b.c}-beta.{x}` tag only after Desktop CI succeeds for that commit.
- Desktop CI accepts promotion pull requests into `main` only from `develop`, where the Electron manifest version is prepared to match the RC or Stable version in `apps/cli/package.json` and the lockfile records that manifest.
- [`desktop-promote.yml`](../../../../.github/workflows/desktop-promote.yml) checks the prepared version on the latest `main` commit and creates its `v{a.b.c}-rc.{x}` or `v{a.b.c}` tag without changing a branch.
- [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) packages installers from tag pushes and validates that Beta tags belong to `develop` while RC and Stable tags belong to `main`. Windows packages disable the builder's internal differential 7z archive and use ZIP payload extraction, whose NSIS path reports decompression failure, and an unscoped packaged application name for stable updater cache directories. Each Windows runner installs its completed artifact, verifies the application executable, packaged runtime, desktop shortcut, and Start menu shortcut, then uninstalls it before upload.
- [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md) records fork-specific rules; upstream [`AGENTS.md`](../../../../AGENTS.md) ends with `@AGENTS.downstream.md` and is restored after each sync.

Version scripts live under `apps/electron/scripts/`:

- `set-version.mjs` — set `apps/electron/package.json` version through `pnpm electron:set-version`
- `next-beta-tag.mjs` — compute the next `v{a.b.c}-beta.{x}` tag for the current tree
- `restore-agents-downstream.mjs` — re-append `@AGENTS.downstream.md` after upstream `AGENTS.md` sync

## Alternatives considered

**Keep syncing upstream into `main`.** Collides with protected-branch promotion and mixes Beta iteration with RC/Stable release authority.

**Retain `electron-dsh-v*` tags.** The new `v*` scheme matches upstream semver tags and separates Beta, RC, and Stable channels by branch.

**Hand-edit Electron versions before release.** A shared script keeps `apps/electron/package.json` and lockfile regeneration consistent across workflows.

**Create the RC or Stable version commit from the promotion workflow.** A commit written directly to `main` makes the protected release branch diverge from `develop` and requires a back-merge. Preparing the version on `develop` puts the manifest and lockfile under pull-request review before the same content reaches `main`.

**Dispatch Desktop CI separately and continue without its conclusion.** A detached dispatch duplicates the CI run already triggered by the `develop` push and cannot authorize a tag before its result is known. The sync workflow instead identifies the push-triggered run by the final Beta commit SHA and treats its successful conclusion as a tag precondition.

**Keep the default embedded 7z payload.** The builder's 7z NSIS macro can continue after an empty temporary extraction and still write an uninstaller and shortcuts. ZIP payloads are larger, but their NSIS extraction path checks and reports decompression failure. Enabling ZIP extraction without disabling the internal differential package is invalid because the builder still produces 7z bytes while directing NSIS to open them as ZIP.

## Consequences

Upstream integration and Beta releases happen on `develop`; the final Beta commit is pushed once, validated by its push-triggered Desktop CI run, and tagged only after that run succeeds. RC and Stable releases require a Squash Merge promotion to `main`. The promotion pull request carries the Electron version and lockfile update, while the post-merge workflow writes only the release tag. Windows installers trade some compression for checked extraction, and release time includes a native install/uninstall smoke test. README landing pages stay downstream-owned; `AGENTS.md` follows upstream with a restored downstream reference. Legacy `electron-dsh-v*` tags remain historical artifacts; new releases use `v{a.b.c}[-beta.x|-rc.x]`.
