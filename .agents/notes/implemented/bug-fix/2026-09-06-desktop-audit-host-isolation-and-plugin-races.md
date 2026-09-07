# Agent Note: Desktop audit fixes for Host isolation and plugin races

Status: implemented

English | [中文](2026-09-06-desktop-audit-host-isolation-and-plugin-races.zh.md)

## Problem

A desktop audit showed defects that existing suites did not pin. Renderer URLs with a scheme-relative path could send the Main Host cookie off loopback. Git mutations published snapshots after the workspace rebound, and a filename that is also Git pathspec magic could discard other files. An invalidated Graph request could leave its loading latch set, while delayed Diff, generation, and capability results could still replace newer state. A staged addition or rename edited after staging could not be discarded, and unstage could leave the deleted side of a rename in the index. Git output truncation could be parsed as a complete result. Porcelain v2 unmerged records absorbed an extra object hash into the path. Plugin install or enable work could still be running when Desktop drained Host for quit or update. Details Host pruned unloaded surfaces only on the current session, and its Launcher inject could retain entries after a plugin changed. The renderer WebSocket stand-in could not `send` on native fallback sockets. Host stdout stayed buffered and reparsed after the readiness handshake.

## Decision

`HarnessProxy` keeps every proxied HTTP URL on the ready loopback origin, as recorded in the [client and Host authentication note](2026-08-31-electron-alpha2-client-host-authentication.md). Git Client mutations capture the workspace generation and repository root, serialize overlapping RPCs, and publish success or failure only while that binding is current. Diff, graph, generation, and capability requests also capture a binding plus their own monotonic request id, so only the newest request can update state; a graph invalidation clears its loading latch so the surface can request a replacement. Git change actions carry the porcelain status, target path, and original rename path through the Client, RPC, and service; forced index removal discards staged additions and renames even after later working-tree edits, while rename unstage resets both paths. Git subprocesses reject lossy stdout or stderr instead of parsing a truncated result and set `GIT_LITERAL_PATHSPECS=1` so a selected path is one filename. Porcelain v2 `1` / `2` / `u` records take their path from the field the Git format documents, including names with spaces. `PluginMutationCoordinator.shutdown()` refuses later mutations and waits for the accepted queue; quit, relaunch, and update install share that drain. Details Host walks every retained session when a surface unloads or crashes, notifies `surface-unload` for those instances, publishes UI only for the current session, and re-checks contributions before restoring tabs. Launcher entries are published through the Details Host observable so registration and disposal update an already-mounted renderer. Non-Host WebSocket URLs return the native instance. Host stdout is forwarded for the process lifetime, but the readiness buffer is dropped once the URL is found or startup fails, and is capped beforehand.

## Alternatives considered

**Follow Host redirects in Main and drop cookies on a changed origin.** Rejected because the proxy has no product need to chase `Location`, and `redirect: 'manual'` already matches the custom-scheme path.

**Cancel in-flight Git RPCs when the workspace changes.** Rejected because the Host call cannot be aborted through the current Git RPC channel; ignoring stale snapshots is sufficient if queued work also skips after a generation bump.

**Identify a Diff only by path and staged state.** Rejected because a second request for the same file and side can supersede the first without changing either field.

**Keep Launcher cards in the slot inject result.** Rejected because the renderer caches that result; a contribution registry must publish its live list through an observable hook.

**Pass `:(literal)` only on discard.** Rejected because stage, unstage, and diff take the same user path and would keep the magic-pathspec hole.

**Keep `pluginLifecycle.list()` as the update drain.** Rejected because `list()` reads inventory and does not wait for `PluginMutationCoordinator`.

**Proxy native WebSocket `send` and `readyState` onto `DesktopWebSocketImpl`.** Rejected because returning the native instance preserves the standard object; a partial method copy is what left `send` bound to the Host-stream implementation.

## Consequences

Main remains the only process that can attach the Host cookie, and it can do so only to the ready loopback origin. Git Details actions cannot stage, commit, or discard in a repository the user is no longer viewing, a selected magic filename cannot expand to other paths, and stale asynchronous reads cannot replace a newer result or leave Graph permanently loading. Discard and unstage preserve both sides of complex Git changes, including confirmed discards after a staged path is edited, and incomplete Git output fails instead of presenting missing repository state. Plugin package changes finish or fail before Host is torn down. Uninstalling a Details surface cannot leave a later session switch looking at a removed contribution, and Launcher cards update after a plugin changes. Client plugins that open a non-mux WebSocket can send after `open`. Long-running Host logs no longer accumulate in Main for the handshake parser.

## Testing

Electron specs cover scheme-relative proxy URLs with a fake cookie, coordinator shutdown versus `list()`, native WebSocket `open`/`send`, and handshake buffer drop plus size cap. Git specs cover a deferred stage and Graph refresh, Diff across workspace bind, repeated Diff requests for the same file, staged additions and renames edited after staging, rename unstage, lossy output, a real `:(glob)*.txt` discard that leaves `other.txt` dirty, porcelain `u` records, and a real UU conflict path. Details Host specs open a tab in session A, switch to B, unload the surface, assert A restores no tab and receives `surface-unload`, and confirm Launcher registration and disposal publish to the mounted host.
