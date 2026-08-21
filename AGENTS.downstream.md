# AGENTS.downstream.md

This repository is the **DeepSeek Harness Desktop** downstream fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). It packages the upstream agent harness as a native Electron desktop application for macOS, Windows, and Linux. Upstream owns the core runtime, packages, and documentation spine; this fork owns the desktop shell, downstream CI/CD, release channels, and repository landing pages.

## Repository relationship

| Area | Owner | Notes |
|------|-------|-------|
| `packages/`, `vendor/`, `apps/cli`, `apps/web` | Upstream | Merged from `upstream/master` on `develop` |
| `apps/electron/` | Downstream | Desktop shell, updater, installers |
| `README.md`, `README.zh.md`, `README.i18n.yaml` | Downstream | Never overwritten by upstream sync |
| `AGENTS.md` | Upstream | Sync accepts upstream; restore `@AGENTS.downstream.md` after each sync |
| `AGENTS.downstream.md` | Downstream | This file — fork-specific rules only |
| `.github/workflows/sync-upstream.yml`, `desktop-*.yml` | Downstream | Not present upstream |

The `upstream` remote points at `https://github.com/deepseek-ai/deepseek-harness.git`. Routine upstream integration happens only on `develop`; `main` receives promoted code through a reviewed Pull Request.

## Git branch model

```
feature branch  →  develop  →  main
```

### `main`

`main` is the stable branch and the only branch used for RC and Stable desktop releases.

- GitHub Protected Branch — no direct push
- No routine development commits
- No upstream sync merges
- Accepts Pull Requests **only** from `develop`
- `develop → main` must use **Squash Merge**
- Publishes `v*-rc.*` (Pre-Release) and `va.b.c` (Release) tags

### `develop`

`develop` is the primary development branch and the upstream sync target.

- Receives upstream merges from [`sync-upstream.yml`](.github/workflows/sync-upstream.yml)
- Receives feature Pull Requests from `codex/*`, `dev/*`, `cursor/*`, and `agent/*`
- Integrates Electron downstream changes
- Runs routine desktop CI
- Publishes `v*-beta.*` (Pre-Release) tags after each successful upstream sync

### Feature branches

Prefixes `codex/*`, `dev/*`, `cursor/*`, and `agent/*` are development branches for features, bug fixes, CI/CD changes, Electron work, and documentation. Open Pull Requests against **`develop`**, never directly against `main`.

## Upstream synchronization

[`sync-upstream.yml`](.github/workflows/sync-upstream.yml) runs on a schedule and via `workflow_dispatch`. The target branch is **`develop`** — never `main`.

```
upstream/master  →  develop  →  v{a.b.c}-beta.{x}
```

After a verified merge the workflow:

1. Synchronizes Electron workspace dependencies from the upstream graph
2. Regenerates `pnpm-lock.yaml`
3. Runs focused Electron tests and builds
4. Pushes to `develop`
5. Dispatches [`desktop-ci.yml`](.github/workflows/desktop-ci.yml)
6. Creates the next `v{a.b.c}-beta.{x}` tag and triggers a Beta desktop release

### Conflict resolution

| File(s) | Strategy |
|---------|----------|
| `README.md`, `README.zh.md`, `README.i18n.yaml` | **Downstream wins** — `.gitattributes` `merge=ours` |
| `AGENTS.md` | **Upstream wins** — accept upstream, then run `restore-agents-downstream.mjs` |
| Upstream workflows and `scripts/ci-workflow.spec.ts` | **Upstream wins** — `.gitattributes` uses `merge=theirs`; the sync job registers that driver before merging |
| `.github/workflows/desktop-*.yml`, `.github/workflows/sync-upstream.yml`, `scripts/desktop-workflow.spec.ts` | **Downstream wins** — `.gitattributes` uses `merge=ours` |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Accept upstream, confirm `apps/electron` remains in the workspace, run `pnpm install --no-frozen-lockfile`, commit the regenerated lockfile |
| Other `*.i18n.yaml` | Register the `dsh-translation-pairing` merge driver before merge; if a pairing record still conflicts, run `pnpm run resolve-translation-pairing-conflicts` to regenerate it from the merged owners. Abort when an owner Markdown file also conflicts or the resolver rejects the record. |
| All other conflicts | Abort — manual resolution required |

The lockfile goal is: upstream dependency state plus downstream `apps/electron` dependency state equals the final lockfile. Do not preserve a stale downstream lockfile to avoid upstream dependency updates.

### `AGENTS.md` restoration

After each upstream merge that touches `AGENTS.md`:

1. Accept the upstream file body
2. Do not maintain long-lived edits to upstream `AGENTS.md` prose
3. Ensure the file ends with `@AGENTS.downstream.md`

Run `node apps/electron/scripts/restore-agents-downstream.mjs` when the marker is missing.

## Downstream file protection

Never let upstream sync overwrite:

- `README.md`, `README.zh.md`, `README.i18n.yaml`
- `AGENTS.downstream.md`
- `apps/electron/**` (except shared lockfile regeneration side effects)

Treat `.github/workflows/desktop-*.yml`, `.github/workflows/sync-upstream.yml`, and `scripts/desktop-workflow.spec.ts` as downstream-owned. All other `.github/workflows/*.yml` files and `scripts/ci-workflow.spec.ts` are upstream-owned.

