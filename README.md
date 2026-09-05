---
description: "Portable Git repository operations and Client UI for DeepSeek Harness Desktop and standard DSH Web profiles."
kind: "package-bundle"
---

# dsh-plugin-git

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Standard DSH/Cordis Git plugin with one portable Host service, one Client bundle, and optional Desktop enhancement. The package runs unchanged in DeepSeek Harness Desktop and in a standard DSH Web host; the npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

**Requires Details Host.** Install and enable `@dsh-electron/dsh-client-ui-details-host` before this package. Git contributes a `shell.details.surface` and opens it through `ctx.shellDetails`; without Details Host the Client half cannot load.

[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) pre-installs this plugin and mirrors this repository with git subtree. Users may disable Git from the Plugins settings; Details Host remains a required built-in.

<a id="table-of-contents"></a>
## Table of Contents

- [DSH compatibility](#dsh-compatibility)
- [Installation](#installation)
- [Pairing with Details Host](#pairing-with-details-host)
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

This `develop` branch targets **DeepSeek Harness `v0.1.2`** starting with [`v0.1.2-alpha.4`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.4).

For **DeepSeek Harness [`v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/v0.1.1-rc.2)**, use the [`main`](https://github.com/cherrchen/dsh-plugin-git/tree/main) branch instead.

<a id="installation"></a>
## Installation

The package is in experimental development. A public npm release under `@dsh-electron/dsh-plugin-git` is planned; until then, install from this repository.

**DeepSeek Harness Desktop** — Git is pre-installed and enabled by default. Disable it from **Settings → Plugins** when you do not need repository UI.

**DSH Web** — install Details Host first, then Git:

```sh
# 1. Details Host (required dependency)
dsh plugin --profile web add github:cherrchen/dsh-client-ui-details-host

# 2. Git plugin
dsh plugin --profile web add github:cherrchen/dsh-plugin-git
```

For local development, build each checkout and add it to the profile:

```sh
pnpm install
pnpm build
dsh plugin --profile web add /path/to/dsh-client-ui-details-host
dsh plugin --profile web add /path/to/dsh-plugin-git
```

Each `dsh plugin add` activates the package's bundled `cordis.patch.yml` layer. Install Details Host before Git so `ctx.shellDetails` is available when the Git client loads.

Until `@dsh-electron/dsh-client-ui-details-host` is on npm, local development in this repository uses the pinned fixture tarball under `tests/fixtures/`.

<a id="pairing-with-details-host"></a>
## Pairing with Details Host

Git is the reference consumer of Details Host. The Client manifest wires the dependency explicitly:

```json
{
  "dsh": {
    "client": {
      "inject": [
        "@dsh-electron/dsh-client-ui-details-host"
      ],
      "external": [
        "@dsh-electron/dsh-client-ui-details-host/client"
      ]
    }
  }
}
```

`external` ensures the module table materializes the Details Host Client factory before this bundle `require`s it. `inject` declares `ctx.shellDetails` as a runtime dependency.

Git ships three independent surfaces — `git.changes`, `git.diff`, and `git.graph` — one Details Host tab each, and opens them through the unified `ctx.shellDetails.open(...)` create-or-reuse navigation:

```text
ctx.shellDetails.open({ surfaceId: 'git.changes' })
ctx.shellDetails.open({ surfaceId: 'git.diff', payload: { path, staged: false } })
ctx.shellDetails.open({ surfaceId: 'git.graph' })
```

Surface descriptors declare `dedupeKey`s so repeated opens converge on one tab: changes and graph key on the current workspace path (`git:changes:<workspacePath>`, `git:graph:<workspacePath>`); diff keys on path plus comparison side (`git:diff:<path>:<staged|worktree>`), so a staged and a working-tree diff of one file can sit side by side. The changed-files indicator and Launcher cards open `git.changes`; clicking a file row opens `git.diff` for that path.

Payload typing augments Details Host:

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    'git.changes': GitChangesPayload
    'git.diff': GitDiffPayload
    'git.graph': GitGraphPayload
  }
}
```

Git also registers two Launcher cards (Changes, Graph) through `ctx.shellDetails.registerLauncher`, plus header actions for every surface. AppFrame details geometry, the tab bar, the Launcher, and dock visibility are owned by Details Host, not this package.

<a id="user-experience"></a>
## User experience

In the conversation composer, Git contributes a branch selector and a changed-files indicator on the left of the input area. Clicking either control opens the `git.changes` surface as a Details Host tab. Creating a branch opens a shared conversation Modal; after `git init` with no commits (unborn HEAD), the menu shows the symbolic default branch as disabled, explains that the first commit is required, and disables create until HEAD exists.

The **Changes** surface groups staged, unstaged, and untracked paths into sections; rows stage, unstage, or discard (a two-step destructive confirm) a path and open the matching diff. The **Diff** surface renders one file's working-tree or staged diff per tab. The **Graph** surface shows the commit history as an SVG lane graph with subject, author, date, hash, and HEAD/branch/tag decoration badges, paged incrementally with a load-more control. A commit region inside Changes accepts an editable message and offers **Generate**: when the host exposes an LLM runtime and `commitMessage` is configured, a staged diff is sent to the configured provider and the streamed suggestion is written into the editable input. Generation never stages, commits, or pushes anything. On Electron, optional Desktop enhancement adds reveal-in-folder and open-path actions when the Desktop provider is present.

<a id="composition"></a>
## Composition

The Host plugin requires `ctx.subprocess`, provides `ctx.git`, and starts Git with an executable plus separate argv values. It never invokes a shell. When a DSH Web Host is present, an optional Connection child registers the loopback `/git` RPC channel.

The Client plugin requires Connection, locale, renderer, conversation UI, primitives, session UI, and Details Host. Business components receive a controller and `openDetails()` through slot injection and do not access Cordis context.

The Client main fiber does not require `desktop`. A child `ctx.inject(['desktop'], ...)` fiber accepts only `shell.showItemInFolder`, `shell.openPath`, and `notification.show`; without them, repository, status, diff, stage, commit, and branch operations remain available and native actions are not shown.

No runtime invariant companion is published because Cordis owns the service, RPC registration, and child-fiber lifetimes this package uses.

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `executable` | `git` | Git executable name or absolute path resolved by `ctx.subprocess`. |
| `maxOutputBytes` | 8 MiB | Per-stream collection cap for one Git command. |
| `graceMs` | 3000 | Managed subprocess termination grace period. |

<a id="git-operations"></a>
## Git operations

The first release supports repository discovery, Git version, current branch and HEAD, staged/unstaged/untracked status, local branches, working and staged diffs, stage/unstage, commit, branch creation, and branch switching. Status uses porcelain v2 with NUL path separators; branches use `for-each-ref`; every caller-supplied path, branch, and message remains one argv value.

GitHub authentication, remotes, fetch/pull/push UX, issues, pull requests, stash, rebase, cherry-pick, merge-conflict editing, and credential management are outside this package.

<a id="npm-publication"></a>
## npm publication

The package will publish to npm as `@dsh-electron/dsh-plugin-git`. Publication is not available yet; treat API and versioning as pre-release. Details Host must remain a separate installed dependency.

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

None, as this package contributes a human-facing repository service and Client UI without registering model tools or prompt content.

#### KV Cache effect

None. The package does not add, replace, or retain model-request tokens.

## Known Limitations and Deferred Work

- **Local repositories only** — all operations run through the configured DSH subprocess execution world; remote repository and hosting-provider workflows are not implemented.
- **Bounded command output** — a diff larger than `maxOutputBytes` retains only the subprocess collector's tail, so deployments handling very large diffs must raise that validated setting.

<a id="dev-note"></a>
### Dev Note

None.
