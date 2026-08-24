# `@dsh-electron/dsh-client-ui-details-host`

English | [中文](README.zh.md)

A standard DSH/Cordis Client plugin that hosts one active details surface in the AppFrame details column. The package is portable `platform:web` UI infrastructure: it has no Electron, Node, or Desktop dependency. The npm scope identifies its publisher, not a runtime requirement.

## Composition

The Host plugin is an empty Loader seat. The Client plugin requires `slots`, `layout`, and `sessions`, and provides `ctx.shellDetails`. Loading the plugin does not occupy `details`; the upstream DetailsPanel remains the winner until `open()` succeeds.

`ctx.shellDetails.open(id)` registers DetailsHost into the single `details` slot at a lower shadowing priority than the upstream occupant, declares `shell.details.surface`, waits for that id to materialize, and then calls `ctx.layout.openDetails()`. A missing id disposes the takeover before the throw so the third column cannot render empty. Switching to another registered id keeps DetailsHost mounted and does not close the column. `close()` is idempotent: it closes the column, clears the active id, and disposes takeover so the upstream occupant returns.

Other Client plugins contribute surfaces with declaration-aware injection:

```ts
ctx.slots.inject('shell.details.surface', () =>
  ctx.slots.register({
    name: 'shell.details.surface',
    id: 'example.alpha',
    label: 'Example Alpha',
  }, ExampleSurface))
```

The first release keeps N registered surfaces and 0 or 1 active surface. It does not implement split panes, navigation history, payload routing, pinning, or persistence. Panel geometry stays with `ctx.layout`.

Unloading the active surface, switching the current session, a surface render crash, or unloading Details Host all close takeover and restore the upstream occupant. After a later reload, `slots.inject()` rematerializes contributions against a new declaration lifetime.

## Development

Use Node.js `^22.19` or `>=24` with pnpm 11. This repository is the canonical source; DeepSeek Harness Desktop mirrors it with git subtree.

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

- **Single active surface** — only one `shell.details.surface` id renders at a time; split, stacked, or pinned details columns are not implemented.
- **No payload routing** — `open(id)` selects a registered contribution and does not pass arguments into the surface.
