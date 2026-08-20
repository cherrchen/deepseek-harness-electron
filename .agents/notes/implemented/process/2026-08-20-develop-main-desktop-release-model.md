# Agent Note: develop/main branch model and Beta/RC/Stable desktop releases

Status: implemented

English

## Problem

The desktop fork synchronized upstream directly into `main`, published desktop releases from detached upstream snapshots tagged `electron-dsh-v*`, and mixed routine development with release promotion on one branch. That made the downstream branch model unclear, complicated conflict handling for fork-owned files, and prevented independent Beta iteration on `develop` while keeping RC and Stable versions aligned with upstream on `main`.

## Decision

Adopt `feature branch → develop → main`:

- [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) merges `upstream/master` into `develop`, applies downstream conflict policy, regenerates the lockfile, verifies the overlay, and publishes the next `v{a.b.c}-beta.{x}` tag.
- [`desktop-promote.yml`](../../../../.github/workflows/desktop-promote.yml) runs on `main` and creates `v{a.b.c}-rc.{x}` or `v{a.b.c}` tags that match `apps/cli/package.json`.
- [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) packages installers from tag pushes and validates that Beta tags belong to `develop` while RC and Stable tags belong to `main`.
- [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md) records fork-specific rules; upstream [`AGENTS.md`](../../../../AGENTS.md) ends with `@AGENTS.downstream.md` and is restored after each sync.

Version scripts live under `apps/electron/scripts/`:

- `set-version.mjs` — set `apps/electron/package.json` version through `pnpm electron:set-version`
- `next-beta-tag.mjs` — compute the next `v{a.b.c}-beta.{x}` tag for the current tree
- `restore-agents-downstream.mjs` — re-append `@AGENTS.downstream.md` after upstream `AGENTS.md` sync

## Alternatives considered

**Keep syncing upstream into `main`.** Collides with protected-branch promotion and mixes Beta iteration with RC/Stable release authority.

**Retain `electron-dsh-v*` tags.** The new `v*` scheme matches upstream semver tags and separates Beta, RC, and Stable channels by branch.

**Hand-edit Electron versions before release.** A shared script keeps `apps/electron/package.json` and lockfile regeneration consistent across workflows.

## Consequences

Upstream integration and Beta releases happen on `develop`; RC and Stable releases require a Squash Merge promotion to `main`. README landing pages stay downstream-owned; `AGENTS.md` follows upstream with a restored downstream reference. Legacy `electron-dsh-v*` tags remain historical artifacts; new releases use `v{a.b.c}[-beta.x|-rc.x]`.
