# Agent Note: Desktop release and executable classification

Status: implemented

English | [中文](2026-09-05-desktop-repository-test-classification.zh.md)
## Problem

Upstream release discovery includes downstream manifests with independent npm scopes and versions. Executable discovery also encounters four unclassified desktop maintenance scripts.

## Decision

The dsh release family excludes `apps/electron` and `packages/dsh-electron` alongside the existing experimental exclusion. Private-package version planning also excludes `packages/dsh-electron`. All remaining candidates retain strict upstream scope validation. The executable inventory classifies the four desktop version and sync scripts individually; other executables still require registration.

Python integration tests require a working CPython 3.10+ on PATH. An inactive mise shim is an environment configuration error; runtime validation remains strict.

## Alternatives considered

**Accept every npm scope.** This could publish or version downstream packages as part of the upstream family.

**Remove shebangs or exempt the desktop scripts directory.** Both weaken executable discovery and conceal new launchers.

**Fall back past a broken Python shim.** This silently changes the selected interpreter instead of correcting the environment.

## Consequences

Downstream releases retain independent membership and versions. These explicit exclusions and classifications require maintenance when downstream topology changes. Fixture tests cover retained upstream members, excluded desktop members, rejected foreign scopes, classified maintenance scripts, and rejected unknown desktop executables.
