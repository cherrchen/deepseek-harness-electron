---
description: "Portable Git repository operations and Client UI for DeepSeek Harness Desktop and standard DSH Web profiles."
kind: "package-bundle"
---

# dsh-plugin-git

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Standard DSH/Cordis Git plugin with one portable Host service, one Client bundle, and optional Desktop enhancement. The package runs unchanged in DeepSeek Harness Desktop and in a standard DSH Web host; the npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

**Requires the upstream right sidebar.** This package targets DeepSeek Harness ≥ v0.1.5-rc.2, whose Client UI ships the right sidebar (`@deepseek-ai/dsh-client-ui-sidebar-right`). Git registers three sidebar tab types through the standard two-stage path and navigates through `ctx.sidebarRight`; without the right sidebar the Client half cannot load. The third-party Details Host plugin is deprecated and no longer depended on.

[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) pre-installs this plugin and mirrors this repository with git subtree. Users may disable Git from the Plugins settings; the right sidebar is an upstream built-in.

<a id="table-of-contents"></a>
## Table of Contents

- [DSH compatibility](#dsh-compatibility)
- [Installation](#installation)
- [Pairing with the upstream right sidebar](#pairing-with-sidebar-right)
- [User experience](#user-experience)
- [Composition](#composition)
- [Configuration](#configuration)
- [Git operations](#git-operations)
- [npm publication](#npm-publication)
- [Development](#development)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="dsh-compatibility"></a>
## DSH compatibility

This `develop` branch targets **DeepSeek Harness `v0.1.5`** (right-sidebar tab-type API baseline `0.1.5-rc.2`).

<a id="installation"></a>
## Installation

The package is in experimental development. A public npm release under `@dsh-electron/dsh-plugin-git` is planned; until then, install from this repository.

**DeepSeek Harness Desktop** — Git is pre-installed and enabled by default. Disable it from **Settings → Plugins** when you do not need repository UI.

**DSH Web** — the right sidebar ships with DeepSeek Harness ≥ v0.1.5-rc.2; install Git alone:

```sh
dsh plugin --profile web add github:cherrchen/dsh-plugin-git
```

For local development, build this checkout and add it to the profile:

```sh
pnpm install
pnpm build
dsh plugin --profile web add /path/to/dsh-plugin-git
```

Each `dsh plugin add` activates the package's bundled `cordis.patch.yml` layer. The Git client requires the host to already provide the `ctx.sidebarRight` and `ctx.sidebarRightTabs` services at load time.

<a id="pairing-with-sidebar-right"></a>
## Pairing with the upstream right sidebar

Git joins the tab-type system through the upstream right sidebar's standard two-stage registration. The Client manifest declares the service dependency only:

```json
{
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-ui-sidebar-right"
      ]
    }
  }
}
```

Dynamic client plugins may not import runtime values from another plugin package — only `import type` — so the type references erase completely from the bundle and no `external` entry is needed.

**Stage one** — `ctx.sidebarRightTabs.register(definition)` registers three tab types: `git.changes` and `git.graph` are page types (opened by kind, one tab per pane) that each contribute one guide entry (Changes `order: 10`, Graph `order: 11`), replacing the old Details launcher cards on the guide page; `git.diff` is a resource type with pattern `dsh-resource://git/diff/**`, a `canOpen` that validates the address decodes, and a title taken from the decoded file name.

**Stage two** — each type's body component injects the `sidebar.right.pane.tab` seat under the definition's `id`; bodies read `{ address, params, revision }` from `useTabInfo().tab.navigation`.

Unified navigation converges on `ctx.sidebarRight`:

```text
ctx.sidebarRight.openTab('git.changes')
ctx.sidebarRight.openResource('dsh-resource://git/diff/<encodeURIComponent(path)>/<staged|worktree>', { params: { path, staged } })
ctx.sidebarRight.openTab('git.graph')
```

A diff tab's identity is its exact address: re-opening the same file and comparison side reveals the existing tab and bumps its `revision` (the body refetches on it), while a staged and a working-tree diff of one file are two addresses and sit side by side. Changes and Graph dedupe per pane by kind, owned by the sidebar. The changed-files indicator, the branch chip, and the guide entries open `git.changes`; clicking a file row opens the `git.diff` for that path.

Parameter typing augments the sidebar:

```ts
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    git: GitDiffPayload
  }
}
```

Repository controls (refresh / reveal) render inside each Git frame through a local component. The tab bar, the guide page, docking geometry, and panel width are owned by the right sidebar (built on ui-dockkit), not this package.

<a id="user-experience"></a>
## User experience

In the conversation composer, Git contributes a branch selector and a changed-files indicator on the left of the input area. Clicking either control opens `git.changes` as a right-sidebar tab. Creating a branch opens a shared conversation Modal; after `git init` with no commits (unborn HEAD), the menu shows the symbolic default branch as disabled, explains that the first commit is required, and disables create until HEAD exists.

The **Changes** surface shows the current branch beside refresh, then a single-line auto-growing commit message field with a wand **Generate** control and a split **Commit** button (Commit, Amend, Commit & Push, Commit & Sync). Staged, unstaged, and untracked paths follow as icon-action sections: plus or minus toggles the index, undo discards after a two-step confirm, and a porcelain letter badges the row. Clicking a path opens the matching diff. The **Diff** surface shows refresh in the top-right and renders one file's working-tree or staged diff per tab. The **Graph** surface shows Auto / All / First parent beside refresh, then the commit history as a canvas-drawn lane graph — one continuous coordinate space, so rails and merge edges never break at row boundaries — with subject, author, date, hash, and HEAD/branch/tag decoration badges, paged incrementally with a load-more control. When the host exposes an LLM runtime, a staged diff is sent to the session model — or to a custom provider/model configured under **Settings → Plugins → Plugin configuration → Git** — and the streamed suggestion is written into the editable input. That same card also edits the generation system message. Generation never stages, commits, or pushes anything. On Electron, optional Desktop enhancement adds reveal-in-folder and open-path actions when the Desktop provider is present.

<a id="composition"></a>
## Composition

The Host plugin requires `ctx.subprocess`, provides `ctx.git`, and starts Git with an executable plus separate argv values. It never invokes a shell. When a DSH Web Host is present, an optional Connection child registers the loopback `/git` RPC channel.

The Client plugin requires Connection, locale, renderer, conversation UI, primitives, session UI, and the upstream right sidebar (`ctx.sidebarRight` / `ctx.sidebarRightTabs`, type-only imports). Business components receive a controller and `openDetails()` through slot injection and do not access Cordis context.

When `ctx.settingsScope` is present, the Client also registers a card into **Settings → Plugins → Plugin configuration** under the `git-commit-message` namespace. The card is absent in hosts that do not serve that namespace.

The Client main fiber does not require `desktop`. A child `ctx.inject(['desktop'], ...)` fiber accepts only `shell.showItemInFolder`, `shell.openPath`, and `notification.show`; without them, repository, status, diff, stage, commit, and branch operations remain available and native actions are not shown.

No runtime invariant companion is published because Cordis owns the service, RPC registration, and child-fiber lifetimes this package uses.

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `executable` | `git` | Git executable name or absolute path resolved by `ctx.subprocess`. |
| `maxOutputBytes` | 8 MiB | Per-stream collection cap for one Git command. |
| `graceMs` | 3000 | Managed subprocess termination grace period. |
| `commitMessage.provider` | — | Provider route registered with the DSH LLM runtime. Required when `commitMessage.mode` is `custom`. |
| `commitMessage.model` | — | Model id resolved by the provider route. Required when `commitMessage.mode` is `custom`. |
| `commitMessage.mode` | inherit | `inherit` uses the host session model; `custom` pins `provider`/`model`. |
| `commitMessage.systemPrompt` | built-in | System prompt for commit-message generation. Empty/absent uses the package default. |
| `commitMessage.maxDiffBytes` | 48 KiB | Staged-diff byte cap applied before the generation prompt is built (validated minimum 1024). |

The whole `commitMessage` section is optional and is also the `git-commit-message` settings namespace. Edit it from **Settings → Plugins → Plugin configuration → Git**, or as a composition entry. When the host exposes no LLM runtime, or no session model and no custom route resolve, commit message generation is unavailable and the Client reports `git/generation-unavailable`.

<a id="git-operations"></a>
## Git operations

The first release supports repository discovery, Git version, current branch and HEAD, staged/unstaged/untracked status, local branches, working and staged diffs, stage/unstage, commit, amend, push to `origin`, rebase-then-push sync, branch creation, and branch switching. Status uses porcelain v2 with NUL path separators; branches use `for-each-ref`; every caller-supplied path, branch, and message remains one argv value.

Discard restores one staged, unstaged, or untracked change, including an addition or rename edited after staging, through explicit index, worktree, and clean operations. It is destructive: the Client always asks for a second, explicit confirmation before sending the RPC, and the surface names the path in the confirm body.

Commit history is read with a paged `git log` (`GIT_LOG_FORMAT`, one commit per line, fixed field count) so the Graph surface appends older commits incrementally through a load-more control instead of materializing the whole history.

Commit message generation is opt-in at the host: it needs an LLM runtime and a resolvable model (the session default, or a custom `provider`/`model`). A staged diff (capped by `commitMessage.maxDiffBytes`) is sent to that route and the streamed suggestion is written into the editable commit message input. The system prompt defaults to a Conventional Commit instruction and can be overridden from Plugin configuration. Generation is suggestion-only — it never stages, commits, or pushes anything.

GitHub authentication, hosting-provider workflows, credential prompts, issues, pull requests, stash, cherry-pick, and merge-conflict editing remain outside this package. Push and sync invoke `git push` / `git pull --rebase` as separate argv values and surface Git's own errors when remotes or credentials are missing.

<a id="npm-publication"></a>
## npm publication

The package will publish to npm as `@dsh-electron/dsh-plugin-git`. Publication is not available yet; treat API and versioning as pre-release. The UI host is the upstream built-in right sidebar; no separately installed third-party pairing package is required.

<a id="development"></a>
## Development

Use Node.js `^22.19` or `>=24` with pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

<a id="model-experience"></a>
## Model Experience

None, as this package registers no model tools, prompt sections, or request context.

#### KV Cache effect

None. Commit-message generation is an independent Host LLM request and does not add, replace, or retain session tokens.

## Known Limitations and Deferred Work

- **No credential UI** — push and sync call Git with no prompt for remotes or credentials; a missing `origin` or rejected auth fails as a Git command error.
- **Bounded command output** — a diff larger than `maxOutputBytes` retains only the subprocess collector's tail, so deployments handling very large diffs must raise that validated setting.
- **Generation needs host + model** — commit message generation requires a host LLM runtime and a resolvable model (session default or a custom route in Plugin configuration); without either, the Generate action stays disabled or reports `git/generation-unavailable`.

<a id="dev-note"></a>
### Dev Note

None.
