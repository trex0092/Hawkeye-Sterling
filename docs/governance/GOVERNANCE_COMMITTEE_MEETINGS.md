# Governance Committee Meetings

**Document ID:** HS-GOV-003  
**Version:** 2.0.0  
**Effective Date:** 2026-05-06  
**Review Cycle:** Annual  
**Owner:** MLRO (Chair)  
**Cadence:** Weekly (every Friday, 09:00 GST)  
**Duration:** 30 minutes  
**Classification:** Restricted — Internal Compliance Use Only

---

## Table of Contents

1. [Committee Constitution and Purpose](#1-committee-constitution-and-purpose)
2. [Standing Agenda Template](#2-standing-agenda-template)
3. [Meeting Administration](#3-meeting-administration)
4. [Minutes Template](#4-minutes-template)
5. [Meeting Archive](#5-meeting-archive)

---

## 1. Committee Constitution and Purpose

### 1.1 Purpose

The Hawkeye Sterling AI Governance Committee provides weekly oversight of all AI systems deployed in the AML/CFT compliance programme. The committee is the primary forum for:

- Detecting and responding to model performance degradation
- Reviewing and closing incidents affecting AI system integrity
- Monitoring per-mode reasoning performance and calibration quality
- Reviewing MLRO flags, edge cases, and disposition patterns
- Approving or rejecting proposed changes to AI systems, data sources, and compliance workflows

The committee operates under the authority of the AI Governance Policy (`docs/governance/AI_GOVERNANCE_POLICY.md`) and reports to the Board Risk Committee on a quarterly basis.

### 1.2 Standing Members

| Role | Member | Attendance |
|---|---|---|
| MLRO (Chair) | [Name] | Mandatory |
| Compliance Officer | [Name] | Mandatory |
| Data Science Lead | [Name] | Mandatory |
| Engineering Lead | [Name] | Mandatory |

### 1.3 Ad-Hoc Attendees

The following may be invited as required:

- CEO (when Major change approval is required, or CRITICAL incident is on the agenda)
- Legal Counsel (when regulatory inquiry, tipping-off risk, or PDPL matter is on the agenda)
- External Auditors (by invitation, for assurance purposes)

### 1.4 Quorum

A quorum requires the MLRO plus at least one of (Compliance Officer, Data Science Lead, Engineering Lead). If quorum is not reached, the meeting is rescheduled to within 3 business days. Decisions cannot be made without quorum.

### 1.5 Schedule

**Every Friday, 09:00–09:30 GST (30 minutes)**

Where Friday falls on a UAE public holiday, the meeting is rescheduled to the preceding Thursday.

Emergency sessions may be convened at any time by the MLRO where a CRITICAL incident requires governance committee input before the next scheduled meeting.

### 1.6 Decision-Making

Decisions are made by consensus. Where consensus cannot be reached, the MLRO has casting authority. All decisions are recorded in the minutes with the rationale and the name of each attendee who voted, objected, or abstained.

---

## 2. Standing Agenda Template

**Duration: 30 minutes**

| Item | Duration | Data Source / Owner | Description |
|---|---|---|---|
| 1 | 5 min | Engineering Lead | **Drift Alerts** — Review current drift alerts from `GET /api/mlro/drift-alerts`. Confirm whether any alert has crossed the governance escalation threshold (drift delta > 0.15 or model drift score > 0.15). Agree response actions. |
| 2 | 7 min | MLRO | **Incident Log Review** — Review all open incidents from the Incident Register. For each open incident: confirm current severity, review remediation progress against SLA, confirm action items are on track, escalate any item overdue. Close resolved incidents formally. |
| 3 | 5 min | Data Science Lead | **Mode Performance Leaderboard** — Review mode performance ranking from `GET /api/mlro/mode-performance`. Identify modes with degrading Brier scores. Agree actions for modes below acceptable performance threshold. Note any modes that should be suspended or re-calibrated. |
| 4 | 8 min | MLRO | **MLRO Flags and Edge Cases** — MLRO presents any cases from the prior week that were unusually complex, resulted in an unexpected AI proposal, required significant override, or exposed a gap in the system's capabilities. Discuss whether systemic changes are needed. |
| 5 | 5 min | All | **Upcoming Changes** — Review any proposed changes to AI systems, data sources, thresholds, or workflows that require governance approval in the coming week. Confirm change classification (Major/Minor/Emergency/Maintenance). Approve, reject, or defer pending further information. |

### 2.1 Item 1: Drift Alerts — Detailed Guidance

Pull the drift report immediately before the meeting:

```
GET /api/mlro/drift-alerts
```

For each alert returned with `warning: true`, the committee must determine:

- **Is this a data distribution shift?** (change in the population of subjects screened)
- **Is this a model degradation?** (change in how the model handles similar inputs over time)
- **Is this a ground-truth labelling shift?** (MLRO reversal patterns have changed)

The normalised drift score threshold is **0.15** per the risk appetite registry (`src/brain/risk-appetite.ts`). Breaches trigger board review. Scores between 0.10 and 0.15 are HIGH severity and require an MLRO action plan within 5 business days.

Also review cron health for sanctions, PEP, and adverse-media ingestion jobs.

### 2.2 Item 2: Incident Log Review — Detailed Guidance

Review all incidents with status `Open` or `Contained` in the Incident Register. For each item, confirm:

- Has the SLA been met? If not, why not and what is the revised timeline?
- Are all action items assigned to named owners with due dates?
- Has any incident changed severity since last reviewed?
- Are any incidents approaching the 4-week threshold that triggers Board Risk Committee escalation?

Incidents that have been remediated but not formally closed must be closed in the register with a closure note at this meeting or assigned a closure date no more than 5 business days away.

### 2.3 Item 3: Mode Performance Leaderboard — Detailed Guidance

Pull the mode performance data immediately before the meeting:

```
GET /api/mlro/mode-performance
```

Review the leaderboard with attention to:

- Modes with the **highest Brier scores** (worst-performing) — consider suspension or calibration
- Modes with **fewer than 30 scored samples** — flag as "insufficient data; reserve judgement"
- Modes whose **hit rate has declined > 10%** since the prior week — immediate investigation
- Modes flagged as using `defaultApply()` stubs — confirm these are not being relied upon for dispositions

Also review the Brier summary:

```
GET /api/mlro/brier
```

If `drift.warning` is `true` in the Brier report, treat as an immediate agenda item regardless of where it sits in the formal sequence.

### 2.4 Item 4: MLRO Flags — Detailed Guidance

The MLRO presents cases from the prior week under the following categories:

**a) AI proposal overrides** — cases where the MLRO rejected the Auto-Dispositioner's (HS-004) proposal. For each override: what did the system propose, what did the MLRO decide, and why? Are there patterns suggesting a systematic gap?

**b) Escalations** — cases where confidence was below 65% and the system correctly escalated. Were these resolved promptly? Any patterns in what types of cases are consistently below threshold?

**c) Novel typologies** — cases involving typologies, schemes, or subject profiles not well-represented in current training data or reasoning mode coverage. Consider whether new modes or keywords are warranted.

**d) Charter near-misses** — cases where the tipping-off guard, charter validator, or redline checks fired and blocked an output. Were these genuine catches or false alarms? If false alarms, does the guard need tuning?

**e) goAML submission status** — any pending STRs, SARs, FFRs, or PNMRs. Confirm all are within statutory filing windows.

