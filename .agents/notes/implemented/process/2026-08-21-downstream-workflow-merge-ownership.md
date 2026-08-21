# Agent Note: Downstream workflow merge ownership

Status: implemented

English | [中文](2026-08-21-downstream-workflow-merge-ownership.zh.md)

## Problem

The desktop fork retains upstream GitHub Actions files so upstream synchronization preserves the repository tree, but its CI/CD policy runs only `desktop-*.yml` and `sync-upstream.yml`. Downstream edits to upstream workflow paths and their shared specification create recurring content conflicts even though those workflows do not belong to the desktop automation.

## Decision

Upstream owns `.github/workflows/*.yml` and `scripts/ci-workflow.spec.ts`. The more specific downstream rules own `.github/workflows/desktop-*.yml`, `.github/workflows/sync-upstream.yml`, and `scripts/desktop-workflow.spec.ts`. [`.gitattributes`](../../../../.gitattributes) records the precedence, and [`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) registers the `theirs` driver before merging so clean and conflicted upstream-owned paths both take the upstream content.

The downstream workflow assertions live only in [`desktop-workflow.spec.ts`](../../../../scripts/desktop-workflow.spec.ts). The upstream [`ci-workflow.spec.ts`](../../../../scripts/ci-workflow.spec.ts) stays byte-for-byte aligned with `upstream/master`; downstream policy does not add assertions to it.

Translation pairing records retain their dedicated merge driver. Owner Markdown files merge first, and conflicted `*.i18n.yaml` records are regenerated from the confirmed merged owners rather than selected by repository ownership.

## Alternatives considered

- **Keep downstream assertions in `ci-workflow.spec.ts`** — rejected because every desktop assertion creates permanent divergence in an upstream-owned file.
- **Delete unused upstream workflows** — rejected because upstream modifications would become modify/delete conflicts and the downstream tree would stop mirroring upstream paths.
- **Choose one owner for every workflow path** — rejected because the desktop and synchronization workflows are downstream release infrastructure and must not be overwritten by upstream.

## Consequences

Upstream workflow changes synchronize without manual content resolution. Desktop workflow changes remain stable across upstream merges. A downstream requirement concerning an upstream workflow must be implemented in a downstream-owned workflow or focused downstream policy file rather than by modifying the upstream workflow or its specification.

## Verification

The focused workflow specifications parse the YAML owners and assert both the merge-driver registration and the conflict fallback path. The translation-pairing checks continue to validate regenerated bilingual records independently.
