# Agent Note: Electron Windows Host hidden console

Status: implemented

English | [中文](2026-09-14-electron-windows-host-hidden-console.zh.md)

## Problem

The packaged Windows application opened a Windows Terminal window whenever an agent command such as `pwsh` ran. No process in the desktop chain owned a console, so Windows allocated a fresh console for each console-subsystem target created on that chain, and on Windows 11 a new console window is rendered by Windows Terminal.

The supervised Host was `electron.exe` in `ELECTRON_RUN_AS_NODE` mode. That variable selects Node.js behavior in the entry point; it does not change the PE subsystem, and `electron.exe` is a GUI-subsystem image, so `windowsHide` and `CREATE_NO_WINDOW` had no effect and the process could not hand a console to its descendants. The Host derived its own children from `process.execPath`, which kept the chain on GUI images: the job runner ([windows-job.ts](../../../../packages/subprocess/subprocess-local/src/windows-job.ts)), the ACL runner ([sandbox-local](../../../../packages/sandbox/sandbox-local/src/index.ts)), and the targets created by `CreateProcessW` / `CreateProcessAsUserW` without console flags ([win32-process](../../../../packages/subprocess/win32-process/src/process.ts)).

`CREATE_NO_WINDOW` is not a repair for the sandbox path on its own: a child under the restricted token dies during DLL initialization with `STATUS_DLL_INIT_FAILED` (`0xC0000142`) when it creates a console, and it instead shares its parent's console ([sandbox-windows-acl](../../../../packages/sandbox/sandbox-windows-acl/README.md)). The whole chain therefore has to be console-subsystem images and to inherit one hidden console from the Desktop.

## Decision

Windows releases ship the upstream Node.js `24.17.0` runtime as `resources/node/node.exe` and start the Host from it with `windowsHide: true`. `spawn` translates that option into `CREATE_NO_WINDOW`, so the console-subsystem Host receives a hidden console, and every job, ACL, plugin, and explicitly spawned target below it inherits that console. `process.execPath` inside the Host is `node.exe`, so the job runner and the ACL runner keep their existing launch code in `packages/` unchanged.

[`resolveHostRuntime`](../../../../apps/electron/src/runtime.ts) is the single resolution point for every dsh child the Desktop supervises: the supervised Host in [`startHarness`](../../../../apps/electron/src/main.ts) and the `dsh plugin` commands of [`createPluginCommandRunner`](../../../../apps/electron/src/plugin-install.ts). On Windows an explicit `DSH_ELECTRON_NODE_BINARY` replaces both packaged locations and must name an existing file; otherwise it resolves the packaged `resources/node/node.exe` and then the prepared `.electron-build/node/win-<arch>/node.exe`, and a Windows target with neither fails at startup with a message naming `pnpm --filter @dsh-electron/dsh-electron prepare:node` rather than falling back to Electron. Other platforms keep `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, and that environment reaches both the generated pnpm shim and the plugin command child, neither of which carries the variable on Windows.

[`prepare-node-runtime.mjs`](../../../../apps/electron/scripts/prepare-node-runtime.mjs) downloads `node-v24.17.0-win-<arch>.zip` plus Node.js `SHASUMS256.txt`, verifies the archive SHA-256 against the manifest, extracts `node.exe` into `.electron-build/node/win-<arch>/`, and copies it to the fixed `.electron-build/node/current/` path that `build.win.extraResources` references. It is idempotent per version and skips non-Windows targets, and `prepare:node` runs from `package`, `start`, and the release workflow's Windows matrix rows.

## Alternatives considered

**Add `windowsHide` to the Electron-as-node Host only.** `windowsHide` reaches the child as `CREATE_NO_WINDOW`, which a GUI-subsystem image ignores; `electron.exe` keeps creating children without a console, so the window still appears.

**Allocate a console from Electron, or park it in a helper process and attach the children to it.** The processes between Electron and the targets (job runner, ACL runner) are GUI images driven by `packages/` launch code that the Desktop does not own, and a process inherits its console at creation rather than by attaching to an ancestor's. `AllocConsole` also cannot hide the window it creates under Windows Terminal delegation.

**Add `CREATE_NO_WINDOW` to the ordinary spawn path in `packages/` only.** It leaves the default sandbox path uncovered, because a restricted token cannot initialize a new console, and it changes the upstream platform layer that this repository merges from upstream.

**Rewrite the PE subsystem byte of a copied `electron.exe` and launch that with `windowsHide`.** The copy already carries Electron's embedded Node.js, so no runtime download is needed, but it produces an unsigned, structurally modified executable; it remains a fallback only for a target that cannot publish Node.js beside the application.

## Consequences

The Host process image on Windows is `node.exe` instead of `electron.exe`; task manager shows it under that name. Supervision is unaffected: `stopHarness` terminates the child handle and the packaged dsh executable path is unchanged. One headless `conhost` stays resident for the Host lifetime, and the Windows installer grows by the unpacked `node.exe` (about 80 MB on disk, roughly 30–50 MB in the compressed installer). Windows now requires the prepared runtime at startup, which fails loudly instead of degrading.

Agent shell commands, plugin package commands, and cancellation behave exactly as before on Windows; the fix changes console ownership only. macOS and Linux keep the existing Electron-as-node Host, so their process topology, `pnpm start`, and plugin shim contents are unchanged.

## Testing

Unit tests cover the resolution branches of `resolveHostRuntime` with an injected existence probe, the hidden-console spawn options and absent `ELECTRON_RUN_AS_NODE` of the plugin command runner, the pnpm shim contents for both platforms, and the `build.win.extraResources` entry. The release workflow runs `prepare:node` on both Windows matrix rows before `electron-builder`, and `smoke-windows-installer.ps1` fails when an installed package lacks `resources\node\node.exe`.

No CI job can observe console windows, so the fix needs Windows acceptance: with the installed application, no console or Windows Terminal window appears at startup or during agent commands in the default `workspace-write` sandbox (including `pwsh -Command "git --version"` and nested `pwsh` → `node` → `cmd`), the same after switching to `danger-full-access`, cancellation and timeout of a long command leave no orphan `node.exe`, the tray restart stops and restarts the Host cleanly, and a plugin installation through the pnpm shim stays window-free. Out-of-workspace writes must still fail with `Access to the path ... is denied`, which confirms the restricted token was not weakened.