**f) PEP declassification reviews** — any PEPs approaching the end of the 1-year or 5-year cooling-off window (D17 cases).

**g) Feedback for Data Science** — qualitative observations about output quality, narrative clarity, or reasoning coherence.

### 2.5 Item 5: Upcoming Changes — Approval Criteria

For each proposed change, the committee confirms:

| Question | If Yes | If No |
|---|---|---|
| Does this change alter a confidence threshold? | Major change — CEO approval required | Proceed to next question |
| Does this change add or remove a data source? | Major change | Proceed to next question |
| Does this change affect the output taxonomy (verdict categories)? | Major change | Proceed to next question |
| Does this change affect the Auto-Dispositioner logic? | Major change | Proceed to next question |
| Is this a keyword list update only? | Minor change — MLRO approval sufficient | Proceed to next question |
| Is this a bug fix with no algorithmic impact? | Minor change | Proceed to next question |

Major changes require CEO sign-off in addition to MLRO and committee ratification. Decisions are recorded in the minutes.

---

## 3. Meeting Administration

### 3.1 Pre-Meeting Preparation

By **08:30 on the meeting day**, the following must be prepared:

| Item | Owner |
|---|---|
| Pull drift alerts: `GET /api/mlro/drift-alerts` | Engineering Lead |
| Pull Brier score report: `GET /api/mlro/brier` | Data Science Lead |
| Pull mode performance leaderboard: `GET /api/mlro/mode-performance` | Data Science Lead |
| Prepare incident log summary (open items, SLA status) | MLRO / Compliance Officer |
| Prepare list of proposed changes for committee review | Engineering Lead / Data Science Lead |
| Prepare MLRO edge-case notes | MLRO |

