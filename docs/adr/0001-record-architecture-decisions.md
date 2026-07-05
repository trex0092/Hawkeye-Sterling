# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Engineering Lead
- **Governance-impacting:** No
- **Regulatory anchor:** ISO/IEC 42001 (AI management system — documented decisions); UAE FDL 10/2025 Art.18 (auditability)

## Context

Hawkeye Sterling is a regulator-grade AML/CFT platform whose load-bearing design
choices (fail-closed auth, append-only audit, dual-secret JWT rotation,
fail-closed egress, four-eyes TOCTOU protection) are enforced as architecture
invariants in [`CLAUDE.md`](../../CLAUDE.md). The *reasoning* behind those
invariants has, until now, lived in commit messages, the README, and
conversation history — none of which is a durable, dated, owned record an
auditor can traverse.

Regulated software must be able to answer "why is it built this way, who decided,
and when?" for every significant control. That evidence needs to be immutable and
version-controlled.

## Decision

We will record every significant architectural and governance decision as an
**Architecture Decision Record** in `docs/adr/`, using the format in
[`0000-template.md`](./0000-template.md). ADRs are numbered sequentially,
immutable once `Accepted`, and superseded (never edited) when a decision changes.
The process is defined in [`docs/adr/README.md`](./README.md).

## Consequences

- Every load-bearing decision gains a dated, owned, immutable record — direct
  audit evidence for ISO 42001 and FDL 10/2025 Art.18.
- Contributors get the *why*, not just the *what*, reducing re-litigation of
  settled trade-offs.
- A small authoring cost is added to significant changes; routine work is
  explicitly exempt (see the README).
- Existing invariants are back-filled as ADRs (starting with ADR-0002 and
  ADR-0003) so the record is complete rather than forward-only.

## Alternatives considered

- **Keep decisions in commit messages / README** — not discoverable, not
  immutable, and easily diluted; rejected.
- **A wiki or external doc** — lives outside the audited repository and outside
  the CI/code-owner review gate; rejected.
