[中文](README.md) | English

# reference/ — Stable technical reference

Holds **stable, look-up-when-needed technical facts**: internal APIs, schemas, protocols, formats, and configuration reference material.

- Keep: mechanistic references (data flow, format contracts, algorithm behavior) — content evolves with the code while the structure stays stable.
- Exclude: decision rationale (→ [`../decisions/`](../decisions/README.md)), requirements (→ [`../requirements/`](../requirements/README.md)), one-off debugging (→ [`../troubleshooting/`](../troubleshooting/README.md)).
- Documents here are not bilingual by mandate; empty `.en.md` stubs are forbidden.

## Entries

- [git-graph-layout.md](git-graph-layout.md) — Git Graph Layout Engine: the DAG → Layout → Renderer data flow, lane semantics, pagination continuation, renderer contract, and topology invariants.
