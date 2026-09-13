[中文](README.md) | English

# decisions/ — Architecture Decision Records (ADRs)

Holds **why important design decisions were made**: why this option won among the reasonable alternatives.

- Admission (all four must hold): multiple reasonable options existed; long-term architectural impact; compatibility or maintenance cost; future readers will need to know why it was designed this way. Never for implementation details.
- Naming `ADR-NNNN-short-title.md` (lowercase kebab-case); numbers are unique and never reused; superseded ADRs are marked `Superseded` with a link to the successor — never rewritten to hide history.
- Required sections: Status, Date, Context, Decision, Alternatives Considered, Consequences, Related Documents; skeleton in [`.agent/templates/adr.md`](../../.agent/templates/adr.md).

## Index

| ADR | Status | Topic |
| --- | --- | --- |
| [ADR-0001](ADR-0001-graph-lane-not-owned-by-branch.md) | Accepted | Graph lanes are not owned by branches |
| [ADR-0002](ADR-0002-graph-lane-cap-max-three-lanes.md) | Accepted | The Graph view renders at most 3 lanes |
