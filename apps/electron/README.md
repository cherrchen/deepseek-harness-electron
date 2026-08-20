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

The native page context menu exposes cut, copy, paste, select all, and reload according to Chromium's current editing capabilities; development builds also expose DevTools. Clipboard writes are allowed only for the current loopback Harness origin, while clipboard reads and all unrelated renderer permissions remain denied. The application menu and tray menu provide the desktop-owned About window, update channel selection, and manual update check.

The tray uses packaged transparent DeepSeek glyphs instead of the full application icon. Windows and Linux select a black glyph for a light native theme and a white glyph for a dark native theme, and refresh it when Electron reports a theme change. macOS uses a packaged Template Image so the operating system controls menu-bar contrast.

The About window reads the repository URL from this package manifest, displays the packaged icon and version, and opens the project link in the system browser. Its renderer is sandboxed and its Content Security Policy admits only its embedded styles and icon.

## Updates

Packaged builds default to the **Pre-Release** channel and persist the selected channel in Electron's user-data directory. The application and tray menus can switch between **Pre-Release**, which receives the newest published prerelease or stable release, and **Stable / Release**, which uses GitHub's latest production release and never selects a prerelease. Channel selection uses GitHub Release metadata for tags such as `v0.1.0-beta.1`, `v0.1.0-rc.3`, and `v0.1.0`; `electron-updater` still owns metadata validation, semantic-version comparison, download, and installation.

The menus show checking and download progress, then offer a restart after the update is ready. Manual checks report whether no update exists or a download started. A failed check writes the complete error to the main-process log while its dialog contains only network and retry guidance.

`electron-builder` emits `latest.yml`, `latest-mac.yml`, architecture-specific Linux metadata, and blockmaps. The desktop release workflow merges per-architecture metadata before uploading it with the installers so one GitHub Release serves x64 and ARM64 clients. macOS auto-update installation requires signed packages; the repository's unsigned CI artifacts exercise metadata generation and download discovery but require signing credentials before trusted distribution.

## Packaging

The package metadata declares `DeepSeek Harness` as its product name, which Electron and `electron-builder` use for development chrome, application metadata, installers, and executables. The package configuration emits an NSIS installer on Windows, DMG and ZIP artifacts on macOS, and AppImage and DEB artifacts on Linux. The release workflow builds every format for x64 and ARM64 on native GitHub-hosted runners. CI builds unsigned artifacts because repository signing credentials are not required; operators who distribute trusted binaries must provide the platform signing environment supported by `electron-builder`.

Desktop releases use `v{a.b.c}-beta.{x}` on `develop`, `v{a.b.c}-rc.{x}` on `main`, and `v{a.b.c}` for stable releases. [`sync-upstream.yml`](../../.github/workflows/sync-upstream.yml) merges upstream into `develop`, synchronizes workspace dependencies, and publishes the next Beta tag. [`desktop-promote.yml`](../../.github/workflows/desktop-promote.yml) creates RC or Stable tags on `main` that match [`apps/cli/package.json`](../cli/package.json). Set the Electron manifest version with `pnpm electron:set-version <version>` before release commits. [`desktop-release.yml`](../../.github/workflows/desktop-release.yml) validates the tag branch and package version before publishing installers.

## Runtime and security

The child process binds only to `127.0.0.1` on a random port. The renderer has no Node.js integration, runs with context isolation and Chromium sandboxing, receives no permission grants, and cannot navigate away from the local Harness origin. HTTP and HTTPS links requested as new windows open in the system browser.

The supervised process receives `$DSH_HOME` as `.dsh` below the operating-system user home, so Harness profiles, settings, sessions, and other state use `~/.dsh` on macOS and Linux or `%USERPROFILE%\.dsh` on Windows. Electron keeps its Chromium data, caches, and desktop update preference in its platform-specific `userData` directory. Agent shell commands use the current user's home directory as their initial workspace; users can select another workspace through the Harness UI.
