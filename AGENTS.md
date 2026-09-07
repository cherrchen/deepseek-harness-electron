# Details Host plugin development

This directory mirrors the canonical `cherrchen/dsh-client-ui-details-host` repository. Keep it independently installable and publishable: package dependencies use registry semver ranges, never `workspace:`.

The plugin is portable `platform:web` Client UI infrastructure. Never add Electron imports, preload globals, `ctx.desktop`, `node:*`, or a dependency on a Desktop provider. Panel geometry stays with `ctx.layout`; this package only occupies `details` while a registered `shell.details.surface` is open.
