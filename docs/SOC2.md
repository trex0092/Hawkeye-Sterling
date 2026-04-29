# SOC 2 Controls Matrix — Hawkeye Sterling

This document maps each AICPA Trust Services Criterion to the implementing
code, configuration, or operational evidence in this repository. It is the
**control narrative** that an external SOC 2 Type II auditor uses as the
starting point of fieldwork — it does not constitute an attestation. The
attestation is produced by an independent CPA firm after a 6–12 month
operating-effectiveness window.

**Trust Services Criteria covered:** Security (CC1–CC8) is mandatory.
Availability, Processing Integrity, Confidentiality, and Privacy are
applicable given the nature of regulated AML/CFT screening output.

---

## CC1 — Control Environment

| Ref | Criterion | Evidence in this repo |
|-----|-----------|----------------------|
| CC1.1 | Demonstrates commitment to integrity & ethical values | Charter P1–P10 enforced in `src/brain/compliance-policy.ts` and `web/lib/server/systemPrompt.ts`; no override path |
| CC1.2 | Board oversight | Out-of-repo: governance docs |
| CC1.3 | Management establishes structure & authority | RBAC roles `analyst / mlro / deputy_mlro / auditor / admin` in `src/enterprise/rbac.ts` |
| CC1.4 | Demonstrates commitment to competence | Training module `web/app/training/` |
| CC1.5 | Holds individuals accountable | Four-eyes signature gate in `src/enterprise/rbac.ts` (`four_eyes.sign` permission) |

## CC2 — Communication & Information

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC2.1 | Obtains/uses relevant quality information | Direct-source ingestion adapters in `src/ingestion/sources/` (UN, OFAC SDN, OFAC Cons, EU FSF, UK OFSI, UAE EOCN) |
| CC2.2 | Communicates internal information | Audit trail UI `web/app/audit-trail/`, oversight dashboard `web/app/oversight/` |
| CC2.3 | Communicates with external parties | GOAML submission scaffolding `src/enterprise/goaml-submission.ts`; STR/SAR templates |

## CC3 — Risk Assessment

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC3.1 | Specifies suitable objectives | EWRA module `web/app/ewra/`, risk-appetite `src/brain/risk-appetite.ts` |
| CC3.2 | Identifies & analyzes risk | KRI registry `src/brain/kri-registry.ts`, jurisdiction tiers `src/brain/jurisdictions.ts` |
| CC3.3 | Considers fraud risk | Forensic modes (`benford_law`, `journal_entry_anomaly`, `vendor_master_anomaly`, `split_payment_detection`, `round_trip_transaction`, `shell_triangulation`) in `src/brain/reasoning-modes-wave3.ts` |
| CC3.4 | Identifies & analyzes change | Sanctions-delta watch `src/brain/sanction-delta.ts` + scheduled cron jobs |

## CC4 — Monitoring Activities

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC4.1 | Performs ongoing/separate evaluations | Calibration harness `src/brain/calibration-harness.ts`; meta-cognition `src/brain/meta-cognition.ts`; introspection `src/brain/introspection.ts` |
| CC4.2 | Communicates control deficiencies | Outcome-feedback loop `src/brain/outcome-feedback.ts`; corrections route `web/app/api/corrections/` |

## CC5 — Control Activities

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC5.1 | Selects/develops control activities | Reasoning-mode registry `src/brain/modes/registry.ts` (>400 modes across 12 categories) |
| CC5.2 | Selects/develops technology controls | Enforcement middleware `web/lib/server/enforce.ts` (rate-limit + key-validation + JWT) |
| CC5.3 | Deploys via policies & procedures | Policy library `src/brain/policy-library.ts`; doctrines `src/brain/doctrines.ts` |

