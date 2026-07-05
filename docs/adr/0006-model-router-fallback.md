# ADR-0006: Multi-provider model router with cost fallback

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Engineering Lead, Data Science Lead
- **Governance-impacting:** Yes
- **Regulatory anchor:** UAE FDL 10/2025 (AI governance, model accountability); ISO/IEC 42001

## Context

AI inference is on the critical path for compliance narratives and reasoning.
Relying on a single provider creates an availability and cost risk, but adding
providers must not weaken governance: every model that can produce a regulated
output has to be inventoried, risk-tiered, and approved, and the fail-closed
egress posture must hold regardless of which provider served the request.

## Decision

We will route inference through a governed model router
(`src/integrations/model-router.ts`) with **Anthropic Claude as primary and Groq
as a cost/availability fallback**, under these constraints:

- Every routable model is an entry in `MODEL_REGISTRY`
  (`web/lib/server/ai-governance.ts`) with `riskTier`, `approval`, and `cardRef`
  populated (invariant #9). A model absent from the registry is not routable.
- The compliance charter and prompt-hash integrity apply identically across
  providers — a `SYSTEM_PROMPT` change is tracked in the manifest regardless of
  provider (FDL 10/2025 Art.18).
- Fallback changes **provider, not policy**: egress fails closed to
  `held_review` on any provider failure (ADR-0002); the audit entry records the
  model actually used.

## Consequences

- Inference survives a single-provider outage and controls cost, without a
  governance gap.
- Adding/retiring/re-tiering a model is a governance decision requiring a
  registry update and (per GOVERNANCE.md §2) a recorded committee decision.
- The audit chain attributes each decision to the concrete model/provider, so
  post-hoc review can distinguish primary vs fallback outputs.
- Slightly higher operational complexity (two providers, two model cards) is
  accepted for resilience.

## Alternatives considered

- **Single provider** — simpler but a single point of failure for a critical
  path; rejected.
- **Ungoverned failover** — routing to any available model without registry
  gating; rejected as it would bypass model accountability.
