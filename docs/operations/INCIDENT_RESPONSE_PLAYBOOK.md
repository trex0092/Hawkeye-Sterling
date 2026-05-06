# Incident Response Playbook

**Document ID:** HS-OPS-001  
**Version:** 1.0.0  
**Effective Date:** 2026-05-06  
**Review Cycle:** Annual; updated following any CRITICAL incident  
**Owner:** MLRO  
**Classification:** Restricted — Internal Compliance and Operations Use Only

---

## Table of Contents

1. [Purpose and Regulatory Basis](#1-purpose-and-regulatory-basis)
2. [Severity Classification](#2-severity-classification)
3. [Incident Categories](#3-incident-categories)
4. [General Response Procedures](#4-general-response-procedures)
5. [Category-Specific Response Procedures](#5-category-specific-response-procedures)
6. [Escalation Matrix](#6-escalation-matrix)
7. [Incident Log Template](#7-incident-log-template)
8. [SLA Targets](#8-sla-targets)
9. [Post-Incident Review](#9-post-incident-review)
10. [Document Control](#10-document-control)

---

## 1. Purpose and Regulatory Basis

This playbook defines the procedures for detecting, classifying, responding to, and recovering from incidents affecting the Hawkeye Sterling AML/CFT AI platform. It applies to all personnel with access to the platform and is binding on the MLRO, Compliance, Engineering, Data Science, Legal, and Executive teams.

**Why this playbook matters:** An AI incident in an AML/CFT context is not a standard IT incident. An undetected false negative can result in a sanctioned party receiving financial services. A data source failure can produce a stale sanctions list. A goAML submission failure can cause a statutory reporting deadline to be missed. Each of these outcomes carries potential criminal liability under UAE law.

### Regulatory Basis

| Instrument | Relevance |
|---|---|
| **UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025), Art. 24** | Audit trail and record-retention requirements; every incident must be documented with sufficient detail to support regulatory audit |
| **FDL 10/2025, Art. 34** | Whistleblower protection — incidents involving internal reports of control failures must be handled under ring-fenced procedures |
| **UAE Federal Decree-Law No. 20 of 2018 as amended, Art. 25** | Tipping-off prohibition — incident response communications must not disclose investigations to subjects |
| **Cabinet Decision No. 74 of 2020, Art. 4–7** | Funds Freeze Report (FFR) timelines — a 24-hour freeze window and 5-business-day filing window must be tracked and any breach treated as a CRITICAL incident |
| **FATF Recommendations R.18** | Internal controls, audit, and training — incident response is a component of the internal control framework |
| **FATF Recommendations R.11** | Record-keeping — incident records must be retained for a minimum of 10 years per internal policy |

---

## 2. Severity Classification

### 2.1 Severity Levels

| Severity | Response Time (Detection to MLRO Notification) | Description |
|---|---|---|
| **CRITICAL** | **1 hour** | Incident with actual or highly probable regulatory breach, criminal liability, or immediate threat to AML/CFT programme integrity |
| **HIGH** | **4 hours** | Incident with material impact on screening capability, data integrity, or regulatory reporting; no immediate breach but rapid deterioration possible |
| **MEDIUM** | **24 hours** | Incident with moderate impact; controls remain partially operational; no immediate regulatory deadline at risk |
| **LOW** | **5 business days** | Minor anomalies, cosmetic issues, documentation gaps; no operational impact on compliance controls |

### 2.2 Severity Escalation Triggers

Severity escalates automatically to the next level if the Response Time target is not met, or if any of the following conditions emerge during investigation:

- Evidence of a confirmed false negative (genuine sanctioned party or suspicious activity not detected)
- Evidence that a regulatory filing deadline has been or will be missed
- Evidence that tipping-off has occurred
- Evidence of data tampering or audit trail compromise
- Discovery that the incident has been ongoing longer than initially assessed

### 2.3 CRITICAL Automatic Triggers

The following conditions are automatically CRITICAL regardless of initial assessment:

- Any confirmed sanctions false negative (genuine OFAC/UN/EOCN/EU/UK match missed)
- Any tipping-off breach (charter P4; FDL 20/2018 Art. 25)
- Any goAML submission failure during an active FFR or STR deadline window
- FFR not filed within 5 business days of a confirmed sanctions match
- Funds not frozen within 24 hours of a confirmed EOCN/UN/local terrorist match
- Any evidence of audit chain tampering
- Any security breach with access to case data or screening outputs
- Any regulatory inquiry received

---

## 3. Incident Categories

Six incident categories are defined for AI system failures. All other incidents follow the General Response Procedures in Section 4.

| Category ID | Category Name | System(s) Primarily Affected |
|---|---|---|
| CAT-1 | Model Drift | HS-001, HS-002, HS-003, HS-004 |
| CAT-2 | Data Source Failure | HS-001, HS-003 |
| CAT-3 | Sanctions List Corruption | HS-001 |
| CAT-4 | GoAML Submission Failure | HS-005 |
| CAT-5 | Security Breach | All systems |
| CAT-6 | Regulatory Inquiry | All systems |

---

## 4. General Response Procedures

The following steps apply to all incidents, regardless of category. Category-specific procedures in Section 5 supplement — they do not replace — these general steps.

### Step 1: Detection and Initial Logging

| Action | Owner | Time Target |
|---|---|---|
| Detect incident (automated alert, user report, external notification) | Engineering / Any staff | N/A |
| Log incident in the Incident Register (see Section 7 template) | Incident Responder (first to detect) | Within 30 minutes of detection |
| Assign incident ID (format: `INC-YYYY-MM-DD-NNN`) | Engineering Lead | Within 30 minutes |
| Perform initial severity classification | Engineering Lead + MLRO (jointly) | Within 1 hour |

### Step 2: Notification

| Severity | Notification Chain |
|---|---|
| CRITICAL | MLRO (1 hour) → CEO (same day) → Board Risk Committee (24 hours) → Legal Counsel (same day) |
| HIGH | MLRO (4 hours) → Engineering Lead → Data Science Lead |
| MEDIUM | MLRO (24 hours) → Engineering Lead |
| LOW | Engineering Lead (5 business days); MLRO notified at next governance committee meeting |

### Step 3: Containment

Immediate containment actions to prevent the incident from worsening:
- Isolate affected system or data source if doing so does not create a worse compliance gap
- Revert to the prior known-good system version if the incident is caused by a recent deployment
- Suspend automated functions (e.g., auto-dispositioner, goAML auto-submit) if integrity is in doubt
- Preserve all logs and telemetry in read-only state — do not delete or overwrite anything

**Under no circumstances should containment actions destroy audit trail evidence.**

### Step 4: Impact Assessment

Quantify:
- Number of screening runs potentially affected
- Date range of the incident window
- Whether any regulatory filing deadlines fall within the incident window
- Whether any subjects were incorrectly cleared (false negative), incorrectly flagged (false positive), or received an incorrect disposition proposal

### Step 5: Remediation

- Apply fix, restore data source, roll back model version, or implement workaround as appropriate
- Validate fix against the pre-deployment checklist before returning to production
- Re-screen all subjects affected during the incident window if a false negative is possible
- Document remediation actions in the incident log

### Step 6: Recovery

- Return systems to normal operational status
- Verify all SLA targets for pending filings are still achievable; escalate if at risk
- Confirm audit chain integrity via `GET /api/mlro/audit-chain`

### Step 7: Post-Incident Review

See Section 9. Mandatory for CRITICAL and HIGH incidents; recommended for MEDIUM.

---

## 5. Category-Specific Response Procedures

### CAT-1: Model Drift

**Definition:** Measurable degradation in AI model accuracy relative to baseline, detected via Brier score monitoring, drift-delta alerts, or MLRO validation feedback reversals.

**Detection Signals:**
- `GET /api/mlro/drift-alerts` returns `warning: true`
- `drift.delta` (recentHitRate − olderHitRate) > 0.15 in absolute value
- `model_drift_score` (normalised 0–1) > 0.15 per risk appetite registry
- Manual MLRO reversals exceed 15% of total dispositions in a rolling 30-day window

**Severity Assessment:**

| Condition | Severity |
|---|---|
| Drift score > 0.20 or FNR > 1% | CRITICAL |
| Drift score 0.15–0.20 or FPR 3%–5% | HIGH |
| Drift score 0.10–0.15 | MEDIUM |
| Drift score < 0.10, trending upward | LOW |

**Response Actions:**

1. Pull current Brier report (`GET /api/mlro/brier`) and mode-performance leaderboard
2. Identify which modes or data windows are driving the drift
3. Suspend affected modes if drift is mode-specific and alternatives exist
4. If drift is systemic (affects all modes), consider suspending the pipeline and routing cases to manual review
5. Conduct root-cause analysis: data distribution shift? upstream list change? model interaction?
6. Retrain or re-calibrate affected components with MLRO and Data Science Lead approval
7. Run full regression test suite before restoring to production
8. Back-fill calibration ledger with corrected ground-truth labels
9. Document root cause, fix, and back-testing results in incident log

**Post-Incident:** Update AI Inventory with new performance baseline; add to governance committee agenda.

---

### CAT-2: Data Source Failure

**Definition:** Failure to ingest, validate, or process data from one or more of the 10 registered data sources (sanctions lists, PEP database, or adverse-media sources).

**Detection Signals:**
- Automated ingestion job failure alert
- `screening_freshness_days` metric exceeds 1-day threshold
- Watchlist adapter raises `Phase-2` parse error in production (unexpected)
- Data quality gate (`src/integrations/qualityGates.ts`) fails PGP verification, XSD schema validation, or MD5 checksum

**Severity Assessment:**

| Condition | Severity |
|---|---|
| UN, OFAC SDN, or UAE EOCN list failure | CRITICAL |
| EU, UK OFSI, or OpenSanctions PEP failure | HIGH |
| NewsAPI, GDELT, or CSE failure | HIGH |
| RSS feed failure only | MEDIUM |

**Response Actions:**

1. Identify which source(s) have failed and the failure mode (network, auth, schema, checksum)
2. For CRITICAL list failures (UN, OFAC, EOCN): **immediately suspend screening runs** that would produce results without that list; do not issue NO MATCH results against an incomplete scope
3. Notify MLRO within 1 hour (CRITICAL) or 4 hours (HIGH) with scope of impact
4. Attempt manual download of the list from the official source URL
5. If the official source is unavailable, document the unavailability and preserve evidence
6. Validate any manually obtained list through the full quality gate pipeline before ingesting
7. Once the source is restored and validated, re-run screening for all cases processed during the outage window
8. If re-screening produces different results, treat any new matches as potential CRITICAL incidents

**Post-Incident:** Review data source SLA and add secondary source or fallback for CRITICAL lists.

---

### CAT-3: Sanctions List Corruption

**Definition:** A sanctions list ingested by the system contains data that fails integrity checks, has been tampered with, or contains materially incorrect designations.

**Detection Signals:**
- PGP signature verification failure
- XSD schema validation failure
- MD5 checksum mismatch between fetched file and reference hash
- Unexpected removal of designations that remain current on the official source
- Unexpected addition of designations not present on the official source

**Severity Assessment:** Always CRITICAL. Any corruption of a sanctions list has the potential to cause a false negative.

**Response Actions:**

1. **Immediately quarantine** the corrupted list; do not use for any screening
2. Notify MLRO within 1 hour
3. Suspend screening runs that would use the affected list until integrity is confirmed
4. Download a fresh copy directly from the official authoritative source URL
5. Verify the fresh copy against PGP signature, XSD schema, and MD5 checksum
6. If the official source itself is compromised (unlikely but possible), notify Engineering Lead and Legal Counsel; escalate to CEO; consider notifying the UAE FIU
7. Re-screen all subjects screened during the corruption window against the validated list
8. Document all integrity check results and chain-of-custody for the corrupted file
9. Preserve the corrupted file as evidence — do not delete

**Post-Incident:** Review integrity gate controls; consider adding secondary independent hash source.

---

### CAT-4: GoAML Submission Failure

**Definition:** Failure to successfully submit an STR, SAR, FFR, or PNMR to the UAE FIU via the goAML platform within the statutory deadline.

**Detection Signals:**
- `GoamlSubmissionReceipt.status = 'rejected'` or `'pending'` beyond SLA window
- HTTPS transport exception (network, cert, auth)
- Missing submission receipt for a filing that was approved by MLRO

**Filing Deadlines (Statutory):**

| Report Type | Statutory Deadline | Internal Target | Reference |
|---|---|---|---|
| STR | As soon as reasonably practicable after suspicion arises | 24 hours from MLRO approval | FDL 20/2018 Art. 15 / FDL 10/2025 |
| FFR — Freeze | Within 24 hours of confirmed match | 12 hours | Cabinet Decision 74/2020 Art. 4 |
| FFR — Filing | Within 5 business days of freeze | 3 business days | Cabinet Decision 74/2020 Art. 7 |
| PNMR | Within 5 business days of partial match | 3 business days | Cabinet Decision 74/2020 |
| SAR | As soon as reasonably practicable | 24 hours from MLRO approval | FDL 10/2025 |

**Severity Assessment:**

| Condition | Severity |
|---|---|
| FFR freeze deadline at risk (< 4 hours remaining) | CRITICAL |
| FFR filing deadline at risk (< 24 hours remaining) | CRITICAL |
| STR deadline at risk (< 8 hours remaining) | CRITICAL |
| Submission rejected; deadline > 24 hours away | HIGH |
| Submission pending; deadline > 48 hours away | MEDIUM |

**Response Actions:**

1. Identify the failure mode: transport failure, credential expiry, schema rejection, regulator-side issue
2. Attempt resubmission via the HTTPS transport; document each attempt with timestamp
3. If HTTPS transport is unavailable, attempt SFTP submission as fallback
4. If both transports are unavailable and deadline is at risk, contact the UAE FIU directly by phone/email to notify of technical difficulty and request guidance — document this contact
5. Escalate to CEO if any statutory deadline is missed or imminently at risk
6. Once submission succeeds, verify the `submissionId` and `chainAnchor` are recorded
7. If deadline was missed: treat as a potential self-disclosure event (D15); MLRO and Legal Counsel to assess within 24 hours

**Post-Incident:** Review transport configuration; test certificate validity; add submission monitoring alert.

---

### CAT-5: Security Breach

**Definition:** Unauthorised access to, modification of, or exfiltration of case data, screening outputs, model parameters, or audit chain records. Includes insider threats, external attacks, and accidental exposure.

**Detection Signals:**
- SIEM alert on privileged-user access anomaly
- `insider_access_anomaly_rate` metric breach in risk appetite registry
- Unexpected changes to audit chain records
- Unauthorised API access to MLRO surfaces
- Evidence of credential compromise or social engineering

**Severity Assessment:**

| Condition | Severity |
|---|---|
| Case data or subject PII exfiltrated | CRITICAL |
| Audit chain record modified | CRITICAL |
| Screening output tampered | CRITICAL |
| Unauthorised read-only access to case data | HIGH |
| Failed intrusion attempt (no data accessed) | MEDIUM |
| Security configuration misconfiguration (no access gained) | LOW |

**Response Actions:**

1. Immediately revoke compromised credentials and terminate active sessions
2. Preserve all access logs in read-only state; do not purge
3. Notify MLRO and Legal Counsel within 1 hour (CRITICAL)
4. Assess whether any compromised data relates to a subject of a pending investigation; if yes, consider tipping-off risk and take protective action
5. Assess whether PDPL notification obligations are triggered (UAE Federal Decree-Law 45/2021)
6. Engage Information Security team and, if warranted, UAE CIRT or equivalent
7. If insider threat: activate D30 (insider threat investigation); ring-fence the case from the relevant business line
8. Preserve all evidence in a forensically sound manner for potential regulatory inspection under FDL 10/2025 Art. 24

**Post-Incident:** Full security review; penetration test if CRITICAL breach; regulatory notification as required.

---

### CAT-6: Regulatory Inquiry

**Definition:** Receipt of a formal or informal inquiry, inspection notice, information request, or enforcement action from a competent authority (UAE Ministry of Economy, CBUAE, SCA, DFSA, ADGM FSRA, UAE FIU, or equivalent).

**Detection Signals:**
- Written communication from a regulator referencing Hawkeye Sterling or its AML/CFT programme
- Verbal notification from a regulator representative
- Notification of a scheduled inspection or examination
- Receipt of a legal process (court order, subpoena, production order)

**Severity Assessment:** All regulatory inquiries are treated as at least HIGH; escalate to CRITICAL if the inquiry relates to:
- A specific case with a potential missed filing
- An allegation of tipping-off
- An allegation of a confirmed sanctions breach
- An allegation of employee misconduct

**Response Actions:**

1. **Do not respond to any regulatory inquiry without MLRO and Legal Counsel review**
2. Notify MLRO and Legal Counsel immediately (within 1 hour)
3. Preserve all case files, communications, and AI output records relevant to the inquiry scope — invoke litigation hold (D26)
4. Activate heightened confidentiality protocol (D27): all internal communications referencing the inquiry are subject to legal professional privilege review before dissemination
5. Do not share any information relating to the inquiry with the subject of the inquiry
6. Do not delete, modify, or archive any records potentially within scope
7. Assign a single point of contact for all regulatory communications (Legal Counsel or MLRO)
8. Track the inquiry in the incident log with all correspondence dates and attachments
9. Prepare a response within the regulator's stated timeline; review all AI outputs that will be disclosed

**Audit Obligations (FDL 10/2025 Art. 24):** All records relating to the inquiry, including the AI system outputs, model versions active at the time, and configuration snapshots, must be available for regulatory inspection. The 10-year retention policy applies.

---

## 6. Escalation Matrix

### 6.1 Notification Timelines by Severity and Role

| Severity | Engineering Lead | Data Science Lead | MLRO | Compliance Officer | Legal Counsel | CEO | Board Risk Committee |
|---|---|---|---|---|---|---|---|
| CRITICAL | Immediate | Immediate | ≤ 1 hour | ≤ 1 hour | ≤ 1 hour | Same day | ≤ 24 hours |
| HIGH | ≤ 1 hour | ≤ 1 hour | ≤ 4 hours | ≤ 4 hours | As needed | As needed | Next meeting |
| MEDIUM | ≤ 4 hours | ≤ 24 hours | ≤ 24 hours | Next meeting | As needed | — | — |
| LOW | ≤ 5 days | — | Next governance meeting | Next meeting | — | — | — |

### 6.2 Decision Authority

| Decision | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Suspend AI system | MLRO (oral, confirmed in writing) | MLRO | MLRO or Engineering Lead | Engineering Lead |
| Roll back deployment | MLRO + Engineering Lead | Engineering Lead | Engineering Lead | Engineering Lead |
| Self-disclose to regulator | MLRO + CEO | MLRO + Legal | MLRO | MLRO |
| File emergency STR/SAR | MLRO | MLRO | MLRO | MLRO |
| Invoke litigation hold | Legal Counsel + MLRO | Legal Counsel + MLRO | Legal Counsel | Legal Counsel |
| Notify Board | CEO + MLRO (mandatory) | MLRO (discretion) | Not required | Not required |

---

## 7. Incident Log Template

All incidents are recorded using the following template. Completed incident logs are retained for 10 years per FDL 10/2025 Art. 24 (record class: `incident_report`).

---

```
HAWKEYE STERLING — INCIDENT LOG
================================

Incident ID:      INC-YYYY-MM-DD-NNN
Date Detected:    [ISO 8601 datetime]
Date Reported:    [ISO 8601 datetime]
Reported By:      [Name and role]
System(s) Affected: [HS-001 / HS-002 / HS-003 / HS-004 / HS-005 / Infrastructure]
Category:         [CAT-1 through CAT-6 / Other]
Severity:         [CRITICAL / HIGH / MEDIUM / LOW]
Status:           [Open / Contained / Remediated / Closed]

DESCRIPTION
-----------
[Clear description of what occurred, how it was detected, and initial assessment
of impact. Include timestamps, system versions, and data sources affected.]

REGULATORY FILING AT RISK?
--------------------------
[ ] Yes — Filing type: [STR/SAR/FFR/PNMR], Deadline: [date/time]
[ ] No
[ ] Under assessment

IMPACT ASSESSMENT
-----------------
Number of screening runs affected:
Date range of incident window:
False negatives possible:            [ ] Yes  [ ] No  [ ] Unknown
False positives generated:           [number if known]
Data source(s) affected:             [list IDs]
Model version(s) affected:           [version strings]

NOTIFICATION LOG
----------------
| Recipient          | Role                | Notified At         | Method   |
|--------------------|---------------------|---------------------|----------|
| [Name]             | Engineering Lead    | [ISO 8601]          | [Slack/Email/Call] |
| [Name]             | MLRO                | [ISO 8601]          | [method] |
| [Name]             | CEO                 | [ISO 8601]          | [method] |
| [Name]             | Legal Counsel       | [ISO 8601]          | [method] |
| [Regulator]        | External            | [ISO 8601]          | [method] |

CONTAINMENT ACTIONS
-------------------
[Describe actions taken to prevent the incident from worsening, with timestamps
and names of personnel who took each action.]

REMEDIATION ACTIONS
-------------------
[Describe fix applied, data source restored, system rolled back, etc.
Include validation steps taken before returning to production.]

ROOT CAUSE
----------
[Analysis of the underlying cause. Categories: Data Source Issue /
Model Degradation / Configuration Error / External Attack / Human Error /
Third-Party Failure / Regulatory Change / Unknown]

RE-SCREENING REQUIRED?
-----------------------
[ ] Yes — Scope: [list affected subjects/date range]
[ ] No — Rationale: [why re-screening is not required]

REGULATORY SELF-DISCLOSURE REQUIRED?
-------------------------------------
[ ] Yes — Filed: [date] via [method]
[ ] No — Rationale: [MLRO sign-off required]
[ ] Under assessment — Decision due: [date]

LESSONS LEARNED
---------------
[What control improvements are required? What early warning signals were missed?]

ACTION ITEMS
------------
| Action                        | Owner             | Due Date   | Status  |
|-------------------------------|-------------------|------------|---------|
| [Action 1]                    | [Name/Role]       | [date]     | Open    |

CLOSURE
-------
Closed By:        [Name and role]
Closed At:        [ISO 8601 datetime]
Closure Notes:    [Summary of how the incident was resolved and verified]
Post-Incident Review Completed:  [ ] Yes — Date: [date]  [ ] Not required
```

---

## 8. SLA Targets

### 8.1 Response SLA Targets

| Severity | Detection to MLRO Notification | Detection to Containment | Detection to Remediation | Incident Report Filed |
|---|---|---|---|---|
| CRITICAL | 1 hour | 4 hours | 24 hours | Within 4 hours |
| HIGH | 4 hours | 8 hours | 5 business days | Within 24 hours |
| MEDIUM | 24 hours | 5 business days | 15 business days | Within 5 business days |
| LOW | 5 business days | 15 business days | 30 business days | Within 10 business days |

### 8.2 Regulatory Filing SLA Targets

| Filing Type | Trigger | Statutory Deadline | Internal Target | SLA Breach Severity |
|---|---|---|---|---|
| FFR — Freeze | Confirmed sanctions match | 24 hours | 12 hours | CRITICAL |
| FFR — Filing | Freeze completed | 5 business days | 3 business days | CRITICAL |
| STR | MLRO approval | As soon as reasonably practicable | 24 hours | CRITICAL if missed |
| SAR | MLRO approval | As soon as reasonably practicable | 24 hours | CRITICAL if missed |
| PNMR | Partial match identified | 5 business days | 3 business days | HIGH if missed |

### 8.3 AI System Performance SLA Targets

| Metric | Target | Breach Severity |
|---|---|---|
| Screening freshness | ≤ 1 day | HIGH |
| Adverse media refresh (NewsAPI/CSE) | ≤ 5 minutes | MEDIUM |
| Adverse media refresh (GDELT) | ≤ 15 minutes | MEDIUM |
| Adverse media refresh (RSS) | ≤ 30 minutes | LOW |
| FPR across all screening outputs | < 5% | HIGH |
| FNR across validated cases | < 1% | CRITICAL |
| Escalation threshold enforcement | 100% (zero bypass) | CRITICAL |
| goAML submission success rate | ≥ 99.9% | CRITICAL if below |

---

## 9. Post-Incident Review

### 9.1 Scope

Post-incident reviews are mandatory for all CRITICAL incidents and all HIGH incidents with regulatory implications. They are recommended for other HIGH and MEDIUM incidents.

### 9.2 Timeline

| Severity | Review Meeting | Report Issued |
|---|---|---|
| CRITICAL | Within 5 business days of closure | Within 10 business days of closure |
| HIGH | Within 15 business days of closure | Within 20 business days of closure |
| MEDIUM | Next governance committee meeting | Summarised in committee minutes |

### 9.3 Review Agenda

1. Incident timeline reconstruction
2. Root cause analysis (5-whys or equivalent)
3. Effectiveness of response (did we meet our SLAs?)
4. Control gap identification (what failed to prevent or detect the incident?)
5. Action items and owners (specific, time-bound, measurable)
6. AI system changes required
7. Policy or playbook updates required
8. Training requirements

### 9.4 Governance Integration

Post-incident review findings are presented at the next Friday governance committee meeting. Action items are tracked in the committee minutes until closed. Systemic patterns identified across multiple incidents are escalated to the Board Risk Committee.

---

## 10. Document Control

| Field | Value |
|---|---|
| Document ID | HS-OPS-001 |
| Version | 1.0.0 |
| Created | 2026-05-06 |
| Next mandatory review | 2027-05-06 |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md`, `docs/governance/AI_INVENTORY.md`, `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` |
| Regulatory references | UAE FDL 10/2025 Art. 24 (audit requirements); FDL 20/2018 Art. 25 (tipping-off); Cabinet Decision 74/2020 Art. 4–7 (FFR timelines); FATF R.18 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `incident_report`) |
