# Agent Note: Regenerate conflicted pairing records during upstream sync

Status: implemented

English | [中文](2026-08-21-upstream-sync-regenerates-pairing-records.zh.md)

## Problem

[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) merges `upstream/master` into `develop` without the worktree-local `dsh-translation-pairing` merge driver. Dual-side edits to bilingual documentation therefore leave every non-landing `*.i18n.yaml` as an ordinary merge conflict. The previous conflict policy aborted on those files even though [`pnpm run resolve-translation-pairing-conflicts`](../../../../package.json) can rebuild a safe record from the merged owner blobs.

## Decision

Before the upstream merge, the sync workflow installs dependencies with `--ignore-scripts` and registers the pairing merge driver so Git can compose clean pairing-record merges without installing Lefthook hooks. When a merge still stops with unresolved `*.i18n.yaml` entries (and no other unresolved paths), the workflow runs `pnpm run resolve-translation-pairing-conflicts` and stages the regenerated records. Landing-page files keep the existing `merge=ours` policy. Owner Markdown conflicts and resolver rejections still abort the sync. Operator-facing wording lives in [`AGENTS.downstream.md`](../../../../AGENTS.downstream.md); the [automatic pairing merges decision](../process/2026-08-08-automatic-translation-pairing-merges.md) still owns the driver algorithm.

## Alternatives considered

**Take ours or theirs for every conflicted `.i18n.yaml`.** Either parent names pre-merge owner hashes, so the committed record would disagree with the merged Markdown and fail the pairing gate.

**Regenerate with `verify-translation-pairing --write` on the worktree.** That confirms whatever bytes are present, including drifted translations. The merge-time resolver recomposes confirmations already present in both parents and refuses owner conflicts.

**Install Lefthook before the merge.** `pre-merge-commit` would run on the Actions checkout and can reject an otherwise clean merge commit. `--ignore-scripts` plus an explicit driver config supplies the merge driver without that hook.

## Consequences

Scheduled upstream sync continues when both sides only re-record or independently edit different parts of the same paired documents. A true documentation content conflict still stops automation for manual resolution. The later full `pnpm install` after `sync-version.mjs` remains the post-merge dependency refresh.
