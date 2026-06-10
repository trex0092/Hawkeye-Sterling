# Identity & Access Attestation Register

**Document ID:** HS-SEC-001  
**Version:** 1.0.0  
**Effective Date:** 2026-06-10  
**Review Cycle:** Quarterly privileged-access review (driven by `ob_access_review` in `src/brain/regulatory-obligations.ts`); MFA attestation re-confirmed at each review  
**Owner:** Engineering Lead (operation); MLRO (compliance gate)  
**Classification:** Restricted — Internal Security Use Only  
**Framework references:** SOC2 CC6.1–CC6.3; ISO/IEC 42001:2023 Annex A controls on access; appetite dimension `insider_access_anomaly_rate`

---

## Purpose

Hawkeye Sterling runs serverless: there is no corporate directory, so identity risk concentrates in a small set of operator accounts on external platforms plus the platform's own credential system. This register (1) attests MFA posture on every privileged external account, (2) records the quarterly privileged-access review, and (3) gives the `kri_regulatory_obligation_overdue` KRI an auditable completion record for `ob_access_review`.

In-platform access control is enforced in code and is not attested here: API-key tiers (`web/lib/server/api-keys.ts`), RBAC permissions (`src/enterprise/rbac.ts`), JWT HS256 dual-secret sessions (`web/lib/server/jwt.ts`), and the four-eyes gate (`web/lib/server/four-eyes-gate.ts`).

## 1. Privileged Account MFA Register

Phishing-resistant MFA (hardware key or passkey) is the required standard for every account below. The operator attests each row at every quarterly review; this document never records "assumed" — only attested states.

| Account | Platform | Privilege | MFA required | MFA method attested | Last attested | Status |
|---|---|---|---|---|---|---|
| GitHub org owner / repo admin | GitHub | Source, CI secrets, branch protection | Yes | [Operator to attest] | — | ATTESTATION PENDING |
| Netlify team owner | Netlify | Production deploys, Blobs, env vars | Yes | [Operator to attest] | — | ATTESTATION PENDING |
| Anthropic console | Anthropic | `ANTHROPIC_API_KEY` issuance | Yes | [Operator to attest] | — | ATTESTATION PENDING |
| Upstash console | Upstash | Redis (rate-limit store) | Yes | [Operator to attest] | — | ATTESTATION PENDING |
| Asana workspace admin | Asana | Case/report distribution | Yes | [Operator to attest] | — | ATTESTATION PENDING |
| goAML portal (UAE FIU) | goAML | Regulatory filing | Per FIU policy | [Operator to attest] | — | ATTESTATION PENDING |
| S3 backup account (if `S3_BACKUP_*` activated) | AWS or compatible | Audit-chain archive | Yes | [Not yet activated] | — | NOT ACTIVE |

**KPI:** MFA coverage = attested rows ÷ active rows. Target 100%. Any row pending attestation past one review cycle escalates to the MLRO.

## 2. Quarterly Privileged-Access Review Log

Scope of each review: (a) every account in §1 — confirm holder, necessity, MFA; (b) issued platform API keys and tiers (`api-keys.ts`) — confirm each holder still requires access; (c) RBAC role assignments on SAR/goAML/four-eyes/ai-override routes; (d) GitHub repository collaborator list; (e) any unresolved `insider_access_anomaly_rate` events.

| Review ID | Date | Reviewer | Scope covered | Findings | Actions | Next review due |
|---|---|---|---|---|---|---|
| IAR-2026-001 | 2026-06-10 | Engineering (gap-closure session) | Register established. Reviewed in-repo access scope: API-key tier model (`api-keys.ts`), RBAC permission set (`rbac.ts`), GitHub repo scope limited to `trex0092/hawkeye-sterling`. External-platform MFA attestations NOT yet collected — all §1 rows remain ATTESTATION PENDING. | No code-level access anomalies identified. | Operator to complete §1 MFA attestations and countersign this entry. | 2026-09-10 |

Append-only: each review adds a row; rows are never edited after MLRO sign-off.

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-SEC-001 |
| Version | 1.0.0 |
| Created | 2026-06-10 |
| Next mandatory review | 2026-09-10 |
| Approver (Engineering Lead) | [Signature required] |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/INHERITED-CONTROLS.md`, `docs/SECURITY-NOTES.md`, `docs/governance/FRAMEWORK_COVERAGE.md` |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