### 3.2 Minutes

Minutes are drafted by the Compliance Officer during the meeting and distributed to all standing members within 2 hours of the meeting ending. Minutes are confirmed (or corrected) at the opening of the following week's meeting.

Minutes must record:
- Date, time, attendees, and quorum confirmation
- For each agenda item: summary of discussion, decisions made, action items with owner and due date
- Any dissents or abstentions
- Date of next meeting

### 3.3 Action Item Tracking

All action items from committee meetings are tracked in a standing action register. Items that remain open for more than 4 weeks without documented progress are escalated to the Board Risk Committee.

### 3.4 Confidentiality

Committee minutes and pre-meeting data packs are classified as Restricted. They may be shared with:
- Standing committee members
- Ad-hoc attendees for the relevant session
- External auditors upon request
- Regulatory inspectors upon request

Minutes must **not** be shared with subjects of active investigations or cases under review. The minutes themselves do not name active subjects; case references use anonymised case IDs.

### 3.5 Regulatory Access

Governance committee minutes, agenda packs, and action registers are retained for 10 years per FDL 10/2025 Art. 24 (record class: `audit_report`) and are available for regulatory inspection upon request without further notice.

---

## 4. Minutes Template

```
HAWKEYE STERLING — AI GOVERNANCE COMMITTEE
WEEKLY MEETING MINUTES
===========================================

Meeting Date:     [Friday, DD Month YYYY]
Time:             09:00–09:30 GST
Format:           [In-person / Video call]
Chair:            [MLRO Name]
Minutes Author:   [Compliance Officer Name]

ATTENDEES
---------
[ ] MLRO (Chair):              [Name]
[ ] Compliance Officer:        [Name]
[ ] Data Science Lead:         [Name]
[ ] Engineering Lead:          [Name]
[ ] [Ad-hoc] CEO:              [Name] — Reason: [reason]
[ ] [Ad-hoc] Legal Counsel:    [Name] — Reason: [reason]

Quorum:  [ ] Confirmed  [ ] Not reached — meeting rescheduled to [date]

PRIOR MINUTES
-------------
Minutes of [prior date] meeting:  [ ] Confirmed as accurate  [ ] Corrected — changes: [details]

──────────────────────────────────────────────────────────────

ITEM 1 — DRIFT ALERTS
Data source: GET /api/mlro/drift-alerts (pulled [HH:MM] GST)

Drift alerts returned: [ ] None  [ ] [N] alert(s) — details below

| Alert ID | System | Metric | Value | Threshold | Status |
|----------|--------|--------|-------|-----------|--------|
| [ID]     | [sys]  | [metric] | [val] | [thr]   | [Open/Actioned] |

Cron health (sanctions / PEP / adverse media ingest): [ ] All healthy  [ ] Issues: [details]

Discussion summary:
[Summary of committee discussion]

Decisions:
[Decision text with rationale]

Action items:
| Action                        | Owner             | Due Date   |
|-------------------------------|-------------------|------------|
| [Action]                      | [Name/Role]       | [date]     |

──────────────────────────────────────────────────────────────

ITEM 2 — INCIDENT LOG REVIEW

Open incidents reviewed:

| Incident ID        | Category | Severity | Age (days) | SLA Status | Remediation Status |
|--------------------|----------|----------|------------|------------|--------------------|
| INC-[date]-[NNN]   | CAT-[N]  | [sev]    | [N]        | [On track/At risk/Breached] | [status] |

Incidents closed this week:
[ ] [Incident ID] — closed [date]; closure rationale: [summary]
[ ] None

Incidents escalated to Board Risk Committee:
[ ] [Incident ID] — escalation rationale: [summary]
[ ] None

Action items:
| Action                        | Owner             | Due Date   |
|-------------------------------|-------------------|------------|
| [Action]                      | [Name/Role]       | [date]     |

──────────────────────────────────────────────────────────────

ITEM 3 — MODE PERFORMANCE LEADERBOARD
Data source: GET /api/mlro/mode-performance (pulled [HH:MM] GST)
Brier summary: GET /api/mlro/brier (pulled [HH:MM] GST)

Overall Brier score:    [value]
Overall hit rate:       [value]
Drift warning active:   [ ] Yes  [ ] No
Samples in window:      [N]

Top 5 performing modes (lowest Brier score):
| Rank | Mode ID           | Brier Score | Hit Rate | N Samples |
|------|-------------------|-------------|----------|-----------|
| 1    | [mode_id]         | [score]     | [rate]   | [N]       |

Bottom 5 modes (highest Brier score — worst performing):
| Rank | Mode ID           | Brier Score | Hit Rate | N Samples | Action |
|------|-------------------|-------------|----------|-----------|--------|
| N    | [mode_id]         | [score]     | [rate]   | [N]       | [action] |

Modes flagged for insufficient data (n < 30): [list or "None"]

Modes suspended or under investigation: [list or "None"]

Discussion summary:
[Summary of committee discussion]

Action items:
| Action                        | Owner             | Due Date   |
|-------------------------------|-------------------|------------|
| [Action]                      | [Name/Role]       | [date]     |

──────────────────────────────────────────────────────────────

ITEM 4 — MLRO FLAGS AND EDGE CASES

Auto-Dispositioner overrides this week: [N] overrides out of [N] total proposals
Override rate: [%]  (Alert threshold: > 15%)

Edge cases presented: [N]

| Case Ref (anonymised) | Category | AI Proposal | MLRO Decision | Override Reason | Follow-up Action |
|-----------------------|----------|-------------|---------------|-----------------|------------------|
| CASE-[NNN]            | [type]   | D[NN]       | D[NN]         | [reason]        | [action]         |

Novel typologies or coverage gaps identified:
[ ] Yes — description: [details]; proposed response: [details]
[ ] None

Charter near-misses or guardrail activations:
[ ] [N] tipping-off guard activations — assessment: [genuine catch / false alarm]
[ ] [N] charter validation failures — assessment: [details]
[ ] None

goAML submission status:
[ ] All STRs/SARs/FFRs within statutory windows — no action required
[ ] Pending filings: [list filing type, case ref, deadline]

PEP declassification (D17) reviews approaching window:
[ ] CASE-[NNN] — [role], left office [date], cooling-off expires [date]
[ ] None

MLRO qualitative observations:
[Free text — narrative quality, reasoning coherence, any concerns or commendations]

Action items:
| Action                        | Owner             | Due Date   |
|-------------------------------|-------------------|------------|
| [Action]                      | [Name/Role]       | [date]     |

──────────────────────────────────────────────────────────────

ITEM 5 — UPCOMING CHANGES REQUIRING GOVERNANCE APPROVAL

| Change ID      | Description            | Classification | Requester       | Committee Decision | Conditions |
|----------------|------------------------|----------------|-----------------|-------------------|------------|
| CHG-[date]-[N] | [description]          | Major / Minor  | [Name/Role]     | Approved / Rejected / Deferred | [conditions] |

Changes requiring CEO sign-off before deployment:
[ ] CHG-[ID] — CEO approval to be obtained by [date]
[ ] None

Action items:
| Action                        | Owner             | Due Date   |
|-------------------------------|-------------------|------------|
| [Action]                      | [Name/Role]       | [date]     |

──────────────────────────────────────────────────────────────

STANDING ACTION REGISTER STATUS

Items from prior weeks:
| Action Ref | Description          | Owner       | Original Due | Current Status |
|------------|----------------------|-------------|--------------|----------------|
| ACT-[ID]   | [description]        | [Name/Role] | [date]       | [status]       |

Items overdue > 4 weeks (escalated to Board Risk Committee):
[ ] ACT-[ID] — escalated [date]
[ ] None

──────────────────────────────────────────────────────────────

ANY OTHER BUSINESS
[Free text or "None"]

──────────────────────────────────────────────────────────────

NEXT MEETING
Date:    [Friday, DD Month YYYY]
Time:    09:00–09:30 GST

SIGN-OFF
Minutes drafted by:   [Compliance Officer Name], [HH:MM] GST
Confirmed by Chair:   [MLRO Name], [date]
```

