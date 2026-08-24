# Agent Note: Electron runtime plugin client bundles emit automatic JSX

Status: implemented

English | [中文](2026-08-25-electron-runtime-plugin-automatic-jsx.zh.md)

## Problem

Electron rebuilds runtime plugin Client artifacts with [`build-runtime-plugins.mjs`](../../../../apps/electron/scripts/build-runtime-plugins.mjs). esbuild's default JSX transform is classic `React.createElement` unless the nearest `tsconfig.json` sets `jsx: react-jsx`. Details Host's package `tsconfig.json` is a solution file with `"files": []` and no `jsx` setting, and [`DetailsHost.tsx`](../../../../apps/electron/runtime/plugins/ui-details-host/src/client/DetailsHost.tsx) has no React value import. The built `lib/client.js` therefore calls `React.createElement` while `React` is not in scope. First render throws `ReferenceError: React is not defined`; the slot error boundary abdicates DetailsHost; the upstream DetailsPanel remains the `details` winner. Git's composer chip still works because its Client bundle is prebuilt with automatic JSX. Clicking that chip still calls `ctx.shellDetails.open('git')`, so the third column opens, but its header is the DetailsPanel empty copy rather than Git. Brand and Plugin Manager hide the same builder default because each has `src/client/tsconfig.json` extending `tsconfig.runtime-client.json`. The [required portable UI infrastructure](../architecture/2026-08-24-electron-required-portable-ui-infrastructure.md) decision still owns why Electron rebuilds Details Host from subtree source.

## Decision

`buildClientHalf` sets `jsx: 'automatic'` on the esbuild client build so every runtime plugin Client bundle emits `react/jsx-runtime` regardless of the nearest `tsconfig.json`. The fixture builder in [`runtime-plugins.spec.ts`](../../../../apps/electron/tests/runtime-plugins.spec.ts) uses the same option. Focused Electron tests pin the builder option and that the production Details Host `lib/client.js` requires `react/jsx-runtime` and does not emit `React.createElement`. `react/jsx-runtime` remains a baseline client external.

## Alternatives considered

**Add `import React from 'react'` to `DetailsHost.tsx`.** Classic JSX would then find `React` in that file. Any later runtime-plugin TSX without a nearby `jsx: react-jsx` tsconfig and without a React value import would throw the same `ReferenceError` on first render.

**Add `src/client/tsconfig.json` to Details Host, matching Brand.** esbuild would pick up `react-jsx` for this package. The builder would still default to classic JSX for any plugin whose nearest `tsconfig.json` is a solution file or otherwise omits `jsx`.

**Load Details Host's standalone tsdown Client artifact instead of rebuilding it with the runtime plugin builder.** Electron's runtime plugin inventory rebuilds Host and Client from subtree source with one builder. Special-casing one package splits that inventory.

## Consequences

A consumer `open(id)` that registers DetailsHost renders the hosted column after the rebuilt `lib/client.js` is loaded. Coverage is the built Client artifact, not a headed Electron window. Git remains an ecosystem consumer of `ctx.shellDetails`; this change does not add Git-specific Details Host APIs.
