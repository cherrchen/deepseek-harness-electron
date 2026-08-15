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

## Desktop integration

The main window uses a hidden title bar with a 40-pixel drag strip above the upstream Web UI. macOS keeps its traffic lights in that strip; Windows and Linux use Electron's Window Controls Overlay for native minimize, maximize, and close controls. Closing the main window hides it while the Harness process continues running. Use the tray menu to reopen the window or quit the application and stop the supervised process.

The native page context menu exposes cut, copy, paste, select all, and reload according to Chromium's current editing capabilities; development builds also expose DevTools. Clipboard writes are allowed only for the current loopback Harness origin, while clipboard reads and all unrelated renderer permissions remain denied. The application menu and tray menu provide the desktop-owned About window and manual update check.

The About window reads the repository URL from this package manifest, displays the packaged icon and version, and opens the project link in the system browser. Its renderer is sandboxed and its Content Security Policy admits only its embedded styles and icon.

## Updates

Packaged builds check GitHub Releases at startup and expose **Check for Updates…** in the application and tray menus. A discovered update downloads in the background. When the download finishes, a system notification and both menus offer a restart that stops the Harness child before `electron-updater` installs the release. Pass `--allow-prerelease-updates` to include GitHub pre-releases; without it, update checks stay on the stable channel.

`electron-builder` emits `latest.yml`, `latest-mac.yml`, architecture-specific Linux metadata, and blockmaps. The desktop release workflow merges per-architecture metadata before uploading it with the installers so one GitHub Release serves x64 and ARM64 clients. macOS auto-update installation requires signed packages; the repository's unsigned CI artifacts exercise metadata generation and download discovery but require signing credentials before trusted distribution.

## Packaging

The package configuration emits an NSIS installer on Windows, DMG and ZIP artifacts on macOS, and AppImage and DEB artifacts on Linux. The release workflow builds every format for x64 and ARM64 on native GitHub-hosted runners. CI builds unsigned artifacts because repository signing credentials are not required; operators who distribute trusted binaries must provide the platform signing environment supported by `electron-builder`.

The application version mirrors [`apps/cli/package.json`](../cli/package.json). [`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) updates the version and generated workspace dependencies after each upstream merge while retaining desktop-owned registry dependencies. An exact `release(dsh): <version>` commit whose CLI manifest declares the same version becomes a desktop release; a manual dispatch may name a matching historical version from before the desktop baseline. The workflow applies the Electron overlay to that exact upstream commit so later unreleased changes cannot enter the installers. [`desktop-release.yml`](../../.github/workflows/desktop-release.yml) validates the resulting tag before publishing artifacts.

## Runtime and security

The child process binds only to `127.0.0.1` on a random port. The renderer has no Node.js integration, runs with context isolation and Chromium sandboxing, receives no permission grants, and cannot navigate away from the local Harness origin. HTTP and HTTPS links requested as new windows open in the system browser.

The Electron process stores Harness profiles and state below its platform-specific application data directory. Agent shell commands use the current user's home directory as their initial workspace; users can select another workspace through the Harness UI.
