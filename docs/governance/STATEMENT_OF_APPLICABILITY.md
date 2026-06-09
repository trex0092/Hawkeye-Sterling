# Statement of Applicability — ISO/IEC 42001:2023

**Document ID:** HS-SOA-001  
**Version:** 1.0.0  
**Effective Date:** 2026-06-09  
**Review Cycle:** Annual; updated on any material change to the AIMS scope or controls  
**Owner:** MLRO  
**Classification:** Restricted — Internal Compliance Use Only

---

## Purpose

This Statement of Applicability (SOA) maps all control objectives from ISO/IEC 42001:2023 Annex A (A.5 through A.12) to Hawkeye Sterling's implemented controls. For each control, this document records: whether it is applicable, whether it is implemented, the evidence location, and the justification for any exclusion.

This is a mandatory document for ISO/IEC 42001:2023 conformity.

---

## Annex A Control Mapping

### A.5 — AI Policy

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.5.2 — AI policy shall be established | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` (HS-GOV-001) | Board-approved governance policy covering all 7 activity domains |
| A.5.3 — AI policy shall be communicated | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §6 (roles); `docs/operations/AUDIT_PREP_CHECKLIST.md` §3.1 | Policy distributed to all standing governance committee members; available for regulatory inspection |

---

### A.6 — AI Roles and Responsibilities

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.6.1 — Roles and responsibilities shall be defined | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §6.1 (RACI matrix) | MLRO, Compliance Officer, Data Science Lead, Engineering Lead, CEO, Legal, Board defined |
| A.6.2 — AI system lifecycle roles | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §5 (change management); `docs/governance/AI_INVENTORY.md` §1-6 | Pre-deployment checklist; MLRO sign-off gate; change classification |
| A.6.2.3 — AI system inventory | Yes | Yes | `docs/governance/AI_INVENTORY.md` (HS-GOV-002) | Five systems (HS-001 through HS-005) registered with version, purpose, risk tier, approval date |
| A.6.2.4 — AI system objectives | Yes | Yes | `docs/governance/AI_INVENTORY.md` §2.10, 3.10, 4.12, 5.8, 6.9; `docs/governance/AI_GOVERNANCE_POLICY.md` §1.3 | SMART objectives per system and at policy level |
| A.6.2.5 — Impact assessment | Yes | Yes | `docs/GDPR.md` §Data Protection Impact Assessment; model cards `docs/model-cards/` | DPIA conducted for all 5 systems; model cards include intended/out-of-scope uses and limitations |
| A.6.2.6 — Prompt and content controls | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §5.5; `scripts/prompt-hash-manifest.json`; `web/lib/server/sanitize-prompt.ts` | Prompt hash integrity CI gate; injection protection; 74 routes with prompt caching |

---

### A.7 — AI Risk Assessment

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.7.1 — AI risk assessment process | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §3 (risk classification); `docs/data-governance/DATA_LINEAGE.md` §7 (Data Quality Risk Register) | Four-tier risk classification (CRITICAL/HIGH/MEDIUM/LOW); data quality risk register with 9 identified risks |
| A.7.2 — AI risk criteria | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §4 (risk tolerance matrix); §4.2 (zero-tolerance dimensions) | Quantitative thresholds: FNR < 1%, FPR < 5%, drift ≤ 0.15, FFR SLA breach = 0% |
| A.7.3 — AI risk register | Yes | Partial | `COMPLIANCE_GAPS.md` (HS-CAPA-001 — CAPA Register); `docs/data-governance/DATA_LINEAGE.md` §7 | Risk tracking across CAPA register and data quality risk register; unified AI risk register (ISO formal format) to be produced in Q3 2026 |

---

### A.8 — AI Risk Treatment

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.8.1 — Risk treatment options | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §3.2 (risk tier controls); `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` | Risk-tier-specific controls defined for CRITICAL, HIGH, MEDIUM, LOW |
| A.8.2 — Human oversight as risk treatment | Yes | Yes | `web/lib/server/four-eyes-gate.ts`; `docs/governance/AI_INVENTORY.md` §2.9, 4.11; AI Governance Policy §1.1 | "AI proposes; MLRO decides" enforced at system and charter level; zero bypass permitted |
| A.8.3 — Documented statement of risk treatment | Yes | Yes | This document (SOA); `docs/governance/AI_GOVERNANCE_POLICY.md` §3-4; `COMPLIANCE_GAPS.md` Improvement Initiatives | Risk treatment evidenced across policy, CAPA register, and this SOA |

---

### A.9 — AI Objectives

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.9.1 — Establish AI objectives | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §1.3; `docs/governance/AI_INVENTORY.md` §2.10, 3.10, 4.12, 5.8, 6.9 | 10 policy-level objectives (OBJ-001–010) + per-system objectives |
| A.9.2 — Plan to achieve objectives | Yes | Yes | `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` §1.7; `docs/operations/AUDIT_PREP_CHECKLIST.md` §0.2 | Weekly governance committee tracks objectives progress; quarterly Board report |

---

### A.10 — AI Lifecycle

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.10.1 — AI system design and development | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §5 (change management); `docs/operations/CHANGE_CONTROL_LOG.md` | Pre-deployment checklist; change classification; regression gate |
| A.10.2 — AI system deployment | Yes | Yes | `docs/operations/CHANGE_CONTROL_LOG.md`; `Dockerfile`; `k8s/` | Deployment log; MLRO approval gate; rollback protocol |
| A.10.3 — AI system monitoring | Yes | Yes | `web/lib/server/drift-monitor.ts`; `web/lib/server/bias-monitor.ts`; `GET /api/mlro/drift-alerts`; `GET /api/mlro/brier` | Daily calibration checks; monthly fairness audits; drift alerts |
| A.10.4 — AI system change management | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §5; `docs/operations/CHANGE_CONTROL_LOG.md` | Major/Minor/Emergency/Maintenance classification; rollback criteria |
| A.10.5 — AI system decommissioning | Yes | Partial | `docs/governance/AI_INVENTORY.md` §7 (change log) | Decommissioning process not yet formally documented; to be added in Q3 2026 annual review |

---

### A.11 — Documentation and Records

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.11.1 — Documentation requirements | Yes | Yes | `docs/governance/AI_GOVERNANCE_POLICY.md` §11 (Document Control); `docs/operations/AUDIT_PREP_CHECKLIST.md` §0.1 | All mandatory documents version-controlled; append-only change log; MLRO sign-off required |
| A.11.2 — Record retention | Yes | Yes | `docs/data-governance/DATA_LINEAGE.md` §5; `web/lib/server/audit-chain.ts` | 10-year retention policy; HMAC-signed append-only audit chain; FDL 10/2025 Art. 24 |

---

### A.12 — Continual Improvement

| Control | Applicable | Implemented | Evidence | Notes |
|---|---|---|---|---|
| A.12.1 — Nonconformity and corrective action | Yes | Yes | `COMPLIANCE_GAPS.md` (HS-CAPA-001 CAPA Register) | 11 gap items tracked with root cause, corrective action, effectiveness evidence; Phase 1–3 security fixes documented |
| A.12.2 — Continual improvement | Yes | Yes | `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` §5.1 (Continual Improvement Actions Register); `COMPLIANCE_GAPS.md` Improvement Initiatives section | Weekly improvement review at governance committee; improvement actions register with owners and closure evidence |

---

## Exclusion Justifications

The following ISO/IEC 42001:2023 Annex A controls are assessed as not applicable to the current scope:

| Control Area | Justification |
|---|---|
| Controls relating to AI system sale to third parties | Hawkeye Sterling is an internal compliance platform; it is not licensed or sold to external parties |
| Controls relating to AI systems used for autonomous physical actions | All AI systems are decision-support only; no physical actuation or autonomous physical actions occur |

---

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-SOA-001 |
| Version | 1.0.0 |
| Created | 2026-06-09 |
| Next mandatory review | 2027-06-09 |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md`, `docs/governance/AI_INVENTORY.md`, `COMPLIANCE_GAPS.md` |
| Regulatory references | ISO/IEC 42001:2023 Annex A; UAE FDL 10/2025 Art. 18 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
