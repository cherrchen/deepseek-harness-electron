# Agent Note: Use GitHub release commits as temporary desktop release authority

Status: implemented

English | [中文](2026-08-14-github-release-commit-authority.zh.md)

## Problem

The upstream dsh release sequence can declare a version in a `release(dsh): <version>` commit without exposing the same version through npm. Requiring both sources prevents an exact, reviewable upstream release commit from producing a desktop release and cannot distinguish an unpublished version from an omitted registry version.

## Decision

Desktop release eligibility temporarily uses the upstream GitHub history as its authority. [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) accepts only an exact `release(dsh): <version>` subject whose `apps/cli/package.json` declares the same version. Scheduled scans consider commits after the desktop baseline; a manual `release_version` input searches the complete `upstream/master` history and fails unless exactly one commit matches.

The npm discovery and validation commands remain commented beside the GitHub checks so restoring the second source is an explicit, reviewable change. [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) independently verifies the snapshot version, its upstream parent, and that parent's exact subject before any platform package is uploaded.

The npm check returns when upstream publication exposes a complete version sequence or trustworthy provenance that maps each npm version to its source commit. Restoring it requires both snapshot preparation and the three platform release jobs to reject a version absent from that source.

## Alternatives considered

**Keep npm as a mandatory second source.** The registry omits a version represented by an exact upstream release commit, so this blocks the requested desktop release without establishing that the source declaration is invalid.

**Accept an arbitrary commit or version input.** A free-form pair could label unrelated source as a release. Exact subject, manifest, uniqueness, and snapshot-parent checks retain a closed GitHub-derived identity.

**Tag synchronized `main`.** The branch may include changes after the release commit. A detached snapshot keeps the upstream version boundary exact.

## Consequences

A GitHub-declared version can produce desktop installers even when npm does not contain that version. This enables historical release commits such as `0.1.0-rc.5`, while accepting that the desktop Release may not have a matching npm page.

The release remains reproducible from one named upstream commit and the Electron overlay. Maintainers must restore registry validation when the reintroduction condition is met; until then, the exact upstream release subject and manifest are the only publication evidence.
