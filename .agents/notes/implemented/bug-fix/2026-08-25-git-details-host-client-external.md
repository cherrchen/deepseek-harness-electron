# Agent Note: Git client declares Details Host as a module-table request

Status: implemented

English | [中文](2026-08-25-git-details-host-client-external.zh.md)

## Problem

Git's Client factory value-imports `DETAILS_SURFACE_SLOT` from `@dsh-electron/dsh-client-ui-details-host/client`. The standalone tsdown config leaves that specifier as a `require`. `dsh.client.inject` is an informational package-name edge and does not populate the boot graph's `external` list. `ClientModuleSystem.import` therefore materializes Git without first arriving Details Host, and the synchronous factory `require` misses the module table. Desktop reports `Failed to load plugins` for `@dsh-electron/dsh-plugin-git`. The [required portable UI infrastructure](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.md) decision still owns why Details Host is a runtime plugin row; the [shared modules](../../../../packages/client/AGENTS.md#shared-modules-and-the-module-graph) rule still owns why a non-baseline value import needs `dsh.client.external`.

## Decision

Git's `dsh.client.external` lists the exact import specifier `@dsh-electron/dsh-client-ui-details-host/client`. The client-modules Host then places Details Host ahead of Git and registers Details Host's factory before Git's factory `require`s it. [`verify-client-packages`](../../../../scripts/verify-client-packages.ts) reads Details Host's runtime-plugin manifest so that request has a supplier. Package tests pin the declaration; the Client artifact still externalizes Details Host rather than inlining it.

## Alternatives considered

**Inline `'shell.details.surface'` in Git and drop the value import.** Git would load without a module-table edge. Cordis `shellDetails` inject and `slots.inject` would still wait for Details Host. The slot name would be duplicated away from the package that owns it.

**Mark Details Host `immediately: true`.** Parser preload would register Details Host earlier, but Git's factory `require` still needs a graph `external` edge; `inject` does not create one.

## Consequences

Desktop plugin boot materializes Details Host's Client factory before Git's. Coverage is the Git `dsh.client.external` declaration, the client-packages supplier graph, and the built Client artifact's remaining `require` of that specifier. Git still does not add Details Host APIs.
