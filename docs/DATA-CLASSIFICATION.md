# Data Classification & Handling Standard

Defines the data classes Hawkeye Sterling processes and the handling rules for
each. This is the reference behind the recurring guardrail across the repo —
*never put regulated data or secrets in issues, PRs, logs, or external sinks.*

Related: [`docs/GDPR.md`](./GDPR.md) (PDPL/GDPR), [`SECURITY.md`](../SECURITY.md),
[`docs/security/THREAT_MODEL.md`](./security/THREAT_MODEL.md).

## Classes

| Class | Examples | Handling |
|---|---|---|
| **C4 — Regulated / Restricted** | Customer PII, screening subjects, sanctions/PEP hits, SAR/STR & goAML narratives | Never in issues/PRs/logs/discussions. Redacted before LLM egress. Access via fail-closed auth + RBAC. Every access/decision audit-logged. Retention per operator decision. |
| **C3 — Secret** | Signing secrets, API keys, JWT secrets, tokens | Never logged (`keyIdPrefix` ≤ 8 chars at most). Injected via env (see `docs/ENV_VARS_REQUIRED.md`). Secret scanning in CI (gitleaks, GitGuardian). |
| **C2 — Internal** | Source code, configs, governance registers, audit metadata | Repository-scoped; code-owner review on control paths. Not for public distribution (proprietary). |
| **C1 — Public** | README, LICENSE, governance policy docs, SECURITY.md, badges | May be shared publicly. |

## Handling rules

1. **No C4/C3 in version control or collaboration tooling** — issues, PRs,
   discussions, commit messages, Asana, email. Redact first. This is a
   [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) level-4 matter if deliberate.
2. **Logging** — no raw PII; IP addresses HMAC-hashed via `anonIpKey()`; API
   keys never logged in full. (Invariant; enforced by CodeQL `raw-ip-logged.ql`.)
3. **LLM egress** — C4 is redacted before the prompt leaves the process and
   rehydrated inside the trust boundary; tipping-off content passes the egress
   gate (fail-closed to `held_review`).
4. **Audit** — C4 decisions/accesses write an append-only audit-chain entry with
   `tenantId` (ADR-0003). Audit metadata is C2; it contains no raw C4.
5. **External sinks** (goAML, Asana, blobs) — egress-checked and audit-logged;
   payloads minimised to what the obligation requires.
6. **Retention & disposal** — per the operator retention decision (see
   `COMPLIANCE_GAPS.md` CG-6); WORM/object-lock upgrade path available.

## Incident handling

Suspected exposure of C4 or C3 data is both a security incident and a Code of
Conduct matter: follow [`SECURITY.md`](../SECURITY.md) and the incident runbook
([`docs/INCIDENT-RECOVERY.md`](./INCIDENT-RECOVERY.md)) — do **not** discuss the
exposed data in a public issue.
