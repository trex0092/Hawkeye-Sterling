# AI Governance Policy

**Document ID:** HS-GOV-001  
**Version:** 1.0.0  
**Effective Date:** 2026-05-06  
**Review Cycle:** Annual (mandatory); ad-hoc on material system change or regulatory update  
**Owner:** Money Laundering Reporting Officer (MLRO)  
**Classification:** Restricted — Internal Compliance Use Only

---

## Table of Contents

1. [Purpose and Regulatory Basis](#1-purpose-and-regulatory-basis)
2. [Scope](#2-scope)
3. [AI Risk Classification Framework](#3-ai-risk-classification-framework)
4. [Risk Tolerance Matrix](#4-risk-tolerance-matrix)
5. [Change Management Procedures](#5-change-management-procedures)
6. [Stakeholder Engagement and Accountability](#6-stakeholder-engagement-and-accountability)
7. [Incident Response Procedures](#7-incident-response-procedures)
8. [Annual Certification Requirements](#8-annual-certification-requirements)
9. [Governance Committee](#9-governance-committee)
10. [Prohibited Uses](#10-prohibited-uses)
11. [Document Control](#11-document-control)

---

## 1. Purpose and Regulatory Basis

### 1.1 Purpose

This policy establishes the governance framework for artificial intelligence and automated decision-support systems deployed by Hawkeye Sterling within its Anti-Money Laundering / Counter-Financing of Terrorism / Counter-Proliferation Financing (AML/CFT/CPF) compliance programme. It defines accountability, oversight obligations, risk tolerance limits, and operational controls applicable to all AI systems that contribute to regulatory decision-making.

The policy recognises that AI systems in a compliance context are not general-purpose tools. Their outputs inform decisions that carry legal, regulatory, and human-rights consequences, including:

- Denial of financial services to legitimate customers (civil liability exposure)
- Wrongful facilitation of a sanctioned party (criminal liability under UAE law)
- Tipping-off of a subject under investigation (criminal offence)
- Filing or failing to file a Suspicious Transaction Report (regulatory sanction)

Accordingly, all AI systems covered by this policy operate under the principle that **AI proposes; the MLRO decides**. No AI system within Hawkeye Sterling may autonomously dispose of a case, file a regulatory report, or freeze funds without prior human review and sign-off, except where a specific emergency escalation protocol has been pre-authorised in writing by the MLRO and CEO.

### 1.2 Regulatory Basis

This policy is issued pursuant to, and must be read in conjunction with:

| Instrument | Relevance |
|---|---|
| **UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025)** | Primary AML/CFT legislation; Art. 24 audit and record-retention requirements; Art. 34 whistleblower protection |
| **UAE Federal Decree-Law No. 20 of 2018 as amended** | AML/CFT/CPF offences; Art. 15 STR obligation; Art. 25 tipping-off prohibition |
| **Cabinet Decision No. 74 of 2020** | Targeted Financial Sanctions (TFS) implementation; Art. 4–7 freeze and FFR filing timelines |
| **Cabinet Resolution No. 16 of 2021** | DNFBP supervision and penalty schedule |
| **Cabinet Resolution No. 134 of 2025, Art. 19** | Four-eyes and Segregation of Duties controls |
| **FATF Recommendations (2023 revision)** | R.1 (risk-based approach), R.10 (CDD), R.11 (record-keeping), R.12 (PEPs), R.18 (internal controls), R.19 (high-risk countries), R.22 (DNFBP CDD), R.24 (beneficial ownership) |
| **UAE Personal Data Protection Law (PDPL) — Federal Decree-Law No. 45 of 2021** | Data subject rights; lawful basis for processing; cross-border transfer |
| **LBMA Responsible Gold Guidance (RGG)** | Supply-chain due diligence for DPMS precious metals sector |
| **OECD Due Diligence Guidance for Responsible Supply Chains (DDG)** | Annex II CAHRA documentation requirements |

---

## 2. Scope

### 2.1 Covered Activities

This policy applies to AI systems that contribute analytical output used in any of the following activities:

| Activity | Description |
|---|---|
| **Sanctions Screening** | Screening of subjects against UN Security Council Consolidated List, OFAC SDN/Consolidated Lists, EU Consolidated Financial Sanctions List, UK OFSI Consolidated List, UAE EOCN List, and UAE Local Terrorist List |
| **PEP Screening** | Identification of Politically Exposed Persons and Related and Close Associates (RCAs) using OpenSanctions and supplementary government-sourced datasets |
| **Adverse Media Screening** | Systematic media monitoring for negative news across 12+ categories including money laundering, terrorist financing, proliferation financing, corruption, organised crime, and legal/regulatory proceedings |
| **Customer Due Diligence (CDD) and Enhanced Due Diligence (EDD)** | AI-assisted risk-scoring, typology matching, and narrative generation supporting KYC/KYB decisions |
| **Transaction Monitoring** | Behavioural anomaly detection, structuring detection, and red-flag pattern recognition in transaction flows |
| **STR/SAR/FFR/PNMR Generation** | Automated drafting of regulatory reports for MLRO review prior to goAML submission |
| **MLRO Advisory and Reasoning** | Multi-modal reasoning support assisting the MLRO in evaluating complex or ambiguous cases |

### 2.2 Covered Systems

The following AI systems are registered under this policy. Full technical details are maintained in the AI Inventory (`docs/governance/AI_INVENTORY.md`):

| System ID | System Name | Version | Status |
|---|---|---|---|
| HS-001 | Screening Engine | 2.3.1 | Production |
| HS-002 | Reasoning Modes | 2.3.1 | Production |
| HS-003 | Adverse Media Analyser | 2.3.1 | Production |
| HS-004 | MLRO Auto-Dispositioner | 1.0.0 | Pilot |
| HS-005 | STR/SAR Generator | 1.2.1 | Production |

### 2.3 Out of Scope

This policy does not cover:

- Internal IT infrastructure and business productivity tools with no AML/CFT output
- Third-party vendor platforms not integrated into the Hawkeye Sterling pipeline
- Manual analytical work performed entirely by human officers without AI assistance

---

## 3. AI Risk Classification Framework

### 3.1 Classification Criteria

All AI systems and individual AI components are assigned a risk classification based on the following criteria:

- **Decision proximity**: How directly does the AI output influence a regulatory or compliance decision?
- **Error consequence**: What is the regulatory, legal, financial, and reputational consequence of an AI error?
- **Human override availability**: Is a human review step mandatory before the AI output takes effect?
- **Autonomy level**: Does the system act autonomously, or does it produce decision-support only?

### 3.2 Risk Tiers

#### CRITICAL

Systems or components that, if they malfunction or produce an incorrect output without detection, could directly cause:
- Unlawful failure to freeze a sanctioned party's funds
- Unlawful processing of a prohibited transaction
- Filing of a materially false regulatory report
- Criminal tipping-off of a subject under investigation

**Controls required:** Mandatory human MLRO review for every output before action; real-time monitoring; automated circuit-breakers; zero-tolerance drift threshold; dual approval for all dispositions; Board Risk Committee notification within 24 hours of any material failure.

**Systems assigned CRITICAL:** HS-001 (Sanctions Screening sub-component), HS-004 (Auto-Dispositioner — pilot phase), HS-005 (STR/SAR Generator — prior to human review gate).

#### HIGH

Systems or components whose errors can cause material harm to customers, third parties, or the firm's regulatory standing, but where a mandatory human review layer exists in the workflow.

**Controls required:** MLRO sign-off required for all outputs used in case decisions; weekly drift monitoring; per-mode Brier score tracking; escalation to MLRO if confidence below 65%; governance committee review of any performance degradation.

**Systems assigned HIGH:** HS-001 (full pipeline), HS-002 (Reasoning Modes), HS-003 (Adverse Media Analyser), HS-005 (STR/SAR Generator — post-human review).

#### MEDIUM

Supporting systems or analytical tools that inform, but do not directly determine, compliance decisions. Human judgment is always applied before any action is taken.

**Controls required:** Quarterly performance review; documented methodology; change management approval for updates.

#### LOW

Utility functions, logging, telemetry, and non-decision-facing infrastructure.

**Controls required:** Standard software development lifecycle controls; annual security review.

### 3.3 System Risk Classifications

| System ID | Risk Tier | Rationale |
|---|---|---|
| HS-001 Screening Engine | CRITICAL / HIGH | Directly flags sanctioned parties; incorrect NO MATCH can cause unlawful facilitation |
| HS-002 Reasoning Modes | HIGH | Influences MLRO advisory output; errors propagate into disposition recommendations |
| HS-003 Adverse Media | HIGH | False negatives on TF/sanctions-linked media can cause onboarding of high-risk parties |
| HS-004 Auto-Dispositioner | CRITICAL (pilot) | Proposes disposition codes; in pilot phase any auto-proposal carries elevated misuse risk |
| HS-005 STR/SAR Generator | CRITICAL (pre-review) / HIGH (post-review) | Tipping-off risk, false STR, and goAML submission failure all constitute regulatory breaches |

---

## 4. Risk Tolerance Matrix

### 4.1 Performance Thresholds

The firm declares the following quantitative risk tolerance thresholds for AI system performance. Breach of any threshold triggers the escalation actions defined below.

| Metric | Definition | Tolerance Threshold | Breach Action |
|---|---|---|---|
| **False Positive Rate (FPR)** | Proportion of negative cases incorrectly flagged as matches or suspicious | **< 5%** across all screening outputs | Escalate to MLRO; root-cause analysis within 5 business days; governance committee agenda item |
| **False Negative Rate (FNR)** | Proportion of true matches or genuine suspicious activity not detected | **< 1%** across validated cases | Immediate MLRO notification; system suspension assessment; Board Risk Committee notification if systemic |
| **Escalation Threshold** | Confidence score below which Auto-Dispositioner must escalate to human MLRO review rather than proposing a disposition | **< 65% confidence** always escalates | Hard-coded in HS-004; no override permitted |
| **Model Drift Score** | Normalised drift metric (0–1) measuring degradation of model accuracy relative to baseline | **≤ 0.15** | Board review; potential system suspension |
| **Screening Freshness** | Maximum permitted age of sanctions list data used in a screening decision | **≤ 1 day** | Escalate; block screening until list refreshed |
| **Data Quality Score** | Completeness and accuracy of customer master data used as screening inputs | **≥ 95%** | Escalate; enhanced data quality remediation programme |
| **STR Filing SLA Breach Rate** | Proportion of STRs filed outside the statutory deadline | **≤ 1%** | Board review; process redesign |
| **FFR Filing SLA Breach Rate** | Proportion of FFRs filed outside the 24-hour freeze / 5-business-day file window | **= 0%** | Board review; immediate remediation |
| **Adverse Media Unresolved Rate** | Open adverse-media findings unresolved beyond 5 business days | **≤ 5%** | Escalate to MLRO |
| **EDD Overdue Rate** | High-risk customer EDD reviews overdue beyond 30 days | **= 0%** | Board review |

### 4.2 Zero-Tolerance Dimensions

The following risk appetite dimensions carry zero-tolerance thresholds. Any breach is an automatic CRITICAL incident regardless of volume:

- Confirmed sanctioned counterparty in an active relationship (zero tolerance)
- CAHRA supply-chain inputs without OECD DDG Annex II documentation (zero tolerance)
- Direct mixer-sourced inbound transactions (zero tolerance)
- Four-eyes / Segregation of Duties violations (zero tolerance)
- FFR filing SLA breaches (zero tolerance)
- Anonymous transactions with no identifiable originator or beneficiary (zero tolerance)
- Unregulated VASP transactions (zero tolerance)

### 4.3 Escalation Decision Tree

```
AI System Output Generated
          │
          ▼
   Confidence ≥ 65%?
   ┌─ NO ──────────────────────► ESCALATE to MLRO (mandatory)
   │
   └─ YES
          │
          ▼
   Charter Validation Passed?
   ┌─ NO ──────────────────────► Return to pipeline; MLRO review required
   │
   └─ YES
          │
          ▼
   Tipping-off check passed?
   ┌─ NO ──────────────────────► Block output; MLRO notified immediately
   │
   └─ YES
          │
          ▼
   MLRO reviews proposal
          │
          ▼
   MLRO Disposes Case
   (AI proposal is decision support only — MLRO decision is final)
```

---

## 5. Change Management Procedures

### 5.1 Change Classification

All changes to AI systems covered by this policy are classified as follows:

| Change Type | Definition | Approval Required |
|---|---|---|
| **Major** | New model version; changes to scoring algorithms; new data sources; changes to confidence thresholds; changes to output taxonomy | MLRO + Data Science Lead + Engineering Lead + CEO sign-off; governance committee ratification |
| **Minor** | Bug fixes; keyword list updates; UI changes with no algorithmic impact; non-material performance improvements | MLRO + Engineering Lead approval |
| **Emergency** | Immediate changes required to prevent a regulatory breach or security incident | MLRO emergency approval (oral, confirmed in writing within 24 hours); CEO notification |
| **Maintenance** | Scheduled dependency updates; infrastructure patching; logging changes | Engineering Lead approval; MLRO notification |

### 5.2 Pre-Deployment Checklist

Before any Major or Minor change is deployed to production, the following gates must be passed:

- [ ] Regression test suite passes with FPR and FNR within tolerance thresholds
- [ ] Charter compliance validator (`src/brain/redlines.ts` checks) passes for all test cases
- [ ] Tipping-off guard validates clean for all test outputs
- [ ] Brier score benchmarked against prior version across held-out validation set
- [ ] Data lineage documentation updated (`docs/data-governance/DATA_LINEAGE.md`)
- [ ] AI Inventory updated (`docs/governance/AI_INVENTORY.md`) with new version number
- [ ] MLRO sign-off obtained and recorded
- [ ] Deployment log entry created with: change description, deployer, timestamp, version, approval reference

### 5.3 Rollback Protocol

If any of the following conditions are detected post-deployment, an immediate rollback to the prior version is initiated without further approval:

- FNR exceeds 1% within the first 48 hours post-deployment
- Any confirmed sanctioned party produces a NO MATCH output
- Charter violations detected in production outputs
- Tipping-off guard bypass detected
- Model drift score exceeds 0.20 within 7 days post-deployment

### 5.4 Third-Party and Vendor Changes

Changes to third-party data sources (e.g., sanctions list format changes, NewsAPI schema updates) that affect the AI pipeline are treated as Minor changes and require MLRO notification within 24 hours. Changes to underlying AI model providers (e.g., Claude model version updates) are treated as Major changes.

---

## 6. Stakeholder Engagement and Accountability

### 6.1 Roles and Responsibilities

| Stakeholder | Role | AI Governance Responsibilities |
|---|---|---|
| **MLRO** | Primary accountability owner for all AI outputs used in AML/CFT decisions | Approve all AI system changes; review and sign off on all dispositions; chair governance committee; receive all incident reports; sign annual certification |
| **Compliance Officer** | Day-to-day oversight of compliance programme | Monitor AI performance metrics; review governance committee outputs; coordinate regulatory correspondence |
| **Data Science Lead** | Technical ownership of AI model performance | Maintain Brier score ledgers; conduct drift analysis; design and run validation studies; produce model cards |
| **Engineering Lead** | Technical ownership of AI infrastructure | Manage deployments; maintain audit logs; operate circuit-breakers; conduct pre-deployment checks |
| **CEO** | Ultimate accountability for regulatory standing | Approve Major changes; receive Board Risk Committee escalations; sign annual governance certification alongside MLRO |
| **Legal Counsel** | Legal risk advisory | Review tipping-off risks; advise on STR deferral decisions (D23); oversee litigation holds; PDPL compliance |
| **Board Risk Committee** | Organisational risk oversight | Receive quarterly AI performance reports; approve risk appetite changes; receive CRITICAL incident notifications |
| **External Auditors / Regulators** | Independent assurance | Access to AI Inventory, model cards, audit logs, and governance committee minutes upon request |

### 6.2 Accountability Escalation Matrix

| Issue | First Escalation | Second Escalation | Final Authority |
|---|---|---|---|
| AI performance below threshold | Data Science Lead | MLRO | Board Risk Committee |
| Model drift warning | Engineering Lead + Data Science Lead | MLRO | CEO + Board |
| CRITICAL incident | MLRO (1 hour) | CEO (same day) | Board Risk Committee (24 hours) |
| Regulatory inquiry involving AI | MLRO + Legal | CEO | Board Risk Committee |
| Whistleblower report involving AI | MLRO + Legal (ring-fenced) | CEO (if not implicated) | Board (audit committee) |

### 6.3 Conflict of Interest Controls

No individual who is under assessment, named in an adverse-media finding, or personally involved in a transaction under investigation may access or influence the AI pipeline outputs for that case. Segregation of Duties (SoD) controls enforced by RBAC (`src/enterprise/rbac.ts`) implement this requirement technically. Any SoD violation is a zero-tolerance incident under the risk appetite framework.

---

## 7. Incident Response Procedures

Full incident response procedures, severity definitions, and response timelines are maintained in the Incident Response Playbook (`docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`).

### 7.1 Summary of Severity Levels

| Severity | Response Time | Examples |
|---|---|---|
| CRITICAL | 1 hour | Confirmed false negative on sanctioned party; tipping-off breach; goAML system failure during live STR |
| HIGH | 4 hours | Adverse-media data source failure; model drift exceeds threshold; screening freshness breach |
| MEDIUM | 24 hours | Elevated FPR; minor data quality degradation; single STR filing delay |
| LOW | 5 business days | UI anomalies; minor API latency; documentation gaps |

### 7.2 AI-Specific Incident Categories

Six incident categories are specifically defined for AI system failures. See the Playbook for full response procedures per category:

1. Model Drift
2. Data Source Failure
3. Sanctions List Corruption
4. GoAML Submission Failure
5. Security Breach (AI system)
6. Regulatory Inquiry (AI-related)

### 7.3 Regulatory Notification Obligations

Incidents that may constitute a reportable event under FDL 10/2025 or Cabinet Decision 74/2020 must be notified to the MLRO within 1 hour of detection. The MLRO will determine whether self-disclosure to the UAE FIU or relevant supervisor is required. Self-disclosure (disposition D15) is treated as a Major change requiring MLRO and CEO sign-off.

---

## 8. Annual Certification Requirements

### 8.1 Scope of Annual Certification

Each calendar year, no later than 31 January covering the prior year, the following certification activities must be completed:

| Activity | Owner | Evidence Required |
|---|---|---|
| AI Inventory review and attestation | Data Science Lead | Updated `docs/governance/AI_INVENTORY.md` signed by Data Science Lead |
| Model performance review | Data Science Lead | Annual Brier score report; FPR/FNR summary for all production systems |
| Data lineage review | Engineering Lead | Updated `docs/data-governance/DATA_LINEAGE.md`; data quality gate audit results |
| Governance committee minutes review | MLRO | Full-year minutes archive; outstanding action items closed or escalated |
| Risk appetite review | MLRO + Compliance Officer | Documented review of all tolerance thresholds; board approval of any changes |
| Incident log review | MLRO | All incidents closed or formally carried forward with documented rationale |
| Training records review | Compliance Officer | Evidence of AI governance training for all staff with pipeline access |
| Charter compliance audit | MLRO + Legal | Sample of 50 AI-generated outputs reviewed for charter compliance |
| PDPL compliance review | Legal + Engineering Lead | Data subject rights log; retention policy compliance; cross-border transfer register |

### 8.2 Certification Statement

Upon completion, the following certification is signed by the MLRO and CEO:

> *"We certify that we have reviewed the AI governance framework, AI Inventory, incident log, model performance data, data lineage documentation, and governance committee records for the period [YEAR]. To the best of our knowledge, the AI systems operated by Hawkeye Sterling during this period were managed in accordance with this AI Governance Policy, UAE FDL 10/2025, FATF Recommendations, and applicable regulatory obligations. All material exceptions have been disclosed in this certification or in the annexed incident log."*

The signed certification is retained for 10 years per FDL 10/2025 Art. 24 and the internal retention policy (`src/brain/retention-policy.ts`, record class `audit_report`).

### 8.3 Regulatory Submission

Where required by applicable supervisory guidance, a summary of the annual certification is submitted to the relevant supervisor (Ministry of Economy for DNFBP, or equivalent) within 30 days of signature.

---

## 9. Governance Committee

### 9.1 Constitution

The AI Governance Committee meets every Friday (see `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` for agenda template and minutes). Standing members:

- MLRO (Chair)
- Compliance Officer
- Data Science Lead
- Engineering Lead

Ad-hoc attendees (by invitation as required):
- CEO
- Legal Counsel
- External Auditors

### 9.2 Standing Agenda Items

1. Drift alerts from `GET /api/mlro/drift-alerts`
2. Incident log review
3. Mode performance leaderboard from `GET /api/mlro/mode-performance`
4. MLRO flags and edge cases
5. Upcoming changes requiring governance approval

### 9.3 Quorum and Decision-Making

A quorum requires MLRO + at least one of (Compliance Officer, Data Science Lead, Engineering Lead). Decisions are made by consensus; where consensus cannot be reached, the MLRO has casting authority. All decisions are minuted and action-owner allocated.

---

## 10. Prohibited Uses

The following uses of Hawkeye Sterling AI systems are absolutely prohibited. These prohibitions are implemented as hard constraints in the system charter (`src/policy/systemPrompt.ts`, prohibitions P1–P10) and cannot be overridden by user instruction, role-play framing, urgency claims, or any other mechanism:

| Code | Prohibition |
|---|---|
| P1 | Assert sanctions status without an authoritative list supplied in the current input |
| P2 | Fabricate adverse media, citations, URLs, case numbers, or press releases |
| P3 | Generate legal conclusions — legal characterisation is reserved to the MLRO and competent authorities |
| P4 | Produce any output that could constitute tipping-off of a subject under investigation or suspicion |
| P5 | Upgrade allegations to findings — evidential standards must be maintained precisely |
| P6 | Merge distinct individuals or entities on the basis of shared or similar names alone |
| P7 | Issue a "clean" or "no hit" result without a full scope declaration |
| P8 | Use training-data knowledge as a current source for sanctions status, PEP status, or enforcement actions |
| P9 | Assign a risk score without stating methodology, inputs, weightings, and gaps |
| P10 | Proceed when information is insufficient — the system must halt and return a structured gap list |

---

## 11. Document Control

| Field | Value |
|---|---|
| Document ID | HS-GOV-001 |
| Version | 1.0.0 |
| Created | 2026-05-06 |
| Next mandatory review | 2027-05-06 |
| Approver (MLRO) | [Signature required] |
| Approver (CEO) | [Signature required] |
| Related documents | `docs/governance/AI_INVENTORY.md`, `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`, `docs/data-governance/DATA_LINEAGE.md`, `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md` |
| Regulatory references | UAE FDL 10/2025; FDL 20/2018 as amended; Cabinet Decision 74/2020; Cabinet Resolution 16/2021; FATF Recommendations |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
