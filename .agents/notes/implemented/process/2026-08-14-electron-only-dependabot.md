# Agent Note: Electron-only Dependabot updates

Status: implemented

English | [中文](2026-08-14-electron-only-dependabot.zh.md)

## Problem

The desktop repository inherits most manifests, workflows, and dependency decisions from `deepseek-ai/deepseek-harness`. Applying the upstream repository-wide [Dependabot policy](2026-07-27-dependabot-version-updates.md) here creates duplicate npm, Python, and GitHub Actions proposals that will arrive again through upstream synchronization. Each generated pull request also starts upstream validation and a three-platform desktop package matrix even though the downstream repository owns only the Electron packaging toolchain.

## Decision

The root npm entry in [`.github/dependabot.yml`](../../../../.github/dependabot.yml) allows only `electron` and `electron-builder`. A root entry is retained because the pnpm workspace has one root lockfile. Version updates form one `electron-toolchain` group with at most one open pull request, and security updates form one separate group. The uv and GitHub Actions entries ignore every dependency and set the version-update pull-request limit to zero so those upstream-owned ecosystems do not generate downstream proposals.

Dependabot pull requests run the `Electron dependency check` job in [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml). The job rejects changes outside `apps/electron/package.json` and `pnpm-lock.yaml`, installs the frozen lockfile, runs the Electron runtime tests, and compiles the Electron main process. It identifies the pull request by `pull_request.user.login`, not the triggering actor, so a maintainer rerun cannot widen the bot's permissions.

The upstream CI, release-pack, real-API, and native workflows do not run for a pull request whose changed paths are limited to the Electron manifest and root lockfile. Repository issue-policy jobs skip Dependabot pull requests because this downstream repository does not own the upstream project integration credentials. Human pull requests retain the ordinary desktop validation, and every merged dependency update triggers the complete desktop build and three-platform package matrix on `main`.

Upstream package, Python, native, and GitHub Actions dependencies advance only through the verified upstream merge in [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml). The downstream policy does not automatically merge dependency pull requests.

## Alternatives considered

- **Keep the inherited repository-wide Dependabot scan.** Rejected because it duplicates upstream ownership, produces changes that will later arrive through synchronization, and spends downstream CI on unrelated proposals.
- **Scan only `/apps/electron`.** Rejected because the Electron workspace participates in the root pnpm lockfile; retaining the root npm entry keeps manifest and lockfile resolution together while the allowlist limits ownership.
- **Run the complete desktop package matrix before review.** Rejected because the focused pull-request job covers dependency installation, runtime behavior, and compilation. The complete matrix still runs after merge and before every release.
- **Disable Dependabot entirely.** Rejected because Electron and its packager are downstream-owned release dependencies and need an automated update signal.

## Consequences

Dependabot creates at most one open Electron version-update pull request and groups available Electron security fixes separately. Upstream dependency alerts and update timing remain the upstream repository's responsibility and reach the desktop repository through synchronization.

Pull-request validation consumes one Linux runner and does not build installers. A merged update still receives the full Windows, macOS, and Linux evidence before it can become a downstream release.

The root lockfile can change transitive packages while updating an allowed dependency. The path guard contains the change to the Electron manifest and lockfile, while the frozen install, focused tests, compilation, post-merge matrix, and maintainer review provide progressively broader evidence.
