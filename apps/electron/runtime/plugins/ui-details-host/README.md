# dsh-client-ui-details-host

English | [中文](README.zh.md)

Portable DSH/Cordis Client plugin that hosts one active details surface in the AppFrame details column. The package is `platform:web` UI infrastructure with no Electron, Node, or Desktop dependency. The npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

This repository is the canonical source. [DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) mirrors it with git subtree and mounts Details Host as required built-in infrastructure. The same package runs unchanged in DeepSeek Harness Desktop and in a standard DSH Web host.

## Installation

The package is in experimental development. A public npm release under `@dsh-electron/dsh-client-ui-details-host` is planned; until then, install from this repository.

**DeepSeek Harness Desktop** — Details Host is always enabled. No separate install step.

**DSH Web** — add the package to a profile after building `lib/`:

```sh
pnpm install
pnpm build
dsh plugin --profile web add .
```

Or install directly from GitHub:

```sh
dsh plugin --profile web add github:cherrchen/dsh-client-ui-details-host
```

Mount both Host and Client halves in `cordis.yml` (or the profile patch layer that owns your Web composition):

```yaml
plugins:
  - name: '@dsh-electron/dsh-client-ui-details-host'
```

The Client half resolves through the package `exports["./client"]` entry. Peer dependencies (`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-slots`, and React) must already be present in the host composition.

## User experience

Loading Details Host does not open the details column. The upstream DetailsPanel remains visible until a consumer calls `ctx.shellDetails.open()`.

End users see the AppFrame third column only after a feature plugin opens a registered `shell.details.surface`. Details Host supplies the column chrome (resize handle, close control, header actions) and routes the active surface body. Closing the column returns control to the upstream DetailsPanel.

## Public API

### `ctx.shellDetails`

The Client plugin provides `ctx.shellDetails`, a `ShellDetailsController` with `apiVersion` `2` and the full P2 `features` set. Import types and constants from `@dsh-electron/dsh-client-ui-details-host/client`.

| Method / property | Role |
|---|---|
| `open(id)` | Open a registered surface by id (compatibility overload). |
| `open({ surfaceId, payload?, navigation? })` | Preferred open form when the surface needs arguments or navigation mode. |
| `close()` | Close the column, clear session navigation, and restore the upstream occupant. Idempotent. |
| `back()` / `canGoBack()` | Restore the previous instance from the session back stack. |
| `toggle(id)` | Open when inactive; close when already active. |
| `registerSurface(descriptor)` | Optional lifecycle and dedupe metadata for a surface id. |
| `getSnapshot()` / `subscribe()` | Reactive state for `useSyncExternalStore`. |

Key slot constants: `DETAILS_SURFACE_SLOT` (`shell.details.surface`) and `DETAILS_HEADER_ACTIONS_SLOT` (`shell.details.header.actions`).

### Surface contributions

Other Client plugins register renderable surfaces with declaration-aware injection:

```ts
ctx.slots.inject('shell.details.surface', () =>
  ctx.slots.register({
    name: 'shell.details.surface',
    id: 'example.alpha',
    label: 'Example Alpha',
  }, ExampleSurface))

// ExampleSurface props include detailsInstance from PropsRuntime<'shell.details.surface'>
```

Optional payload typing uses declaration merging on the Client entry:

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    'example.alpha': { tab?: string }
  }
}
```

Unknown external surfaces and payloads remain supported without augmentation.

### Composition rules

The Host plugin is an empty Loader seat. The Client plugin requires `slots`, `layout`, and `sessions`.

`open()` validates the surface, creates a surface instance, registers DetailsHost into the single `details` slot at a lower shadowing priority than the upstream occupant, verifies DetailsHost won the cell, commits the instance, and then calls `ctx.layout.openDetails()`. Missing or duplicate surface ids, and takeover conflicts, throw typed errors and roll back. Switching to another registered id keeps DetailsHost mounted and does not close the column.

Each session keeps an in-memory active instance and bounded back stack (default `push`, optional `replace`, with `back()` and dedupe). Panel geometry stays with `ctx.layout`; this package only occupies `details` while a surface is open.

Unloading the active surface, switching the current session, a surface render crash, or unloading Details Host all close takeover and restore the upstream occupant.

## npm publication

The package will publish to npm as `@dsh-electron/dsh-client-ui-details-host`. Publication is not available yet; treat API and versioning as pre-release.

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

None, as this package contributes human-facing Client UI infrastructure without registering model tools or prompt content.

#### KV Cache effect

None. The package does not add, replace, or retain model-request tokens.

## Known Limitations and Deferred Work

- **Single active surface** — only one `shell.details.surface` instance renders at a time; split, stacked, or pinned details columns are not implemented.
- **Memory-only session state** — navigation history is cleared on process restart; there is no localStorage, IndexedDB, or file persistence.
