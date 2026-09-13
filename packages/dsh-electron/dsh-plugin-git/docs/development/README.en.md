[中文](README.md) | English

# development/ — Engineering practice

Holds **how this package is developed, tested, built, and released**: environment, workflow, testing conventions, build chain, and release process.

- Keep: toolchain versions, common commands, testing and fixture conventions, CI/CD notes, release process.
- Exclude: runtime behavior and configuration (→ root `README.md`), architecture design (→ [`../architecture/`](../architecture/README.md)), execution status of the release effort (→ [`../plans/active/`](../plans/active/README.md)).

## Quick entry

Toolchain: Node.js `^22.19.0 || >=24.0.0`, pnpm 11 (pinned via `packageManager`).

| Purpose | Command |
| --- | --- |
| Install (strict lockfile) | `pnpm install --frozen-lockfile` |
| Full test run | `pnpm test` |
| Build-artifact bundle/manifest assertions | `pnpm test:artifact` |
| Build (types + bundle) | `pnpm build` |
| Documentation machine check | `pnpm docs:check` |
| Set the version | `pnpm version:set <version>` |

Release status and details: the [npm-first-release plan](../plans/active/npm-first-release.md). CI runs in `.github/workflows/ci.yml` (tests on PRs and main pushes); the release workflow is `.github/workflows/release.yml`.

Testing conventions: machine-readable Git output and temporary repositories; client specs use jsdom + `@testing-library/react`; the Graph layout fixtures and invariants are described in [`../reference/git-graph-layout.md`](../reference/git-graph-layout.md#测试与-invariants).
