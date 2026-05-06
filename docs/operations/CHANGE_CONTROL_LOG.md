# Change Control Log
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-OPS-002
**Version:** 1.0
**Effective Date:** [DATE]
**Owner:** Data Science Lead + Compliance Officer
**Approved by:** MLRO

---

## 1. Purpose

This log records every material change to Hawkeye Sterling's AI systems — reasoning modes, compliance charter, data sources, and deployment configuration. It satisfies NIST AI RMF (GOVERN function — change management) and EU AI Act Article 30 (technical documentation).

---

## 2. Change Categories

| Category | Description | Approval Required |
|---|---|---|
| Mode-Add | New reasoning mode added to registry | Data Science + MLRO + Governance board |
| Mode-Modify | Existing mode logic changed | Data Science + MLRO |
| Mode-Remove | Mode removed from registry | Data Science + MLRO |
| Policy-Change | `src/policy/systemPrompt.ts` modified | MLRO + Legal Counsel + CEO |
| Data-Source | New data source added or existing source changed | Engineering + MLRO |
| Config-Change | `netlify.toml` or environment variables changed | Engineering + MLRO |
| Security-Change | Credential rotation, token change | Engineering + MLRO |
| Dependency-Update | `package.json` dependency change | Engineering (notify MLRO) |
| Monitoring-Add | New observability surface (route, dashboard, alert) | Engineering + MLRO |

---

## 3. Change Log

| Change ID | Date | Category | Component | Description | Author | Reviewer | Approved by | Test Results | Version |
|---|---|---|---|---|---|---|---|---|---|
| HS-CHG-2026-001 | 2026-05-06 | Mode-Add (Wave 3) | 100 wave-3 modes | Full wave-3 expansion: sanctions/proliferation (10), TBML (9), crypto (17), trade/cargo (3), DPMS/sectoral (10), network/professional (3), banking (2), UBO/structures (8), PEP/corruption (7), predicate offences (8), TF/NPO (1), KYC/identity (9), behavioral (10), securities/insurance (6) — all wired into MODE_OVERRIDES | Data Science team | MLRO | Governance board | All 100 modes pass vitest regression suite | 2.3.1 |
| HS-CHG-2026-002 | 2026-05-06 | Mode-Add | Version pinning | All modes in registry now carry version, deployedDate, contentHash, author, approvedBy, changeLog | Engineering Lead | Data Science Lead | MLRO | typecheck pass | 2.3.1 |
| HS-CHG-2026-003 | 2026-05-06 | Monitoring-Add | API surface for audit + drift + sanctions status | Added five new GET endpoints: `/api/audit/view`, `/api/audit/verify`, `/api/mlro/drift-alerts`, `/api/mlro/mode-performance`, `/api/sanctions/status`. All wrapped in `enforce()` with rate-limit + tier headers; `/api/audit/verify` is fail-closed when `AUDIT_CHAIN_SECRET` is unset (returns 503). Required by HS-GOV-001 §12 (Audit Readiness) and HS-OPS-003 (regulator response runbook). | Compliance Officer | Engineering Lead | MLRO | typecheck pass | 2.3.1 |
| HS-CHG-2026-004 | 2026-05-06 | Monitoring-Add | UI panels for audit + performance | Added `web/components/screening/AuditTrailViewer.tsx` (filterable HMAC-sealed chain viewer with verify + JSON/CSV export) and `web/components/screening/PerformanceMonitoringDashboard.tsx` (calibration / mode performance / drift alerts tabs). WCAG 2.1 AA: tablist+arrow-key navigation, aria-live status, semantic table with caption, focus-visible rings throughout. | Compliance Officer | Engineering Lead | MLRO | typecheck pass | 2.3.1 |
| HS-CHG-2026-005 | 2026-05-06 | Policy-Change | Governance documentation set | Created `docs/governance/AI_GOVERNANCE_POLICY.md`, `AI_INVENTORY.md`, `GOVERNANCE_COMMITTEE_MEETINGS.md`; `docs/model-cards/HS-001..HS-005.md`; `docs/data-governance/DATA_LINEAGE.md`; `docs/testing/FAIRNESS_TESTING_RESULTS.md`; `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`, `CHANGE_CONTROL_LOG.md`, `AUDIT_PREP_CHECKLIST.md`. Initial governance pack — pending CEO/Board signature for §11 effectiveness. | Compliance Officer | MLRO | CEO/Board (pending) | n/a (docs) | 2.3.1 |

---

## 4. Governance Approval Record

All Mode-Add, Mode-Modify, Policy-Change, Data-Source, and Monitoring-Add changes require governance board approval before merge. Approval is recorded here and referenced in the PR.

| Change ID | PR Number | Approval Date | Approved by | Board Minutes Reference |
|---|---|---|---|---|
| HS-CHG-2026-001 | [pending] | 2026-05-06 | Governance board | docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md (first weekly post-adoption) |
| HS-CHG-2026-002 | [pending] | 2026-05-06 | MLRO | as above |
| HS-CHG-2026-003 | [pending] | 2026-05-06 | MLRO | as above |
| HS-CHG-2026-004 | [pending] | 2026-05-06 | MLRO | as above |
| HS-CHG-2026-005 | [pending] | 2026-05-06 | CEO/Board (pending signature) | as above |

---

**Log maintained by:** Data Science Lead (technical changes) + Compliance Officer (governance record)
**Last Updated:** 2026-05-06
**Reviewed:** MLRO
