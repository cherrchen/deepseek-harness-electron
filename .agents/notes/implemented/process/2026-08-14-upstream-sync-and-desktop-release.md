# Agent Note: Synchronize upstream before desktop validation and release

Status: implemented

English | [中文](2026-08-14-upstream-sync-and-desktop-release.zh.md)

## Problem

The desktop repository carries a small downstream application over an active upstream repository. Copying upstream files or rebasing away the downstream history would make updates fragile, while publishing desktop artifacts before validating the merged tree could attach broken installers to a release.

## Decision

The repository keeps `deepseek-ai/deepseek-harness` as the `upstream` remote and preserves its commit history. [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) fetches `upstream/master` hourly, with one scheduled run also serving as the daily update. It merges upstream into `main`, synchronizes the Electron version and runtime peer set from the upstream workspace graph, updates the lockfile, runs the focused Electron test plus upstream and Electron builds, and pushes only a verified merge. A conflict aborts without changing `main`.

After a changed merge, the sync workflow dispatches [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml), which validates and packages Windows, macOS, and Linux artifacts. The explicit dispatch is required because a push made with the repository `GITHUB_TOKEN` does not recursively trigger ordinary push workflows.

Upstream publishes the dsh release family to npm without GitHub Releases or persistent release tags. The sync workflow discovers exact `release(dsh): <version>` subjects after the upstream commit from which the desktop overlay started. A candidate is eligible only when its CLI manifest declares the same version and the npm registry contains that exact `@deepseek-ai/dsh` version. Registry publication may precede or follow branch visibility; the hourly scan retries either ordering without treating a commit message alone as proof of publication.

For each eligible commit, the sync workflow applies the current Electron overlay to that exact upstream tree in a detached worktree, regenerates the Electron manifest and lockfile, and creates `electron-dsh-v<version>` without moving `main`. This snapshot excludes later upstream commits even when synchronization has already advanced beyond the release. [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) rebuilds and tests the snapshot on all three operating systems, publishes installers only after every package job succeeds, and attaches SHA-256 checksums. A prerelease segment in the npm version marks the downstream GitHub Release as a prerelease.

All source and downstream additions remain under the upstream MIT license. Release artifacts are unsigned unless maintainers add platform signing credentials to the supported `electron-builder` environment.

## Alternatives considered

**Replace the downstream tree with an upstream archive.** Archives lose shared Git ancestry, obscure local ownership, and require the Electron overlay to be copied back after every update.

**Rebase the desktop commit series onto every upstream head.** Automated history rewriting makes published downstream commits and release tags unstable and requires force-push coordination.

**Push an unverified merge and rely on a later workflow.** A token-authored push does not trigger another workflow automatically, and a failing merge would already be the default branch state.

**Poll upstream GitHub Releases or require a persistent upstream tag.** The dsh npm sequence does not create either source, so this would never observe a publication.

**Tag synchronized `main` when npm changes.** The synchronized branch may already contain upstream commits made after the npm publication. Tagging it would label unreleased source as the published version.

**Infer the source tree from the newest npm version.** npm tarball metadata does not identify a usable repository commit. A registry version without a matching visible release commit remains unpublished downstream rather than guessing a source snapshot.

## Consequences

Routine upstream commits reach the desktop repository without rewriting either history. Desktop-owned paths usually merge independently; upstream edits to the same lines stop the automation and require a reviewed conflict resolution.

Daily sync performs a full upstream build before push, and changed merges also consume three hosted runners for installer validation. Release builds repeat the operating-system matrix so the uploaded bytes come from the tagged tree and never reuse short-retention CI artifacts.

Release publication can lag npm or the upstream branch by the hourly polling interval. A registry version without a matching visible release commit waits for that commit, and a release commit waits for its exact registry version. Failed or skipped upstream versions do not produce downstream tags.
