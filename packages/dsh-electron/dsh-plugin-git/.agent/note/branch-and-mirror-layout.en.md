# Branch topology and the Desktop repository mirror

- **Status**: Current (repository observations as of 2026-09-13; update after changes)
- **Category**: repository observation / upstream integration

## Canonical repository and the local mirror

The canonical repository for this package is `cherrchen/dsh-plugin-git` on GitHub (see the `repository` field in `package.json`). The root `AGENTS.md` declares that this local working copy mirrors the canonical repository and must stay independently installable and publishable (registry semver ranges only, never `workspace:`).

## The git subtree mirror in DeepSeek Harness Desktop

The root `README.md` states that [DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) mirrors this repository via **git subtree** and pre-installs the plugin there. Consequences:

- This repository's commit history also appears in the Desktop repository (subtree merges);
- The package keeps a self-contained path (a `dsh-plugin-git/`-style subdirectory), so cross-package absolute references must be avoided.

## Branch model (conclusions from git archaeology)

- `main` is the primary branch; features and fixes land through PRs (e.g. #2, #4, #5).
- An integration branch `develop` exists: the README compatibility note once said "This `develop` branch targets DeepSeek Harness `v0.1.2`" (updated to `v0.1.5` after the upstream right-sidebar migration); `develop` was merged back into `main` through PR #6.
- When `main` was synced back into `develop` (commit `93ea41f`), conflicts were resolved **in favor of develop**; the local branch `backup/develop-before-sync` is a pre-sync backup of `develop`.
- `audit/0906`, `fix/audit-0908`, and `feat/ui-beauty` are audit/polish work branches; their content reached `main` through rebase/cherry-pick under different SHAs (e.g. `80b1826` vs. `6d10d5f` on main — same subject, different SHA). Whether a branch is merged **cannot be judged by `git branch --merged` alone**; compare commit subjects.

## Upstream version pinning

- devDependencies are pinned to DSH `0.1.5-rc.2` (the npm `next` tag carries every needed package); `@deepseek-ai/dsh-*` peerDependencies cover the range `>=0.1.2-alpha.4 <0.2.0`, while the UI host `@deepseek-ai/dsh-client-ui-sidebar-right` and `@deepseek-ai/dsh-client-resources` peers pin `>=0.1.5-rc.2 <0.2.0`.
- The former third-party UI host `@dsh-electron/dsh-client-ui-details-host` is deprecated: this package migrated to the upstream built-in right sidebar (npm `0.1.5-rc.2`), so the pinned `tests/fixtures/` tarball `file:` devDependency workflow (`0.2.0-alpha.4` and `0.3.0`; integrity-refresh history in commits `c09dc1a` and `b4ba876`) is gone.

## Related documents

- [Compatibility and installation (root README)](../../README.md#installation)
- [`.agent/note/README.md`](README.md) — admission criteria.
