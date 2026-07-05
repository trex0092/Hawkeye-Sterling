# Architecture Decision Records (ADRs)

This directory holds the **Architecture Decision Records** for Hawkeye Sterling.
An ADR captures a single significant architectural or governance decision — the
context, the decision, and its consequences — so the *why* behind the system is
auditable from version control, not lost in chat history.

For a regulated AML/CFT platform this is a control in itself: reviewers,
auditors, and regulators can trace every load-bearing design choice to a dated,
owned, immutable record.

## When to write an ADR

Write one when a change:

- Establishes or reverses an **architecture invariant** (see [`CLAUDE.md`](../../CLAUDE.md)).
- Changes an auth, audit, egress, four-eyes, or AI-governance control path.
- Selects or replaces a core technology, model, or data store.
- Makes a trade-off future contributors would otherwise re-litigate.

Routine features, fixes, refactors, and docs do **not** need an ADR.

## Process

1. Copy [`0000-template.md`](./0000-template.md) to
   `NNNN-short-title.md` using the next free number.
2. Fill it in. Set status to `Proposed`.
3. Open a pull request. Governance-impacting ADRs additionally require a
   recorded committee decision per [`GOVERNANCE.md`](../../GOVERNANCE.md) §2.
4. On merge, set status to `Accepted`. ADRs are **immutable** once accepted —
   to change a decision, write a new ADR that supersedes the old one and update
   both `Status` lines (`Superseded by ADR-XXXX` / `Supersedes ADR-YYYY`).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-fail-closed-compliance-controls.md) | Fail-closed compliance control paths | Accepted |
| [0003](./0003-append-only-audit-chain.md) | Append-only dual-chain audit trail | Accepted |
| [0004](./0004-dual-secret-jwt-rotation.md) | Dual-secret JWT rotation | Accepted |
| [0005](./0005-four-eyes-separation-of-duties.md) | Four-eyes control with separation of duties | Accepted |
| [0006](./0006-model-router-fallback.md) | Multi-provider model router with cost fallback | Accepted |
| [0007](./0007-pii-redaction-llm-pipeline.md) | PII redaction in the LLM pipeline | Accepted |
| [0008](./0008-observability-noop-tracer-metrics.md) | No-op-safe tracing and family-grouped metrics | Accepted |
| [0009](./0009-content-frozen-charter-prompt-hash-integrity.md) | Content-frozen charter with prompt-hash integrity | Accepted |

_This index is maintained by hand — add a row when you accept a new ADR._

Together, ADRs 0002–0009 provide a dedicated record for each of the ten
architecture invariants in [`CLAUDE.md`](../../CLAUDE.md).
