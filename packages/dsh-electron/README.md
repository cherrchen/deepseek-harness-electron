# Public DSH ecosystem plugins

English | [中文](README.zh.md)

Packages under this downstream-owned namespace island are standard DSH/Cordis plugins mirrored from their canonical repositories with Git subtree. The canonical repository is the npm release source; this monorepo copy validates integration against the synchronized Harness source.

`@dsh-electron/dsh-plugin-*` names portable or Desktop-aware product features. The publisher scope does not imply an Electron requirement. Portable behavior may depend only on upstream DSH services; an optional native enhancement uses a child `ctx.inject(['desktop'], ...)` fiber and a package-local structural interface for the exact methods it consumes.

`@dsh-electron/dsh-electron-*` names Desktop-required adapters and infrastructure. Those packages belong under `apps/electron/runtime/plugins/`, not in this directory. Electron-required portable UI infrastructure that Desktop always mounts, such as `@dsh-electron/dsh-client-ui-details-host`, is a git subtree under `apps/electron/runtime/plugins/`, not a member of this island.

Each subtree package owns one npm version and one set of Host and Client artifacts used unchanged by Native DSH and Electron. Do not introduce Electron imports, preload globals, Electron provider dependencies, `workspace:` publication ranges, or a second Desktop-specific package variant here.

Emergency integration fixes made in this mirror must be split to a review branch in the canonical plugin repository before the downstream change lands. Upstream sync stops if upstream claims `packages/dsh-electron`; maintainers must decide ownership instead of letting automation overwrite either source.