---

## 5. Meeting Archive

Minutes are archived below in reverse chronological order. All minutes are retained for 10 years per FDL 10/2025 Art. 24 (record class: `audit_report`).

---

### 2026-05-09 — Inaugural Meeting

**Date:** Friday, 9 May 2026  
**Time:** 14:00–14:30 GST  
**Chair:** [MLRO Name]  
**Attendees:** MLRO, Compliance Officer, Data Science Lead, Engineering Lead, Legal Counsel  
**Quorum:** Confirmed

**Item 1 — Drift Alerts:** No alerts active at inaugural meeting. Engineering Lead confirmed `GET /api/mlro/drift-alerts` endpoint operational. Cron health confirmed for all ingestion jobs.

**Item 2 — Incident Log:** No open incidents at inaugural meeting. Incident register initialised per `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`.

**Item 3 — Mode Performance:** Baseline Brier scores established for all production modes. Mode performance leaderboard confirmed accessible via `GET /api/mlro/mode-performance`. Modes using `defaultApply()` stubs identified and flagged as "insufficient data — do not rely on for dispositions."

**Item 4 — MLRO Flags:** No edge cases in first week of operation. MLRO confirmed goAML integration under test. No pending filings. No PEP declassification reviews active.

**Item 5 — Upcoming Changes:**
- [GOV-001] AI Governance Policy (`docs/governance/AI_GOVERNANCE_POLICY.md`) approved by governance committee — forwarded to board for sign-off. **Decision: Approved.**
- [GOV-002] MLRO Auto-Dispositioner (HS-004) remains PILOT status; full production promotion requires board approval. **Decision: Confirmed.**
- [GOV-003] FDL crosswalk completed — all citations updated from FDL 20/2018 to FDL 10/2025 where applicable. **Decision: Noted.**

