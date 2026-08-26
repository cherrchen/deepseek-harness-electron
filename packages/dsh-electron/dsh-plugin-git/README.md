# dsh-plugin-git

English | [中文](README.zh.md)

Standard DSH/Cordis Git plugin with one portable Host service, one Client bundle, and optional Desktop enhancement. The package runs unchanged in DeepSeek Harness Desktop and in a standard DSH Web host; the npm scope `@dsh-electron/` identifies the publisher, not a runtime requirement.

**Requires Details Host.** Install and enable `@dsh-electron/dsh-client-ui-details-host` before this package. Git contributes a `shell.details.surface` and opens it through `ctx.shellDetails`; without Details Host the Client half cannot load.

[DeepSeek Harness Desktop](https://github.com/cherrchen/deepseek-harness-electron) pre-installs this plugin and mirrors this repository with git subtree. Users may disable Git from the Plugins settings; Details Host remains a required built-in.

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

Git registers surface id `git`, optional payload tabs (`changes`, `diff`, `commit`), and opens the column with:

```ts
ctx.shellDetails.open({
  surfaceId: 'git',
  payload: { tab: 'changes' },
})
```

Payload typing augments Details Host:

```ts
declare module '@dsh-electron/dsh-client-ui-details-host/client' {
  interface DetailsSurfacePayloadMap {
    git: { tab?: 'changes' | 'diff' | 'commit'; path?: string }
  }
}
```

AppFrame details geometry, resize handle, and close button are owned by Details Host, not this package.

## User experience

In the conversation composer, Git contributes a branch selector and a changed-files indicator on the left of the input area. Clicking either control opens the Git details surface in the third column. Creating a branch opens a shared conversation Modal; after `git init` with no commits (unborn HEAD), the menu shows the symbolic default branch as disabled, explains that the first commit is required, and disables create until HEAD exists.

Inside the panel, users can review staged, unstaged, and untracked changes, inspect diffs, stage or unstage paths, write commit messages, and switch or create local branches. On Electron, optional Desktop enhancement adds reveal-in-folder and open-path actions when the Desktop provider is present.

## Composition

The Host plugin requires `ctx.subprocess`, provides `ctx.git`, and starts Git with an executable plus separate argv values. It never invokes a shell. When a DSH Web Host is present, an optional Connection child registers the loopback `/git` RPC channel.

The Client plugin requires Connection, locale, runtime, conversation UI, primitives, and Details Host. Business components receive a controller and `openDetails()` through slot injection and do not access Cordis context.

The Client main fiber does not require `desktop`. A child `ctx.inject(['desktop'], ...)` fiber accepts only `shell.showItemInFolder`, `shell.openPath`, and `notification.show`; without them, repository, status, diff, stage, commit, and branch operations remain available and native actions are not shown.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `executable` | `git` | Git executable name or absolute path resolved by `ctx.subprocess`. |
| `maxOutputBytes` | 8 MiB | Per-stream collection cap for one Git command. |
| `graceMs` | 3000 | Managed subprocess termination grace period. |

## Git operations

The first release supports repository discovery, Git version, current branch and HEAD, staged/unstaged/untracked status, local branches, working and staged diffs, stage/unstage, commit, branch creation, and branch switching. Status uses porcelain v2 with NUL path separators; branches use `for-each-ref`; every caller-supplied path, branch, and message remains one argv value.

GitHub authentication, remotes, fetch/pull/push UX, issues, pull requests, stash, rebase, cherry-pick, merge-conflict editing, and credential management are outside this package.

## npm publication

The package will publish to npm as `@dsh-electron/dsh-plugin-git`. Publication is not available yet; treat API and versioning as pre-release. Details Host must remain a separate installed dependency.

## Development

Use Node.js `^22.19` or `>=24` with pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

## Model Experience

None, as this package contributes a human-facing repository service and Client UI without registering model tools or prompt content.

#### KV Cache effect

None. The package does not add, replace, or retain model-request tokens.

## Known Limitations and Deferred Work

- **Local repositories only** — all operations run through the configured DSH subprocess execution world; remote repository and hosting-provider workflows are not implemented.
- **Bounded command output** — a diff larger than `maxOutputBytes` retains only the subprocess collector's tail, so deployments handling very large diffs must raise that validated setting.