## CC6 — Logical & Physical Access

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC6.1 | Logical access controls | API-key store `web/lib/server/api-keys.ts` (sha-256 hashed at rest, secondary index, soft-quota) |
| CC6.2 | Authentication mechanisms | JWT issuance `web/lib/server/jwt.ts` (HS256, alg-pinned, timing-safe verify, ≥32-byte secret enforced); API-key bearer `web/app/api/auth/token/route.ts` |
| CC6.3 | Authorization controls | RBAC permission gates `src/enterprise/rbac.ts` (15 fine-grained permissions) |
| CC6.4 | Physical access | Provider responsibility (Netlify SOC 2 inheritance) |
| CC6.5 | Removal of access | Key revocation `web/lib/server/api-keys.ts:revokeKey()`; GDPR delete `web/app/api/gdpr/delete/` |
| CC6.6 | Boundary protection | Edge gating `web/middleware.ts`; sandbox-bypass uses `ADMIN_TOKEN` with timing-safe compare in `enforce.ts` |
| CC6.7 | Restricts movement of information | Tenant isolation `src/enterprise/tenant.ts` (`TenantContext.licensedLists`) |
| CC6.8 | Prevents/detects malicious software | Dependency floor: `@netlify/blobs` only runtime dep; no transitive dep tree of unaudited libs |

## CC7 — System Operations

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC7.1 | Detects security events | Audit chain `src/brain/audit-chain.ts` (FNV-1a hashed signature anchors); rate-limit telemetry |
| CC7.2 | Monitors system components | Status route `web/app/api/status/route.ts`; brain-soul manifest |
| CC7.3 | Evaluates security events | Meta-cognition layer; introspection alerts |
| CC7.4 | Responds to security incidents | Out-of-repo: incident-response runbook |
| CC7.5 | Recovers from incidents | Out-of-repo: DR plan; Netlify Blobs versioning |

## CC8 — Change Management

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC8.1 | Authorizes/develops/implements/documents changes | GitHub PR workflow + branch protection on `main`; `.github/workflows/ci.yml` typecheck + tests + brain audit gate |

## CC9 — Risk Mitigation

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| CC9.1 | Identifies/selects/develops risk mitigation | Sanctions-list cadence: 03:00 / 11:00 / 13:30 UTC daily + every-15-min fast watch (`netlify/functions/sanctions-watch-*.mts`) |
| CC9.2 | Vendor & business-partner risk | Vendor-due-diligence module `web/app/vendor-dd/` |

---

## Availability (A1)

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| A1.1 | Capacity planning | Tier-based rate limits `web/lib/server/rate-limit.ts`; monthly quotas `web/lib/data/tiers.ts` |
| A1.2 | Backup & recovery | Netlify Blobs durability inheritance; audit-chain replay |
| A1.3 | Recovery testing | Out-of-repo: DR drill cadence |

## Processing Integrity (PI1)

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| PI1.1 | Inputs are valid, complete, accurate | Subject schema validation in routes; data-quality modes (`completeness_audit`, `dq-rules.ts`) |
| PI1.2 | System processing is complete & accurate | Bayesian fusion `src/brain/fusion.ts`; Dempster-Shafer combinator `src/brain/dempster-shafer.ts` (audit trace per step, conflict mass surfaced) |
| PI1.3 | Outputs are accurate & timely | SLA in `docs/SLA.md`; deterministic reasoning chain persisted with each verdict |

## Confidentiality (C1)

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| C1.1 | Identifies confidential information | Redactor `src/brain/redactor.ts`; tipping-off guard `src/brain/tipping-off-guard.ts` |
| C1.2 | Disposes of confidential information | Retention policy `src/brain/retention-policy.ts`; GDPR delete |

## Privacy (P1–P8)

| Ref | Criterion | Evidence |
|-----|-----------|----------|
| P1 | Notice | `docs/GDPR.md` |
| P2 | Choice & Consent | Consent capture in onboarding flows |
| P3 | Collection | Subject-profile minimisation |
| P4 | Use, Retention & Disposal | `retention-policy.ts`; tenant-scoped retention windows |
| P5 | Access | GDPR export `web/app/api/gdpr/export/` |
| P6 | Disclosure to third parties | GOAML controlled disclosure only |
| P7 | Quality | Outcome-feedback corrections loop |
| P8 | Monitoring & Enforcement | Audit-trail review cadence |

---

## Open items before Type II window

- [ ] Independent penetration test (annual)
- [ ] Background-check policy for engineers with production access
- [ ] Documented vendor-management policy (Netlify, GitHub, NewsAPI, Google CSE, GDELT)
- [ ] Quarterly access review of API-key holders
- [ ] Disaster-recovery runbook with RTO/RPO targets
- [ ] Encryption-at-rest verification for Netlify Blobs region
- [ ] Logging review: ensure no API keys/JWTs/PII appear in logs