**Action Items:**

| Action | Owner | Due Date | Status |
|---|---|---|---|
| Board sign-off on AI_GOVERNANCE_POLICY.md | MLRO → CEO | 2026-05-16 | Open |
| Establish weekly pre-meeting preparation schedule | Engineering Lead | 2026-05-13 | Open |
| Configure drift alert webhook notifications for on-call engineering | Engineering Lead | 2026-05-13 | Open |
| Define initial RSS feed list for DS-011 | Engineering Lead | 2026-05-16 | Open |
| Schedule first quarterly data lineage review | Engineering Lead | 2026-06-01 | Open |
| Document mode stub list for committee reference | Data Science Lead | 2026-05-16 | Open |
| UAE FIU goAML registration confirmation (GOAML_RENTITY_ID) | MLRO + Legal | 2026-05-31 | Open |
| Complete model cards HS-001 through HS-005 | Data Science Lead | 2026-05-23 | Open |

**Next meeting:** Friday, 16 May 2026, 09:00 GST

---

*[Subsequent meeting minutes will be appended here in reverse chronological order.]*

---

**Document Control**

| Field | Value |
|---|---|
| Document ID | HS-GOV-003 |
| Version | 2.0.0 |
| Created | 2026-05-10 |
| Last Revised | 2026-05-06 |
| Next mandatory review | 2027-05-06 |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md`, `docs/governance/AI_INVENTORY.md`, `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`, `docs/data-governance/DATA_LINEAGE.md` |
| Regulatory references | UAE FDL 10/2025 Art. 24 (audit requirements); FATF R.18 (internal controls) |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
