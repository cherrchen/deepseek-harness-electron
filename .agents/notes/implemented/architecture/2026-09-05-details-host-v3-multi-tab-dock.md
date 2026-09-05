# Agent Note: Details Host v3 as a multi-tab right workspace dock

Status: implemented

English | [中文](2026-09-05-details-host-v3-multi-tab-dock.zh.md)

## Problem

Details Host v2 hosted exactly one active surface, closed it with one global close control, and forgot it on hide. The Git plugin needed three simultaneously reachable surfaces (changes, diff, graph) plus a way to discover them, and the only paths available were either upstream `apps/web` layout changes or a second downstream plugin that re-opened the host — both wrong. Detail surfaces also had no failure isolation: one broken plugin surface took down the dock.

## Decision

`@dsh-client-ui-details-host` (canonical `cherrchen/dsh-client-ui-details-host`, mirrored at `apps/electron/runtime/plugins/ui-details-host`) evolves to **API version 3**: an application-level multi-tab right workspace dock owned entirely inside the plugin.

* **Tabs, not a surface.** A registry-backed tab model creates or reuses tabs by `dedupeKey`, orders them by most-recent use for the back gesture, and evicts the oldest beyond a fixed limit. Closing is per tab; hiding the dock keeps tabs and their state alive. There is no global close anymore.
* **Launcher.** A registry-driven Launcher page (zero hardcoded cards) opens when the dock has no tabs; feature plugins contribute cards through `ctx.shellDetails.registerLauncher(contribution)`.
* **Isolation.** Every surface renders inside an error boundary, so a throwing occupant cannot take down the dock or the app frame.
* **Navigation.** One unified `details.open()` API replaces ad-hoc surface calls; payloads are typed through the existing `DetailsSurfacePayloadMap` declaration merge.
* **Toggle stays inside the host.** The details toggle registers into `conversation.session.header.utilities` from the Details Host package itself, and dock visibility is self-measured with a `ResizeObserver` on the host root — zero upstream changes.
* **Ownership stays split.** AppFrame owns layout and visibility, Details Host owns the registry, tabs, and Launcher, and plugins own only their domain surfaces. Neither AppFrame nor Details Host contains Git-specific code.

The Git plugin is the reference consumer: it contributes `git.changes`, `git.diff`, and `git.graph` surfaces plus two Launcher cards, and its peer range pins Details Host `>=0.3.0 <0.4.0`.

## Alternatives considered

**A separate downstream `ui-details-toggle` plugin.** Rejected: the toggle is host chrome, and a second plugin could not observe dock visibility without new upstream seams.

**Teaching the upstream `apps/web` layout store about the dock.** Rejected: `packages/**` is upstream-owned for downstream work; the ResizeObserver self-measurement reaches the same signal without touching it.

**Keeping one surface and letting Git render its own internal tabs.** Rejected: tab identity, dedupe, MRU ordering, and the Launcher are host concerns; re-implementing them per plugin multiplies the code and fragments the UX.

## Consequences

The public client API version moves from 2 to 3 in a breaking step; consumers pin `>=0.3.0 <0.4.0`. Tab state is in-memory only — hiding the dock preserves it, but reloading the client half does not. The tab limit is fixed, not configurable. Launcher card copy is plugin-provided and not localized yet. Directly requiring the client bundle outside the ModuleLoader host now works (the bundle falls back to plain CJS exports), which keeps fixture-driven tests honest in both the canonical repo and the monorepo.
