# ADR-0002: Fail-closed compliance control paths

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Engineering Lead, Compliance Officer
- **Governance-impacting:** Yes
- **Regulatory anchor:** UAE FDL 20/2018 Art.18 (CDD); Cabinet Decision 10/2019 (STR); SOC 2 CC6.1 (logical access); FATF Methodology

## Context

In a compliance platform, the cost of a control that **fails open** (grants
access, permits egress, returns a decision) under error is categorically worse
than one that fails closed (denies, holds for review). An outage, a missing key,
a parse failure, or an unexpected exception must never be able to leak regulated
data, skip screening, or tip off a subject.

This record captures the standing decision behind several invariants in
[`CLAUDE.md`](../../CLAUDE.md) so the rationale is auditable and any future
relaxation is a visible, owned reversal.

## Decision

Every compliance-critical control path fails closed:

1. **Auth** — `enforce(req)` defaults to `requireAuth: true`; anonymous callers
   on regulated routes receive `401`. Opting out (`requireAuth: false`) is
   forbidden on routes handling regulated data.
   (`web/lib/server/enforce.ts`)
2. **Egress / tipping-off** — a missing `ANTHROPIC_API_KEY`, an LLM failure, or a
   parse failure returns `held_review`, **never** `allowed`. Returning
   `allowed: true` on any error path is forbidden.
   (`web/lib/server/egress-check.ts`)
3. **Four-eyes** — `signOff()` re-reads the record under write lock before an
   approval decision; in-memory state is never trusted (TOCTOU protection).
   (`web/lib/server/four-eyes-gate.ts`)
4. **JWT** — pinned to HS256; `alg: none` and non-HS256 tokens are rejected.
   (`web/lib/server/jwt.ts`)

## Consequences

- Under degradation the platform is **safe by default**: it denies, holds, or
  errors rather than leaking or approving.
- These paths are enforced in CI: dedicated CodeQL queries fail the build on a
  missing `enforce` call (`missing-enforce-call.ql`) and on egress returning
  `allowed` on error (`egress-allowed-on-error.ql`); the auth-coverage gate and
  the adversarial-probe suite exercise them at runtime.
- Any change that would let one of these paths fail open is a governance
  reversal requiring a superseding ADR and a recorded committee decision.
- Availability trade-off accepted: a hard dependency outage degrades to
  `held_review` / `401` rather than silent allow — the correct posture for
  regulated data.

## Alternatives considered

- **Fail-open with alerting** — unacceptable for regulated data; a leaked
  tipping-off or a skipped screen cannot be undone by an after-the-fact alert.
  Rejected.
- **Best-effort degraded mode** — introduces ambiguous partial states that are
  hard to audit and easy to exploit. Rejected in favour of an explicit
  `held_review` terminal state.
