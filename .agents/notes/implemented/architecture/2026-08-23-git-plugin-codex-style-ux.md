# Agent Note: Git Plugin Codex-style UX

Status: implemented

English | [中文](2026-08-23-git-plugin-codex-style-ux.zh.md)

Branch selection belongs in the Composer because branch is part of the agent working context, not a separate app surface. Changes, diff, and commit stay in a right-side Git drawer because they are inspection and mutation tools for that context.

## Slot choices

- `conversation.input.left` hosts `GitBranchControl` (branch menu + changed-files indicator).
- `shell.overlay` hosts `GitDrawer` as a non-modal right-side panel.
- The plugin does not register `sidebar.footer.action` and no longer depends on `dsh-client-ui-sidebar`.
- The plugin does not occupy `details`; that slot remains owned by tool-call details in `ui-conversation`.

## Controller lifecycle

Repository discovery runs when the workspace path changes, independent of drawer visibility. Closing the drawer does not clear repository state. Async discover/status calls use a monotonic generation counter so stale responses cannot overwrite a newer workspace.

## Desktop remains optional

The portable client fiber registers composer control and drawer. Native reveal and commit notification stay in a child `ctx.inject(['desktop'], ...)` fiber.

## Out of scope for this change

Remote branches, fetch/pull/push, GitHub integration, stash, and merge/rebase UI remain deferred.