Downstream changes may create new Agent Note triplets or update Agent Note triplets originally created by this downstream repository. Never modify an Agent Note Markdown owner or `*.i18n.yaml` sidecar created by upstream; record downstream-specific decisions in a new downstream-owned Agent Note and link to the upstream note from the downstream note when necessary.

## Electron development constraints

- All desktop release work targets `apps/electron/`
- Build the upstream runtime before starting Electron locally (`pnpm run build` then `pnpm --filter @deepseek-ai/dsh-electron start`)
- Desktop-owned registry dependencies (for example `electron-updater`) are retained across upstream dependency sync; workspace dependencies are regenerated from the upstream CLI graph. A leftover `workspace:` specifier whose package is absent after the merge is dropped; it is not retained as a registry dependency ([rationale](.agents/notes/implemented/bug-fix/2026-08-20-drop-stale-electron-workspace-specifiers.md))
- Packaged builds use `electron-builder` with NSIS (Windows), DMG/ZIP (macOS), and AppImage/DEB (Linux) on native x64 and ARM64 runners
- Release artifacts are unsigned unless platform signing credentials are configured
- The updater reads GitHub Release metadata; tag names follow `v{a.b.c}[-beta.x|-rc.x]` — not the legacy `electron-dsh-v*` format

## Release and version rules

### Tag formats

| Channel | Branch | Tag example | GitHub Release type |
|---------|--------|-------------|---------------------|
| Beta | `develop` | `v0.1.0-beta.1` | Pre-Release |
| RC | `main` | `v0.1.0-rc.3` | Pre-Release |
| Stable | `main` | `v0.1.0` | Release |

No other tag formats are permitted.

### Beta auto-increment

After each upstream sync to `develop`, the sync workflow creates the next `v{a.b.c}-beta.{x}` tag. The `beta.x` suffix increments independently within the same `a.b.c` range and does not track upstream pre-release numbers. Example: upstream at `0.1.0-rc.3` yields downstream betas `v0.1.0-beta.1`, `v0.1.0-beta.2`, …

### RC and Stable alignment

RC and Stable versions must match upstream exactly, including the `rc.x` suffix:

- Upstream `0.1.0-rc.3` → downstream RC tag `v0.1.0-rc.3`
- Upstream `0.1.0` → downstream Stable tag `v0.1.0`

[`desktop-promote.yml`](.github/workflows/desktop-promote.yml) creates RC/Stable tags on `main` after a `develop → main` promotion. Version comparison must consider both `a.b.c` and `rc.x`, not the base version alone.

### Electron package version

`apps/electron/package.json` `version` must equal the release tag without the `v` prefix:

- Tag `v0.1.0-beta.3` → `"version": "0.1.0-beta.3"`
- Tag `v0.1.0-rc.3` → `"version": "0.1.0-rc.3"`
- Tag `v0.1.0` → `"version": "0.1.0"`

Set versions through pnpm scripts — do not hand-edit unless no script exists:

```sh
pnpm electron:set-version 0.1.0-beta.3
pnpm install --no-frozen-lockfile   # when lockfile must follow manifest changes
```

[`set-version.mjs`](apps/electron/scripts/set-version.mjs) updates the Electron manifest. [`sync-version.mjs`](apps/electron/scripts/sync-version.mjs) synchronizes workspace dependencies from the upstream CLI graph.

## CI / CD workflow responsibilities

| Workflow | Trigger | Role |
|----------|---------|------|
| [`sync-upstream.yml`](.github/workflows/sync-upstream.yml) | Schedule, dispatch | Merge upstream → `develop` when upstream changed; publish Beta tag |
| [`desktop-ci.yml`](.github/workflows/desktop-ci.yml) | Push/PR to `develop`, push to `main` | Test and compile without packaging |
| [`desktop-release.yml`](.github/workflows/desktop-release.yml) | Tag push, dispatch | Package and publish installers for all platforms |
| [`desktop-promote.yml`](.github/workflows/desktop-promote.yml) | Push to `main` | Create RC/Stable tags matching upstream version |

All other workflow files are retained from upstream for clean synchronization but are not part of the downstream CI/CD policy.

## Branch operation restrictions

| Action | Allowed |
|--------|---------|
| Feature branch → `develop` PR | Yes |
| Feature branch → `main` PR | **No** |
| Direct push to `main` | **No** |
| Direct push to `develop` (humans) | Avoid — use PRs; sync bot is the exception |
| Upstream sync → `develop` | Yes (automated) |
| Upstream sync → `main` | **No** |
| `develop → main` Squash Merge PR | Yes (release promotion) |
| Beta tag on `develop` | Yes (automated after sync) |
| RC / Stable tag on `main` | Yes (via `desktop-promote.yml` or manual dispatch) |
| Beta tag on `main` | **No** |
| RC / Stable tag on `develop` | **No** |

## Commands

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-electron test
pnpm --filter @deepseek-ai/dsh-electron build
pnpm electron:sync-version          # sync workspace deps from upstream CLI graph
pnpm electron:set-version <version> # set Electron manifest version
node apps/electron/scripts/next-beta-tag.mjs   # print next beta tag for current tree
node apps/electron/scripts/restore-agents-downstream.mjs
```

## Release promotion flow

```
Upstream
   ↓  sync-upstream.yml
develop
   ↓  v{a.b.c}-beta.{x}  →  desktop-release.yml
develop → main PR (Squash Merge)
   ↓  desktop-promote.yml
main
   ↓  v{a.b.c}-rc.{x} or v{a.b.c}  →  desktop-release.yml
RC / Stable installers
```
