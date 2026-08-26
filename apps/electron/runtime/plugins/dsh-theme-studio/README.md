# dsh-theme-studio

English | [中文](README.zh.md)

Portable DSH/Cordis plugin that overlays builtin color themes on the official Appearance preference. The package is `platform:web` with no Electron, Node, or Desktop dependency. The npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

This repository is the canonical source. [DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) mirrors it with git subtree under `apps/electron/runtime/plugins/dsh-theme-studio` and rebuilds Host and Client artifacts from source. The same package runs unchanged in Desktop and in a standard DSH Web host.

Stage 1 provides builtin theme browsing, preview, apply, persistence, and plugin lifecycle recovery. Theme Schema, import/export, and Theme Creator Agent are later stages.

## Installation

The package is in experimental development. A public npm release under `@dsh-electron/dsh-theme-studio` is planned; until then, install from this repository.

**DeepSeek Harness Desktop** — Theme Studio is required built-in. Desktop always mounts it from the runtime plugin inventory.

**DSH Web** — add the package to a profile after building `lib/`:

```sh
pnpm install
pnpm build
dsh plugin --profile web add .
```

Or install directly from GitHub:

```sh
dsh plugin --profile web add github:cherrchen/dsh-theme-studio
```

`dsh plugin add` activates the bundled `cordis.patch.yml` layer. Official Appearance (`Light` / `Dark` / `System`) stays owned by `dsh-client-ui-theme`. Theme Studio only adds **Settings → General → Themes**.

## User experience

Settings → General shows Appearance first (`order = 10`) and Themes below it (`id = themes`, `order = 20`).

- **Default** clears the Theme Studio overlay and shows the official theme.
- **Preview** is transient and is not written to settings.
- **Apply** persists `activeThemeId` in the Host `theme-studio` namespace.
- Changing Appearance still switches the official light/dark base; the active Theme Studio palette follows automatically.

Restarting the app restores the last applied theme. Unloading the plugin removes both overlay layers so ThemeRuntime returns to the official theme.

## Runtime model

Theme Studio does not present CSS itself. It calls `ctx.theme.overrideTokens()`:

```text
Official Light / Dark / System
        ↓
ACTIVE_SOURCE  (@dsh-electron/dsh-theme-studio:active)
        ↓
PREVIEW_SOURCE (@dsh-electron/dsh-theme-studio:preview)
        ↓
ThemeSnapshot → ThemePresenter → DOM
```

Host settings:

```text
ui-theme.preference          system | light | dark
theme-studio.activeThemeId   null | dsh-theme-studio.*
```

`null` is Default. Builtin ids include `dsh-theme-studio.graphite`, `.oled`, `.nordic`, `.paper`, and `.warm`.

## Composition

The Host plugin registers the `theme-studio` settings namespace when `ctx.settings` exists, and is a no-op otherwise. The Client plugin requires `theme`, `settingsScope`, `slots`, `locale`, `connection`, and `remote`. Headless profiles load only the Host half and do not boot the browser UI.

## npm publication

The package will publish to npm as `@dsh-electron/dsh-theme-studio`. Publication is not available yet; treat API and versioning as pre-release.

## Development

Use Node.js `^22.19` or `>=24` with pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
```

## Model Experience

None, as this package contributes human-facing Client UI without registering model tools or prompt content.

#### KV Cache effect

None. The package does not add, replace, or retain model-request tokens.

## Known Limitations and Deferred Work

- **Builtin themes only** — Stage 1 does not import, export, or validate a public `.dsh-theme.json` schema.
- **No public `ctx.themeStudio` catalog** — Stage 3 owns cross-plugin discovery APIs.
- **No automated contrast certification** — builtin palettes are hand-checked for readability; WCAG claims wait for Stage 2 validators.
