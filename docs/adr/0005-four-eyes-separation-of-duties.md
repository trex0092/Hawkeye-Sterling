# ADR-0005: Four-eyes control with separation of duties

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Compliance Officer, Engineering Lead
- **Governance-impacting:** Yes
- **Regulatory anchor:** Cabinet Resolution 134/2025 (four-eyes, SoD, senior-management accountability); Cabinet Decision 10/2019 (STR filing)

## Context

High-consequence compliance actions — SAR/goAML filing, AI-proposal override,
whitelist changes — must not be executable by a single actor. Cabinet Resolution
134/2025 requires four-eyes review and separation of duties. A correct four-eyes
control also has to resist a **time-of-check to time-of-use (TOCTOU)** race: an
approval decision made against stale in-memory state can be tricked into
approving a record that changed after it was read.

## Decision

We will gate high-consequence actions behind a four-eyes control with enforced
separation of duties (`web/lib/server/four-eyes-gate.ts`, `requireRole()` RBAC):

- The **maker cannot be the checker** — the approving identity must differ from
  the initiating identity.
- `signOff()` **re-reads the record under a write lock** immediately before the
  approval decision; in-memory state is never trusted (TOCTOU protection).
- Every four-eyes action writes an append-only audit-chain entry (see ADR-0003).
- Role gates: DELETE on sensitive operations is MLRO-only; CO+MLRO required for
  the whitelist POST authorisation path (per `COMPLIANCE_GAPS.md` CG-2).

## Consequences

- No single actor can file, override, or whitelist unilaterally — SoD is
  structurally enforced, not merely procedural.
- The re-read-under-lock step is mandatory; removing it reopens the TOCTOU race
  and is an invariant breach (see [`CLAUDE.md`](../../CLAUDE.md) #10).
- A small latency cost per approval (the locked re-read) is accepted in exchange
  for correctness under concurrency.
- Enforced by the four-eyes test suite and RBAC checks; changes require a
  superseding ADR and a recorded committee decision.

## Alternatives considered

- **Trust in-memory approval state** — fast but vulnerable to TOCTOU; rejected.
- **Advisory (non-blocking) second review** — does not satisfy the regulatory
  requirement that both approvals be binding; rejected.
