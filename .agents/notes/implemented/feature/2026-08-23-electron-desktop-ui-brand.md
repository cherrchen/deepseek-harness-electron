# Agent Note: Electron Desktop restores DeepSeek Harness brand slots locally

Status: implemented

English | [中文](2026-08-23-electron-desktop-ui-brand.zh.md)

## Problem

Upstream Web shells treat product branding as a deployment concern. Without occupants, `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` fall back to a fish mark plus a `DSH Local Build` label and commit badge; `@deepseek-ai/dsh-client-ui-brand-official` fills those holes only when the client artifacts were built with `DSH_CLIENT_BUILD_PROFILE=official`. DeepSeek Harness Desktop must show DeepSeek Harness branding for ordinary local and release builds without editing synchronized `packages/` sources or requiring every Desktop developer to run the official client build profile.

## Decision

`apps/electron/runtime/plugins/ui-brand-electron` ships as `@dsh-electron/dsh-electron-ui-brand`. Its browser half always injects the three brand slots with the same `FishLogo` / `BrandWordmark` artwork used by the official package, without reading `DSH_CLIENT_BUILD_PROFILE`. `apps/electron/runtime/host.patch.yml` mounts the plugin beside the other Desktop runtime plugins; discovery and `build:runtime-plugins` pick it up like any other inventory entry. Document title text remains the separate Electron Vite `DSH_CLIENT_TITLE` default (`DeepSeek Harness`).

## Alternatives considered

**Require `pnpm run build:official` for Desktop.** Rejected because Desktop packaging and day-to-day `pnpm build` would still show `DSH Local Build` unless every workflow switched profiles, and branding would stay coupled to Host client artifact env rather than the Desktop composition overlay.

**Patch upstream `ui-sidebar` fallbacks or force-register inside `packages/client/ui-brand-official`.** Rejected because the fork rule keeps product Desktop overrides in `apps/electron/**`.

**Set `DSH_CLIENT_BUILD_PROFILE` only in Electron Vite `define`.** Rejected because brand-official lives in Host-served dynamic `lib/client.js` bundles whose build-time env is already inlined; the Electron static shell define does not rewrite those plugins.

## Consequences

Desktop branding no longer depends on the upstream official client profile. When an official Host build also mounts `ui-brand-official`, both packages may occupy the same single slots; Desktop still owns the composition row that mounts its plugin. Focused Electron tests cover patch mounting, inventory discovery, profile gating absence, and slot registration teardown.
