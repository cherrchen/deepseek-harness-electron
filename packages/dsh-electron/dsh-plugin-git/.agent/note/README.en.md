[中文](README.md) | English

# `.agent/note/` — Long-term knowledge for coding agents

This directory holds **project knowledge that coding agents need to remember across sessions**. It belongs to `.agent/` (agent working and context-engineering infrastructure), not the formal project knowledge base: any formal project fact with long-term value must land in the matching [`docs/`](../../docs/README.md) directory, never only here.

## Admission criteria

Only knowledge that satisfies **both** of the following:

1. Later agents are likely to need it; and
2. Re-discovering it through code archaeology (git history, branch diffs, dependency graphs) would be expensive.

Typical categories:

- Repository observations (branch topology, mirror/sync relationships, reasons behind directory conventions);
- Compatibility (upstream/downstream version coupling, pinned fixtures, workarounds);
- Upstream integration (host behavior assumptions, integration ordering constraints);
- Hidden coupling (cross-module dependencies not visible in code structure);
- Migration background (where historical baggage came from).

## Explicitly excluded

Chat logs, scratchpads, chain-of-thought, temporary TODOs, unverified guesses, one-off error records. Those belong to the session, not this directory.

## Rules

- File names in lowercase kebab-case;
- Formal documents here (except READMEs) are **bilingual by mandate**: `foo.md` (Chinese canonical) + `foo.en.md` (English secondary); on conflict the Chinese version wins;
- Run `pnpm docs:check` before committing;
- Maintenance rules live in [`.agent/skills/documentation/SKILL.md`](../skills/documentation/SKILL.md).

## Current entries

- [branch-and-mirror-layout.md](branch-and-mirror-layout.md) — branch topology and the subtree mirror relationship with the Desktop repository.
