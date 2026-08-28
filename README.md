# DeepSeek Harness Desktop

English | [中文](README.zh.md)

DeepSeek Harness Desktop packages [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) as a native desktop application for macOS, Windows, and Linux. It keeps the upstream Web application, agent runtime, profiles, and workspace workflow while providing an operating-system window and desktop installers.

## Status

This project and its upstream runtime are in developer preview. Releases may introduce compatibility-breaking changes.

## Install

Download the installer for your platform from the [latest release](https://github.com/cherrchen/deepseek-harness-electron/releases/latest):

- macOS: DMG or ZIP for Apple Silicon and Intel Macs
- Windows: NSIS installer for x64 and ARM64
- Linux: AppImage or DEB package for x64 and ARM64

Open the installed application and complete the provider setup in the Harness UI before starting an agent session.

<a id="run"></a><a id="run-from-source"></a>

## Run from source

Install a supported Node.js version (`^22.19.0` or `>=24`) and pnpm, then build the Harness runtime and start Electron:

```sh
git clone https://github.com/cherrchen/deepseek-harness-electron.git
cd deepseek-harness-electron
pnpm install
pnpm run build
pnpm --filter @dsh-electron/dsh-electron start
```

## Runtime and data

Electron starts DeepSeek Harness on a random `127.0.0.1` port and opens its ready URL in a sandboxed window. The renderer has no Node.js integration, uses context isolation and Chromium sandboxing, and opens requested HTTP and HTTPS links in the system browser.

Harness profiles and state live in the platform-specific application-data directory. Agent shell commands start in the current user's home directory; select another workspace from the Harness UI when needed.

## Bundled plugins

DeepSeek Harness Desktop ships two portable DSH plugins from standalone canonical repositories. Both run unchanged in the desktop app and in a standard DSH Web host when installed separately.

| Plugin | Desktop role | Summary |
|---|---|---|
| [dsh-client-ui-details-host](https://github.com/cherrchen/dsh-client-ui-details-host) | Required built-in | Hosts one active details surface in the AppFrame third column through `ctx.shellDetails`. |
| [dsh-theme-studio](https://github.com/cherrchen/dsh-theme-studio) | Required built-in | Builtin color themes under **Settings → General → Themes**, overlaid on official Light / Dark / System Appearance. |
| [dsh-plugin-git](https://github.com/cherrchen/dsh-plugin-git) | Pre-installed (disable in **Settings → Plugins**) | Local Git status, diffs, staging, commits, and branch controls in the composer and details column. Requires Details Host. |

Canonical development happens in those repositories; this monorepo mirrors them with git subtree.

## Development

Run the desktop application's focused checks with:

```sh
pnpm --filter @dsh-electron/dsh-electron test
pnpm --filter @dsh-electron/dsh-electron build
```

See the [desktop application guide](apps/electron/README.md), [development guide](docs/development.md), and [architecture documentation](docs/architecture.md) for repository details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This fork follows upstream DeepSeek Harness development while maintaining its desktop packaging.

## License

[MIT](LICENSE). Third-party dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
