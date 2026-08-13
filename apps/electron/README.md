# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This application packages the upstream DeepSeek Harness Web composition as a desktop application. Electron starts the built `dsh web` executable in its Node-compatible child mode, requests an operating-system-assigned loopback port, and opens the reported ready URL in a sandboxed window. The application keeps the upstream Web frontend, RPC transport, plugin composition, profiles, and `$DSH_HOME` storage behavior intact.

## Development

Use Node.js and pnpm versions declared by the repository. Build the upstream runtime before starting Electron:

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-electron start
```

Run the focused desktop test and compile the main process with:

```sh
pnpm --filter @deepseek-ai/dsh-electron test
pnpm --filter @deepseek-ai/dsh-electron build
```

## Packaging

The package configuration emits an NSIS installer on Windows, DMG and ZIP artifacts on macOS, and AppImage and DEB artifacts on Linux. CI builds unsigned artifacts because repository signing credentials are not required; operators who distribute trusted binaries can provide the platform signing environment supported by `electron-builder`.

The application version mirrors [`apps/cli/package.json`](../cli/package.json). [`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) updates it after each upstream merge. An exact `release(dsh): <version>` commit whose CLI manifest declares the same version becomes a desktop release; a manual dispatch may name a matching historical version from before the desktop baseline. The workflow applies the Electron overlay to that exact upstream commit so later unreleased changes cannot enter the installers. [`desktop-release.yml`](../../.github/workflows/desktop-release.yml) validates the resulting tag before publishing artifacts.

## Runtime and security

The child process binds only to `127.0.0.1` on a random port. The renderer has no Node.js integration, runs with context isolation and Chromium sandboxing, receives no permission grants, and cannot navigate away from the local Harness origin. HTTP and HTTPS links requested as new windows open in the system browser.

The Electron process stores Harness profiles and state below its platform-specific application data directory. Agent shell commands use the current user's home directory as their initial workspace; users can select another workspace through the Harness UI.
