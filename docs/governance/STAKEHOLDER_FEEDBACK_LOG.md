# Stakeholder Feedback Log

**Document ID:** HS-GOV-004  
**Version:** 1.0.0  
**Effective Date:** 2026-06-09  
**Review Cycle:** Quarterly (January, April, July, October)  
**Owner:** Compliance Officer (collection and log maintenance); MLRO (response authority)  
**Classification:** Restricted — Internal Compliance Use Only  
**ISO 42001 Reference:** Clause 4.2 (Understanding the needs and expectations of interested parties); Clause 9.1 (Monitoring, measurement, analysis and evaluation)

---

## Purpose

This log implements the formal mechanism for collecting, recording, and responding to feedback from interested parties (stakeholders) in accordance with ISO/IEC 42001:2023 Clause 4.2 and Clause 9.1. Stakeholder feedback informs the continual improvement of the AI Management System and ensures that the organisation remains responsive to the expectations of those affected by or responsible for the AI systems.

The interested parties and their classification are defined in `docs/governance/AI_GOVERNANCE_POLICY.md` §6.4 (Interested Parties Register).

---

## Feedback Collection Channels

| Channel | Target Stakeholders | Collection Method | Responsible | Frequency |
|---|---|---|---|---|
| **MLRO Quarterly Survey** | MLRO, Compliance Officer | Structured questionnaire distributed by Compliance Officer | Compliance Officer | Quarterly |
| **Governance Committee Feedback Agenda Item** | All standing committee members | Standing agenda item at each quarterly summary meeting | MLRO (Chair) | Quarterly |
| **Data Science Performance Review** | Data Science Lead | Qualitative input on model quality, bias, and coverage gaps | Compliance Officer | Quarterly |
| **Engineering Operations Review** | Engineering Lead | Input on reliability, deployment safety, tooling gaps | Compliance Officer | Quarterly |
| **Regulatory Inspection Findings** | UAE FIU, CBUAE, MoE DNFBP | Inspector findings documented in `docs/operations/AUDIT_PREP_CHECKLIST.md` §10; abstracted into this log | MLRO | Ad-hoc |
| **Post-Incident MLRO Debrief** | MLRO, Legal, Engineering | Structured debrief following every CRITICAL or HIGH incident | MLRO | Ad-hoc |
| **External Auditor Management Letter** | External Auditors | Findings from annual audit documented and abstracted here | MLRO + Legal | Annually |

---

## Feedback Log

Entries are appended chronologically. Each entry is assigned a unique reference (FB-YYYY-NNN).

| Ref | Date | Source | Stakeholder | Category | Feedback Summary | Classification | Response | Owner | Status | Closed |
|---|---|---|---|---|---|---|---|---|---|---|
| FB-2026-001 | 2026-06-09 | Governance Committee Inaugural Meeting | MLRO | Model Coverage | UAE EOCN PDF format creates manual extraction risk; Phase 2 XML parser should be prioritised | Operational | Phase 2 PDF parser added to engineering backlog (CCL-2026 pending); DQR-001 in Data Quality Risk Register | Engineering Lead | Open | — |
| FB-2026-002 | 2026-06-09 | Governance Committee Inaugural Meeting | Engineering Lead | Infrastructure | goAML SFTP transport certificate rotation is manual; automation would reduce operational risk | Operational | Noted in CCL-2026 pending backlog; to be scheduled Q4 2026 | Engineering Lead | Open | — |
| FB-2026-003 | 2026-06-09 | Governance Committee Inaugural Meeting | Data Science Lead | Model Performance | Modes using `defaultApply()` stubs (Wave 1/2) cannot drive dispositions; full implementation needed for production reliability | Model Quality | Wave 3 stub-mode implementation prioritised in CCL-2026-015 (Q3 2026 target) | Data Science Lead | Open | — |
| FB-2026-004 | 2026-06-09 | Governance Committee Inaugural Meeting | MLRO | Oversight | Auto-Dispositioner (HS-004) must remain in PILOT status with mandatory human review until 90-day performance review completed | Governance | PILOT constraint confirmed in AI_INVENTORY.md §5.3; board approval required for promotion | MLRO | Open (ongoing constraint) | — |

---

## Feedback Response Procedure

1. **Receipt:** The Compliance Officer logs all feedback within 5 business days of collection.
2. **Classification:** Each item is classified as: `Regulatory` (external regulatory body), `Operational` (internal process/tooling), `Model Quality` (AI performance/coverage), `Governance` (policy/oversight), or `Data Protection` (PDPL/GDPR).
3. **MLRO Review:** The MLRO reviews all items classified as `Regulatory` or `Governance` within 5 business days. Other items are reviewed by the relevant owner.
4. **Response:** A formal response or action plan is documented within 20 business days of receipt.
5. **Escalation:** Feedback from regulatory bodies that identifies a compliance gap is treated as a HIGH severity incident and escalated per `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`.
6. **Governance Committee Review:** The full feedback log is reviewed at the quarterly governance committee summary meeting. Items open for > 6 months without resolution are escalated to the Board Risk Committee.
7. **Closure:** An item is closed when the response has been actioned and acknowledged, or when the issue has been formally accepted as an operating condition by the MLRO.

---

## Quarterly Review Summary Template

At each quarterly governance committee summary meeting, the Compliance Officer presents a summary in the following format:

```
STAKEHOLDER FEEDBACK QUARTERLY REVIEW — [QN YYYY]
=================================================

Total items in log:          [N]
New items this quarter:      [N]
Items closed this quarter:   [N]
Items open > 6 months:       [N] — [escalated / not yet escalated]

Feedback by classification:
  Regulatory:      [N]
  Operational:     [N]
  Model Quality:   [N]
  Governance:      [N]
  Data Protection: [N]

Open items requiring Board Risk Committee attention:
  [List or "None"]

Emerging themes identified:
  [Free text — common concerns, systemic gaps, improvement opportunities]

Recommended actions for Board consideration:
  [List or "None"]
```

---

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-GOV-004 |
| Version | 1.0.0 |
| Created | 2026-06-09 |
| Next mandatory review | 2026-09-09 (quarterly) |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md` §6.4, `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md`, `docs/operations/AUDIT_PREP_CHECKLIST.md` |
| Regulatory references | ISO/IEC 42001:2023 Clause 4.2, Clause 9.1; UAE FDL 10/2025 Art. 24 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
