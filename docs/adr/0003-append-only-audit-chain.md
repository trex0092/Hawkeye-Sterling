# ADR-0003: Append-only dual-chain audit trail

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** MLRO, Engineering Lead
- **Governance-impacting:** Yes
- **Regulatory anchor:** UAE FDL 10/2025 Art.18 (AI audit trail); Cabinet Decision 10/2019 (record-keeping); SOC 2 CC7.x

## Context

FDL 10/2025 Art.18 requires a tamper-evident audit trail for AI-assisted
compliance decisions. A mutable log is worthless as evidence: if an entry can be
altered or deleted after the fact, no reviewer can rely on it. The trail must
also survive a single-store compromise and bind each entry to a tenant.

## Decision

We will persist an **append-only, HMAC-SHA256 audit chain** for every AI
decision, screening result, SAR/STR filing, four-eyes action, and egress check,
via `writeAuditChainEntry()` (`web/lib/server/audit-chain.ts`). Specifically:

- Entries are **append-only** — never updated or deleted in place.
- The chain is **dual**: an append-only HMAC-SHA256 blob chain plus per-request
  signing, so tampering with one is detectable against the other.
- Every entry carries a `tenantId` (`tenantIdFromGate(gate)`); writing without a
  tenant is forbidden.
- No raw PII or secrets enter the trail — IPs are HMAC-hashed via `anonIpKey()`,
  API keys are never logged in full.

## Consequences

- The audit trail is tamper-evident and admissible as compliance evidence.
- Bypassing `writeAuditChainEntry()` on any governed action is an invariant
  breach (see [`CLAUDE.md`](../../CLAUDE.md)); reviewers and the PR template
  check for it explicitly.
- A WORM / object-lock archive (S3 with `S3_BACKUP_*`) remains an available
  upgrade path over the operator-accepted local + Asana arrangement — see
  `netlify/functions/audit-chain-s3-backup.mts` and `COMPLIANCE_GAPS.md` (CG-6).
- Storage grows monotonically by design; retention is an operator decision, not
  a technical truncation.

## Alternatives considered

- **Mutable structured logs** — fail the tamper-evidence requirement; rejected.
- **Single-chain HMAC only** — a single-store compromise would be undetectable;
  rejected in favour of the dual chain.
- **External SIEM as system of record** — moves evidence outside the audited
  repository/runtime and adds a trust dependency; retained as a downstream sink,
  not the primary record.
