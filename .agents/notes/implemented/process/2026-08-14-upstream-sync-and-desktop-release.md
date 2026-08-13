# Agent Note: Synchronize upstream before desktop validation and release

Status: implemented

English | [中文](2026-08-14-upstream-sync-and-desktop-release.zh.md)

## Problem

The desktop repository carries a small downstream application over an active upstream repository. Copying upstream files or rebasing away the downstream history would make updates fragile, while publishing desktop artifacts before validating the merged tree could attach broken installers to a release.

## Decision

The repository keeps `deepseek-ai/deepseek-harness` as the `upstream` remote and preserves its commit history. [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) fetches `upstream/master` and tags hourly, with one schedule serving as the daily update and the hourly schedule detecting releases. It merges upstream into `main`, synchronizes the Electron version and runtime peer set from the upstream workspace graph, updates the lockfile, runs the focused Electron test plus upstream and Electron builds, and pushes only a verified merge. A conflict aborts without changing `main`.

After a changed merge, the sync workflow dispatches [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml), which validates and packages Windows, macOS, and Linux artifacts. The explicit dispatch is required because a push made with the repository `GITHUB_TOKEN` does not recursively trigger ordinary push workflows.

The sync workflow polls non-draft upstream GitHub releases. When a release tag is contained in synchronized `main` and its CLI version matches the desktop manifest, the workflow creates a downstream `electron-<upstream-tag>` tag at the verified desktop commit and dispatches [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml). The release workflow rebuilds and tests that tag on all three operating systems, publishes installers only after every package job succeeds, and attaches SHA-256 checksums. Upstream prerelease status and version are preserved.

All source and downstream additions remain under the upstream MIT license. Release artifacts are unsigned unless maintainers add platform signing credentials to the supported `electron-builder` environment.

## Alternatives considered

**Replace the downstream tree with an upstream archive.** Archives lose shared Git ancestry, obscure local ownership, and require the Electron overlay to be copied back after every update.

**Rebase the desktop commit series onto every upstream head.** Automated history rewriting makes published downstream commits and release tags unstable and requires force-push coordination.

**Push an unverified merge and rely on a later workflow.** A token-authored push does not trigger another workflow automatically, and a failing merge would already be the default branch state.

**Subscribe directly to the upstream release event.** GitHub does not deliver another repository's release events to this repository without an external GitHub App or webhook. Hourly authenticated polling stays self-contained and bounds the delay without another service.

## Consequences

Routine upstream commits reach the desktop repository without rewriting either history. Desktop-owned paths usually merge independently; upstream edits to the same lines stop the automation and require a reviewed conflict resolution.

Daily sync performs a full upstream build before push, and changed merges also consume three hosted runners for installer validation. Release builds repeat the operating-system matrix so the uploaded bytes come from the tagged tree and never reuse short-retention CI artifacts.

Release publication can lag upstream by the hourly polling interval. A release commit not yet contained in `upstream/master` waits until the branch includes it, preventing a desktop tag from omitting the synchronized upstream source.
