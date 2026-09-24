# Agent Note: Electron Windows proxy name folding

Status: implemented

English | [中文](2026-09-24-electron-windows-proxy-name-folding.zh.md)

## Problem

The `v0.1.5-beta.3` release could not be packaged. Both Windows rows of [desktop-release.yml](../../../../.github/workflows/desktop-release.yml) failed in `Test Electron runtime` while the macOS and Linux rows passed, because Windows resolves environment variable names case-insensitively while the Agent proxy policy controls nine names in two spellings each: `HTTP_PROXY` and `http_proxy`, `HTTPS_PROXY` and `https_proxy`, `ALL_PROXY` and `all_proxy`, `NO_PROXY` and `no_proxy`, and `NODE_USE_ENV_PROXY`.

The Host provider [desktop-network-subprocess](../../../../apps/electron/runtime/plugins/desktop-network-subprocess/src/index.ts) fills the names a non-forcing policy leaves unset from the launch environment layers, because the Host's inherited names point at the loopback Gateway and only Main's original values or the discovered `.env` layers can supply the Agent's opt-out environment. It looked every name up on its own, and [lookupKey](../../../../packages/util/launch-environment/src/index.ts) folds names on Windows, so the lookup for `http_proxy` returned the `user-env` layer's `HTTP_PROXY` entry. The policy's own `HTTP_PROXY` value and the filled `http_proxy` value then disagreed while denoting one Windows variable; Node writes both spellings into the child's environment block and the later key wins, so the Agent ran with the user layer's proxy instead of the value [environment.ts](../../../../apps/electron/src/network/environment.ts) had derived for it.

The same Windows rows failed [network-runtime-path.spec.ts](../../../../apps/electron/tests/network-runtime-path.spec.ts), which passes `platform: 'win32'` to [resolveNetworkRuntimePath](../../../../apps/electron/src/network/runtime-path.ts) and asserted POSIX paths. That helper joins the roots Electron reports on the running host, so on Windows both the packaged path and the missing-runtime error message carry backslashes.

## Decision

[`fillAgentProxyValues`](../../../../apps/electron/runtime/plugins/desktop-network-subprocess/src/index.ts) groups the nine policy names by the environment variable each denotes on the running platform and assigns one value per group: a group the policy sets keeps that value under every spelling, and a group it leaves unset takes the launch environment's value once. POSIX groups hold a single name, so `HTTP_PROXY` and `http_proxy` stay independent there and each is still filled from its own layer entry. A name whose policy value is a tombstone still clears the whole group.

`network-runtime-path.spec.ts` derives both expectations through `join` from `node:path`, matching the helper and the packaged path that [smoke-windows-installer.ps1](../../../../apps/electron/scripts/smoke-windows-installer.ps1) requires.

The Agent proxy policy and its launch-environment fallback remain the shipped design of [Electron-managed network settings](../../proposed/feature/2026-09-20-electron-managed-network-settings.md); this change corrects only how one variable's spellings are filled.

## Alternatives considered

**Fill every spelling independently, as shipped.** The folding lookup hands one Windows variable two different values, so the value the Agent receives depends on Node's environment-block key order instead of on the policy Main computed. This is the defect.

**Emit only the upper-case names on Windows from `agentProxyPolicyForHost`.** The producer cannot observe the Host platform, and the Host's fill re-adds the lower-case spelling through the same folding lookup, so the disagreement returns one layer later.

**Select `path.win32` or `path.posix` inside `resolveNetworkRuntimePath` from its `platform` option.** That option selects the packaged executable's name and extension; the roots always come from the running Electron (`process.resourcesPath`, `app.getAppPath()`), so the host path module is the one those roots belong to. A platform-selected join would make the helper construct paths that need not name a real file.

**Give the spec separate POSIX and Windows expectations behind a platform branch.** The assertions describe one behavior — the helper resolves inside the roots it was given — so the host path module expresses it without letting the two branches drift apart.

## Consequences

On Windows both spellings of each proxy variable reach the Agent child with equal values, so which key wins no longer changes the outcome. macOS and Linux are unaffected: their groups hold a single name each, and the fill assigns exactly what `??=` assigned before.

Windows Agent traffic in System and Manual modes now keeps the proxy Main derived from the ambient environment instead of the value a `.env` layer carries under the other spelling. A Windows layer that sets only `http_proxy` still supplies the variable, because the group lookup folds to it.

The path spec now depends on the host path module, so its expectations are backslash-separated on Windows by design rather than by accident.

## Testing

[network-agent-subprocess.spec.ts](../../../../apps/electron/tests/network-agent-subprocess.spec.ts) gains two cases that serialize the policy through the real producer and drive `fillAgentProxyValues` with an explicit platform: `win32` asserts that both spellings carry the policy's value, and `darwin` asserts that the two spellings stay independent. The integration case in the same file is the one Windows failed; it asserts the environment an Agent child actually observes, and the local macOS run keeps covering the platform this change does not alter.

Neither Windows row can run locally, so the fix is verified by re-running the two Windows rows of [desktop-release.yml](../../../../.github/workflows/desktop-release.yml) after the tag moves.

Coverage gap: [desktop-ci.yml](../../../../.github/workflows/desktop-ci.yml) runs `runtime.spec.ts` on `windows-latest` in the `Windows Host startup` job only, so the remaining `apps/electron/tests` specs reach Windows for the first time inside the release workflow, after a tag exists, where a failure blocks the release instead of the pull request.
