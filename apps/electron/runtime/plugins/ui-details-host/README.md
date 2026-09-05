# dsh-client-ui-details-host

English | [中文](README.zh.md)

Portable DSH/Cordis Client plugin that turns the AppFrame details column into a multi-tab Right Workspace Dock. The package is `platform:web` UI infrastructure with no Electron, Node, or Desktop dependency. The npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

This repository is the canonical source. [DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) mirrors it with git subtree and mounts Details Host as required built-in infrastructure. The same package runs unchanged in DeepSeek Harness Desktop and in a standard DSH Web host.

## DSH compatibility

This `develop` branch targets **DeepSeek Harness `v0.1.2`** (including [`dsh-v0.1.2-alpha.4`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.4)).

For **DeepSeek Harness [`v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/v0.1.1-rc.2)**, use the [`main`](https://github.com/cherrchen/dsh-client-ui-details-host/tree/main) branch instead.

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

`dsh plugin add` activates the bundled `cordis.patch.yml` layer, which inserts the plugin row into the composed configuration. No manual `cordis.yml` edit is required.

The Client half resolves through the package `exports["./client"]` entry. Peer dependencies (`@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-client-ui-renderer`, `@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-conversation`, and React) must already be present in the host composition.

## User experience

Loading Details Host does not open the details column. The upstream DetailsPanel remains visible until a consumer calls `ctx.shellDetails.open()` or the user toggles the dock from the conversation header.

Once the dock takes over, the column chrome is a tab bar plus a surface body. Every `open()` creates or reuses a tab, tabs close individually (a `+` button opens the Launcher), and the dock stays mounted until Details Host itself unloads. Closing the last tab reveals the Launcher instead of restoring the upstream panel. Hiding the dock (header toggle) preserves tabs and Launcher state; showing it again re-materializes them.

An App Details Toggle button is contributed into the `conversation.session.header.utilities` slot. It reflects the measured dock width (a `data-pressed` aria state) and toggles visibility: opening with live tabs restores them, opening on an empty dock reveals the Launcher, and closing only hides the column.

## Public API

### `ctx.shellDetails`

The Client plugin provides `ctx.shellDetails`, a `ShellDetailsController` with `apiVersion` `3` and the full `features` set (`tabs`, `launcher`, `tabClose`, `dockVisibility` on top of the v2 set). Import types and constants from `@dsh-electron/dsh-client-ui-details-host/client`.

| Method / property | Role |
|---|---|
| `open(id)` | Open a registered surface as a tab (compatibility overload; returns void). |
| `open({ surfaceId, payload?, navigation? })` | Preferred open form. Creates a new tab, or reactivates the existing tab matching the surface `dedupeKey`, and opens the dock. Returns the instance. |
| `close()` | Close the active tab. Closing the last tab reveals the Launcher; the dock stays mounted. Idempotent. |
| `closeTab(instanceId)` | Close a specific tab; the neighbor/MRU tab becomes active. |
| `activate(instanceId)` | Bring a tab to the front and hide the Launcher. |
| `showLauncher()` | Show the Launcher page and open the dock. |
| `back()` / `canGoBack()` | MRU compatibility face of tab navigation: reactivate the most recently active other tab. |
| `toggle(id)` | Open `id` as a tab when inactive; close the active tab when it already is. |
| `toggleDock()` | Header-toggle entry point: hide the dock, or reveal retained tabs / the Launcher. |
| `registerSurface(descriptor)` | Optional lifecycle and dedupe metadata for a surface id. |
| `registerLauncher(contribution)` | Register a Launcher card; returns a disposer. |
| `getSnapshot()` / `subscribe()` | Reactive state (`tabs`, `activeInstanceId`, `launcherVisible`, `dockVisible`) for `useSyncExternalStore`. |

Key slot constants: `DETAILS_SURFACE_SLOT` (`shell.details.surface`), `DETAILS_HEADER_ACTIONS_SLOT` (`shell.details.header.actions`), and `CONVERSATION_HEADER_UTILITIES_SLOT` (`conversation.session.header.utilities`, where the built-in App Details Toggle mounts as entry `dsh-electron.details-toggle`).

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

A surface descriptor may declare `dedupeKey(payload)` (tab identity for reuse) and per-tab `closable` (default `true`; non-closable tabs render without the close control). Surface bodies render inside an error boundary: a crashing surface degrades to a styled fallback instead of taking the dock down.

### Header actions

The active surface's plugin may contribute controls to `shell.details.header.actions` (rendered trailing the tab strip, pinned right; the area never shrinks and tabs compress instead of displacing it). Actions are icon-only buttons: render them with the host primitive `DetailsHeaderAction` so size, radius, hover, tooltip, and accessible naming stay uniform across plugins:

```tsx
import { DetailsHeaderAction } from '@dsh-electron/dsh-client-ui-details-host/client'

<DetailsHeaderAction icon={<IconRefreshOutline16 />} label="Refresh Git status" onTrigger={refresh} />
```

`label` is the single source for both the tooltip text and the button's `aria-label`; it is never rendered as visible button text.

### Launcher contributions

The Launcher is rendered from a contribution registry — the host hardcodes no cards. Feature plugins register cards that open their own surfaces:

```ts
ctx.shellDetails.registerLauncher({
  id: 'example.card',
  pluginId: 'example',
  title: 'Example',
  icon: <Glyph />,            // optional ReactNode
  description: 'Open Example', // optional
  order: 10,                   // optional, ascending
  when: () => true,            // optional visibility predicate
  open: () => ({ surfaceId: 'example.alpha' }),
})
```

With no live tabs the dock shows the Launcher; without any contribution it shows an empty state.

### Composition rules

The Host plugin is an empty Loader seat. The Client plugin requires `slots`, `layout`, `sessions`, and `locale`.

`open()` validates the surface, resolves the tab (create-or-reuse via `dedupeKey`), registers DetailsHost into the single `details` slot at a lower shadowing priority than the upstream occupant, verifies DetailsHost won the cell, commits the tab, and then calls `ctx.layout.openDetails()`. Missing or duplicate surface ids, and takeover conflicts, throw typed errors and roll back.

Each session keeps an in-memory tab list (bounded at 20 tabs; the oldest closable tab is evicted) plus its Launcher visibility and MRU stack. Panel geometry stays with `ctx.layout`; this package only owns the registry, tabs, Launcher, and the dock chrome. Dock visibility is measured by the mounted host itself (a `ResizeObserver` on the column) and reported through the snapshot, so no `ui-layout` changes are needed.

Unloading a surface closes its tabs; unloading Details Host releases takeover and restores the upstream occupant. Switching sessions swaps to that session's own tabs and Launcher state.

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

- **`navigation: 'replace'` is currently ignored** — every open creates-or-reuses a tab; explicit replace semantics are deferred until a consumer needs them.
- **Memory-only session state** — tabs, Launcher state, and MRU history are cleared on process restart; there is no localStorage, IndexedDB, or file persistence.
- **Windows Desktop caption clearance** — when the host document root carries `data-dsh-desktop-platform="win32"`, the dock tab bar increases top padding so it clears the Window Controls Overlay. Other platforms keep the default padding.
- **Launcher card copy follows the contribution** — the host renders the `title`/`description` strings supplied by each plugin; it does not localize them.
