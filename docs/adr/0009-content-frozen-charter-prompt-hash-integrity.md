# ADR-0009: Content-frozen compliance charter with prompt-hash integrity

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Compliance Officer, Engineering Lead
- **Governance-impacting:** Yes
- **Regulatory anchor:** UAE FDL 10/2025 Art.18 (AI audit trail / integrity); FATF Methodology

## Context

Every AI-generated output is governed by a compliance charter
(`src/policy/systemPrompt.ts`) that forbids fabrication, legal conclusions,
tipping-off, allegation-to-finding upgrades, and opaque risk scoring (P1–P10).
The charter is only meaningful if it cannot be silently altered, paraphrased, or
bypassed — an undetected change to the system prompt is an undetected change to
the platform's regulatory behaviour. FDL 10/2025 Art.18 requires the AI decision
trail to be auditable and tamper-evident, which extends to the governing prompt
itself.

## Decision

- The charter is **content-frozen**: it is prepended to every model call
  (via the model router, ADR-0006) and cannot be softened or overridden by
  downstream, task-specific prompts.
- Every `SYSTEM_PROMPT` constant is **hashed and pinned** in
  `scripts/prompt-hash-manifest.json`. `scripts/validate-prompt-hashes.mjs`
  fails CI if any prompt's hash drifts from, or is missing from, the manifest.
- A charter change is therefore a **visible, reviewed event**: the manifest hash
  must be updated in the same change, under code-owner review, and (per
  GOVERNANCE.md §2) with a recorded governance decision.

## Consequences

- The governing prompt cannot change without a corresponding, reviewed manifest
  update — tamper-evidence for the charter, satisfying FDL 10/2025 Art.18.
- Prompt changes are auditable from git history and gated in CI, not trusted to
  convention.
- Adding a new prompt requires registering its hash (invariant
  [`CLAUDE.md`](../../CLAUDE.md) #8); forgetting to do so fails the build by
  design.
- A small authoring step (regenerate + commit the hash) is added to any prompt
  change — accepted as the cost of integrity.

## Alternatives considered

- **Trust review alone to catch prompt changes** — reviewers miss subtle wording
  shifts; a hash gate is objective. Rejected as insufficient.
- **Runtime prompt fetched from config/DB** — makes the charter mutable outside
  version control and outside the audit gate; rejected.
