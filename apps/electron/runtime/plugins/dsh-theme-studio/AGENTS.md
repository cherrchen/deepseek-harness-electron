# Theme Studio plugin development

This directory mirrors the canonical `cherrchen/dsh-theme-studio` repository. Keep it independently installable and publishable: package dependencies use registry semver ranges, never `workspace:`.

The plugin is portable `platform:web`. Never add Electron imports, preload globals, `ctx.desktop`, `node:*`, or a dependency on a Desktop provider. Theme presentation stays with `ctx.theme`; this package only produces token overlays through `overrideTokens`.
