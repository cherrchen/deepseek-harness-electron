# `@dsh-electron/dsh-plugin-git`

English | [中文](README.zh.md)

A standard DSH/Cordis Git plugin with one portable Host service, one Client bundle, and optional Desktop enhancement. The package runs unchanged in Native DSH and DeepSeek Harness Desktop; the npm scope identifies its publisher, not a runtime requirement.

## Composition

The Host plugin requires `ctx.subprocess`, provides `ctx.git`, and starts Git with an executable plus separate argv values. It never invokes a shell. Its optional Connection child registers the loopback `/git` RPC channel when a DSH Web Host is present; the Git service remains active in headless compositions without Connection.

The Client plugin requires the upstream Connection, locale, runtime, layout, and Sidebar plugins. It contributes a source-control action to `sidebar.footer.action` and a repository panel to `shell.overlay`. Business components receive a controller through slot injection and do not access Cordis context.

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

## Model Experience

None, as this package contributes a human-facing repository service and Client UI without registering model tools or prompt content.

#### KV Cache effect

None. The package does not add, replace, or retain model-request tokens.

## Known Limitations and Deferred Work

- **Local repositories only** — all operations run through the configured DSH subprocess execution world; remote repository and hosting-provider workflows are not implemented.
- **Bounded command output** — a diff larger than `maxOutputBytes` retains only the subprocess collector's tail, so deployments handling very large diffs must raise that validated setting.

## Development

Use Node.js `^22.19` or `>=24` with pnpm 11. The standalone repository owns its dependency lockfile and runs the same package tests and bundle configuration used by the DeepSeek Harness subtree.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```
