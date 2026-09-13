[中文](README.md) | English

# Project documentation

This directory is the **formal knowledge base of dsh-plugin-git**: long-lived, evolving project facts live here. `.agent/` is agent working and context-engineering infrastructure, not the knowledge base — a formal project fact with long-term value must be settled here, never only in `.agent/` or conversation history.

Core principle: **Documentation is part of the implementation** — documentation evolves with the code, and a change that fails `pnpm docs:check` is incomplete. Maintenance rules live in [`.agent/skills/documentation/SKILL.md`](../.agent/skills/documentation/SKILL.md).

## Document map

| Directory | Scope |
| --- | --- |
| [`requirements/`](requirements/README.md) | Product, functional and non-functional requirements, constraints |
| [`architecture/`](architecture/README.md) | Current architecture, target architecture, system design |
| [`decisions/`](decisions/README.md) | Architecture Decision Records (ADRs) |
| [`plans/`](plans/README.md) | Large implementation plans (`active/` in progress, `completed/` finished) |
| [`development/`](development/README.md) | Engineering practice: environment, workflow, testing, build, release |
| [`reference/`](reference/README.md) | Stable technical reference (API, schema, protocol, configuration) |
| [`troubleshooting/`](troubleshooting/README.md) | Recurring issues, symptoms, root causes, verified fixes |

## Ground rules

1. **Single Source of Truth**: every important project fact has exactly one canonical location; other documents link instead of copying; look for an existing document before creating a new one.
2. **Current vs. Future**: explicitly distinguish Current / Proposed / Target / Planned / Deprecated / Completed; never describe a desired design as an existing system; Current documents must be verifiable against the current repository.
3. **Bilingual**: `foo.md` is the Chinese canonical version, `foo.en.md` the English secondary — two views of one logical document; conflicts are settled in favor of Chinese. All READMEs are bilingual by mandate (the repository root keeps its existing `README.zh.md` pairing); ADRs / plans / reference documents are not, and empty `.en.md` stubs are forbidden.
4. **READMEs navigate only**: orientation / navigation / entry point; content belongs in dedicated documents.
5. **Naming and links**: lowercase kebab-case; relative links only inside the project; no temp-style names and no developer-machine absolute paths.
6. **Change implies documentation**: when a change affects requirements, architecture, interfaces, configuration, workflows, build/release, module boundaries, engineering decisions, or troubleshooting knowledge, update the canonical document within the same change; run `pnpm docs:check` before finishing.
