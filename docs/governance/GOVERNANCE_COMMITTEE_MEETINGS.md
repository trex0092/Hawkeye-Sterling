# Hawkeye Sterling — AI Governance Committee Meetings

**Document ID:** GOV-004  
**Version:** 1.0.0  
**Effective Date:** 2026-05-10  
**Owner:** MLRO  
**Cadence:** Weekly (every Friday, 14:00 GST)  
**Duration:** 30 minutes  
**Forum:** Mandatory standing governance committee

---

## Standing Attendees

| Role | Required? |
|------|-----------|
| MLRO | ✅ Mandatory |
| Compliance Officer | ✅ Mandatory |
| Data Science Lead | ✅ Mandatory |
| Engineering Lead | ✅ Mandatory |
| Legal Counsel | When agenda item requires |
| CEO / Board rep | Quarterly review only |

---

## Agenda Template

### Item 1 — Drift Alerts (5 min)
Review active calibration drift alerts from `GET /api/mlro/drift-alerts`.  
**Owner:** Data Science Lead  
**Format:**
- List all active alerts: modeId, severity, metric, current_value, threshold
- For each CRITICAL alert: assign investigation owner and 48-hour remediation deadline
- Review resolved alerts from prior week
- Confirm ONGOING_RUN_TOKEN cron health (sanctions, PEP, adverse media)

### Item 2 — Incident Log Review (5 min)
Review `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` — open incidents.  
**Owner:** Engineering Lead / MLRO  
**Format:**
- Open incidents by severity
- Update on remediation timelines
- Any regulatory notification obligations triggered?

### Item 3 — Mode Performance Leaderboard (5 min)
Review per-mode performance from `GET /api/mlro/mode-performance`.  
**Owner:** Data Science Lead  
**Format:**
- Top 5 underperforming modes by Brier score (worst first)
- Any mode with 0% coverage → assign investigation
- Trend: modes moving from "stable" to "drifting"
- Review ECE (Expected Calibration Error) against 0.04 threshold

### Item 4 — MLRO Flags / Edge Cases (10 min)
Review any disposition overrides, escalations, or edge cases raised by MLRO.  
**Owner:** MLRO  
**Format:**
- Overrides from prior week: count, modes affected, patterns
- Any case that may warrant model card update
- goAML submission status (any pending STRs)
- PEP cool-off review (any PEPs approaching declassification window)

### Item 5 — Upcoming Changes (5 min)
Any changes requiring governance approval before next deploy.  
**Owner:** Engineering Lead / Data Science Lead  
**Format:**
- Mode additions / updates (require MLRO sign-off)
- Threshold changes (require board sign-off)
- Data source changes
- Regulatory updates (new FATF typologies, UAE Cabinet Resolutions)
- Refer to docs/operations/CHANGE_CONTROL_LOG.md

---

## Decision Log

Minutes are recorded directly in this document under the meeting date. Decisions require MLRO confirmation in writing.

---

## Meeting Minutes Archive

### 2026-05-09 — Inaugural Meeting

**Attendees:** MLRO, Compliance Officer, Data Science Lead, Engineering Lead, Legal Counsel

**Agenda:**
1. Established Friday 14:00 GST cadence
2. Approved AI Governance Policy (docs/governance/AI_GOVERNANCE_POLICY.md) — pending board sign-off
3. Reviewed AI Inventory (HS-001 through HS-005)
4. Confirmed governance committee composition and escalation paths

**Decisions:**
- [GOV-001] AI_GOVERNANCE_POLICY.md approved by governance committee — forwarded to board for sign-off
- [GOV-002] MLRO Auto-Dispositioner (HS-004) remains PILOT status; full production requires board approval
- [GOV-003] FDL crosswalk (Item #38) integrated — all FDL 20/2018 citations updated to FDL 10/2025

**Action Items:**
| Action | Owner | Deadline |
|--------|-------|----------|
| Board sign-off on AI_GOVERNANCE_POLICY.md | MLRO → CEO | 2026-05-10 |
| Deploy audit-config.mts Netlify function | Engineering | 2026-05-10 |
| Complete model cards HS-001 through HS-005 | Data Science | 2026-05-10 |
| UAE FIU registration confirmation (GOAML_RENTITY_ID) | MLRO + Legal | 2026-05-31 |

---

*Minutes are archived here and in the board repository. Every committee meeting must produce minutes within 24 hours. The MLRO is the keeper of this document.*
