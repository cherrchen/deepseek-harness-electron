# Git plugin development

This directory mirrors the canonical `cherrchen/dsh-plugin-git` repository. Keep it independently installable and publishable: package dependencies use registry semver ranges, never `workspace:`.

The Host core depends only on standard DSH services and launches `git` through `ctx.subprocess` with separate argv values. Never add shell interpolation, Electron imports, preload globals, or a dependency on a Desktop provider.

The Client main fiber contains every portable contribution. Native enhancement belongs in a child `ctx.inject(['desktop'], ...)` fiber and declares only the structural methods it consumes. Provider unload must remove the enhancement without removing the core UI.

Use machine-readable Git output and temporary repositories in tests. Keep GitHub and remote credential workflows outside this package until a separate decision adds them.
