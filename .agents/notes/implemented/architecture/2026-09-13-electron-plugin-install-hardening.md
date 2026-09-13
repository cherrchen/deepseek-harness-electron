# Agent Note: Electron hardens web-profile installs without changing upstream pnpm workspace defaults

Status: implemented

English | [中文](2026-09-13-electron-plugin-install-hardening.zh.md)

## Problem

Upstream `PROFILE_PNPM_WORKSPACE` cannot gain Desktop-only `strictDepBuilds` / `allowBuilds` without changing `packages/boot`. Electron linked only distribution plugins at startup, so a profile hot plugin whose symlink was missing stayed unloadable until an enable callback. `install()` treated an exit-0 command with unchanged dependencies as success, so `--force` empty installs looked complete.

## Decision

Electron ensures `$DSH_HOME/profiles/web/pnpm-workspace.yaml` at startup and before every `dsh plugin` spawn. It keeps CLI-written `packages` / `nodeLinker` / `autoInstallPeers`, forces `strictDepBuilds: true`, and merges a reviewed `allowBuilds` seed (`esbuild: true`; `@google/genai`, `protobufjs`, and `node-addon-require-builtin` false) without dropping user keys. Third-party plugin natives are not auto-approved. Blocked-build diagnostics point at that file.

`install()` fails when `exitCode === 0` and no dependency names changed. `reinstall` and `update --force` still refresh without a new dependency key.

Startup walks every catalog entry with `activationMode === 'hot'` and an existing `rootPath` and runs `ensureSymlink` into both profile and electron `node_modules`. Pending reconcile reuses that entry.

## Alternatives considered

**Patch `PROFILE_PNPM_WORKSPACE` in `packages/boot`.** Rejected because Desktop must not modify upstream boot.

**Approve every native that pnpm prints.** Rejected because that would trust unreviewed third-party install scripts.

## Consequences

Focused tests cover workspace merge, missing-file write, empty install failure, and the hot-plugin symlink sweep. Upstream CLI and boot trees stay unmodified.
