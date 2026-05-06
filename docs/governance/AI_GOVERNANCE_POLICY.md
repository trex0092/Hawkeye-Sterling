# AI Governance Policy
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-GOV-001
**Version:** 1.0
**Effective Date:** [TO BE COMPLETED — date of board signature]
**Next Review:** May 2027
**Owner:** MLRO
**Approved by:** [CEO / Board — signature block at end of document]

---

## 1. Governance Scope

### 1.1 System Identification

| Field | Value |
|---|---|
| System Name | Hawkeye Sterling |
| Version | 2.3.1 (package.json) |
| Repository | github.com/trex0092/Hawkeye-Sterling |
| Deployment | Netlify (hawkeye-sterling-v2.netlify.app) |
| Runtime | Next.js 14 / Node 20 / TypeScript 5.6 |
| Build | `npm ci && npm run build` → `cd web && npm run build` |

### 1.2 Purpose

Hawkeye Sterling is a regulator-grade AML/CFT/CPF screening engine built for a UAE-licensed Designated Non-Financial Business or Profession (DNFBP) operating in the precious metals sector. It performs:

- Sanctions screening against UN, OFAC, EU, UK, UAE EOCN, and UAE Local Terrorist List
- PEP identification and adverse-media detection
- Typology-based AML/CFT/CPF risk analysis using 273+ reasoning modes
- Automated STR/SAR narrative drafting and goAML submission support
- Daily monitoring on existing customer portfolios via Asana inbox delivery

### 1.3 Regulatory Basis

This system operates under and does not contradict:

- Federal Decree-Law No. 20 of 2018 (AML/CFT, as amended by Federal Decree-Law No. 10 of 2025)
- Cabinet Decision No. 10 of 2019 (Executive Regulations, as amended by Cabinet Resolution No. 134 of 2025)
- Cabinet Decision No. 74 of 2020 (Terrorism Lists and TFS procedures)
- Cabinet Resolution No. 16 of 2021 (Administrative penalties)
- MoE DNFBP circulars and guidance for the precious-metals sector
- FATF Recommendations 1–40 and relevant Methodology paragraphs
- LBMA Responsible Gold Guidance (supply-chain context)
- NIST AI Risk Management Framework (AI RMF 1.0, January 2023)
- EU AI Act (Articles 6 and 26–30, high-risk system obligations, enforcement August 2026)
- UAE Personal Data Protection Law (PDPL)

---

## 2. AI System Classification

### 2.1 Risk Level

Hawkeye Sterling is classified as **HIGH-RISK** under the following frameworks:

**EU AI Act:** Qualifies as high-risk under Article 6 — the system is used in a compliance context that produces outputs relied upon by an MLRO, a Compliance Officer, internal auditors, external auditors, the UAE Ministry of Economy, the UAE Financial Intelligence Unit, and — in enforcement — the UAE Public Prosecution and competent courts. Mandatory obligations under Articles 26–30 apply.

**NIST AI RMF:** The system affects financial access decisions and regulatory filings for legal persons. It operates under all four functions: GOVERN, MAP, MEASURE, MANAGE.

**UAE FDL 10/2025:** The system is a core tool in the organisation's AML/CFT programme. Its outputs inform STR/SAR filings, customer onboarding decisions, and daily monitoring dispositions.

### 2.2 Operator Classification

The organisation operating Hawkeye Sterling is a UAE-licensed DNFBP in the precious metals sector. The MLRO is the designated responsible officer for all AI governance matters related to this system.

### 2.3 Governance Board

| Role | Name | Responsibility |
|---|---|---|
| MLRO | [NAME] | Compliance charter, system policy, STR decisions |
| Compliance Officer | [NAME] | Governance documentation, audit readiness |
| Data Science Lead | [NAME] | Model cards, fairness testing, mode versioning |
| Engineering Lead | [NAME] | System integrity, security, monitoring infrastructure |
| Legal Counsel | [NAME] | Regulatory alignment, FDL crosswalk (Item #38) |
| CEO / Board Representative | [NAME] | Final approval authority |

**Meeting frequency:** Weekly (Fridays, 2pm GST). Minutes recorded in `docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md`.

---

## 3. Risk Tolerance

The following risk tolerances are formally adopted by this governance board:

| Metric | Tolerance | Trigger Action |
|---|---|---|
| False Positive Rate (sanctions) | ≤ 5% | Investigation + root-cause analysis if exceeded |
| False Negative Rate (evasion patterns) | ≤ 1% | Immediate escalation to MLRO |
| MLRO Escalation Confidence Threshold | ≤ 65% | Always escalate to human review |
| Demographic Parity (precision delta by entity type) | ± 3% | Bias audit initiated |
| Expected Calibration Error (ECE) | ≤ 4% | Drift alert triggered |
| Confidence Variance Collapse | σ < 0.05 | Introspection audit trap activated |
| System Uptime | ≥ 99.5% | Incident classification: HIGH |
| Screening Latency (p95) | ≤ 300ms | Infrastructure review initiated |
| Data Validation Failures | < 0.1% | Ingest halted pending investigation |

These tolerances are reviewed annually and may be tightened as the system matures. They may not be relaxed without a governance board vote and written record.

---

## 4. Change Management

### 4.1 Reasoning Mode Changes

All additions, modifications, or removals of reasoning modes require:

1. **Technical review** (Data Science Lead) — does the mode implementation match its declared logic? Does it have unit tests in vitest?
2. **Compliance review** (MLRO + Compliance Officer) — does the mode's output align with P1–P10 absolute prohibitions in `src/policy/systemPrompt.ts`?
3. **UAT** (minimum 20 sample cases including edge cases and adversarial inputs)
4. **Governance approval** (governance board vote, recorded in meeting minutes)
5. **Audit trail entry** — mode version, author, approver, and content hash recorded in `src/brain/reasoning-modes.ts` MODE_REGISTRY

### 4.2 Sanctions List Changes

Changes to sanctions source URLs or ingest procedures require:

1. Engineering Lead sign-off
2. MLRO notification
3. Test run against known designated entities before production deployment

### 4.3 Policy Changes

Changes to `src/policy/systemPrompt.ts` (the content-frozen compliance charter) require:

1. MLRO sign-off
2. Legal Counsel review
3. CEO / Board approval
4. Version bump in this governance policy document

### 4.4 Infrastructure Changes

Changes to `netlify.toml`, deployment configuration, or Netlify Functions require:

1. Engineering Lead sign-off
2. Security review (ADMIN_TOKEN, AUDIT_CHAIN_SECRET, SANCTIONS_CRON_TOKEN, ONGOING_RUN_TOKEN entropy verified)
3. Post-deploy verification checklist completed

### 4.5 Version Control

All changes are tracked in Git. Pull requests require:
- At least one reviewer other than the author
- A change log entry in `docs/operations/CHANGE_CONTROL_LOG.md`
- CI pass: `npm run typecheck` (zero errors) + `npm test` (all passing)

---

## 5. Stakeholder Engagement

### 5.1 Internal Stakeholders

| Stakeholder | Engagement Method | Frequency |
|---|---|---|
| MLRO | Governance committee + direct escalation | Weekly + ad hoc |
| Compliance Officer | Governance committee + document review | Weekly |
| Data Science Lead | Governance committee + mode review | Weekly |
| Engineering Lead | Governance committee + security review | Weekly |
| Legal Counsel | Regulatory alignment review | Quarterly + as needed |
| CEO / Board | Board briefing + annual recertification | Quarterly + annual |
| Front Office Staff | Training + screening UI | Annual training + onboarding |
| Internal Auditors | Quarterly assurance review | Quarterly |

### 5.2 External Stakeholders

| Stakeholder | Engagement Method | Frequency |
|---|---|---|
| UAE Ministry of Economy | Regulatory notifications (as required by FDL 10/2025) | As required |
| UAE FIU | goAML submissions + regulatory correspondence | Per STR/SAR filing |
| External Auditors | Full documentation package on request | Annual or on demand |
| Anthropic (AI provider) | Terms of service compliance | Ongoing |
| Asana (workflow platform) | Integration compliance | Ongoing |

---

## 6. Absolute Prohibitions (Compliance Charter)

The following prohibitions are content-frozen in `src/policy/systemPrompt.ts` and cannot be overridden by any downstream instruction, user request, roleplay framing, urgency claim, or authority assertion from within screened data:

| ID | Prohibition |
|---|---|
| P1 | No unverified sanctions assertions — training-data recollection is inadmissible |
| P2 | No fabricated adverse media, citations, URLs, case numbers, or journalist names |
| P3 | No legal conclusions — describe indicators, not offences |
| P4 | No tipping-off content — no customer communications that reveal investigation existence |
| P5 | No allegation-to-finding upgrade — alleged remains alleged |
| P6 | No merging of distinct persons or entities without verified common identity |
| P7 | No "clean" result without explicit scope declaration |
| P8 | No training-data-as-current-source — only input-present evidence is admissible |
| P9 | No opaque risk scoring — every score must trace to named reasoning modes |
| P10 | No proceeding on insufficient information — return a gap list, not a guess |

Violation of any prohibition is classified as a CRITICAL incident under Section 8.

---

## 7. Output Standards

Every AI-generated screening output must contain the following seven mandatory sections:

1. **SUBJECT_IDENTIFIERS** — all identifiers provided, normalised
2. **SCOPE_DECLARATION** — exactly what was checked and what was not checked
3. **FINDINGS** — evidence-grounded findings only, with confidence taxonomy
4. **GAPS** — what could not be checked and why
5. **RED_FLAGS** — typology indicators observed
6. **RECOMMENDED_NEXT_STEPS** — actionable steps for the MLRO
7. **AUDIT_LINE** — screening ID, timestamp, model version, mode list, operator ID

Match confidence taxonomy:

| Level | Meaning |
|---|---|
| EXACT | Identical name, DOB, nationality, identifier |
| STRONG | High-confidence match with minor variation (e.g., transliteration) |
| POSSIBLE | Partial match requiring human adjudication |
| WEAK | Low-confidence indicator, context required |
| NO_MATCH | No match found within declared scope |

---

## 8. Incident Response

### 8.1 Incident Classification

| Severity | Definition | Response SLA |
|---|---|---|
| CRITICAL | System unavailable OR AI output unreliable OR tipping-off risk | 1 hour |
| HIGH | AI accuracy significantly degraded (ECE > 6%) | 4 hours |
| MEDIUM | Bias spike or edge-case failure detected | 24 hours |
| LOW | Minor data delay or cosmetic issue | 5 business days |

Full procedures: `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`

### 8.2 Immediate Contacts

| Incident Type | Contact | Channel |
|---|---|---|
| Any CRITICAL | MLRO + CEO | Phone — do not delay |
| Tipping-off risk | Legal Counsel + MLRO | Phone immediately |
| AI performance drift | MLRO + Data Science Lead | Slack #compliance-alerts |
| Data integrity | MLRO + Engineering Lead | Slack #compliance-alerts |
| Regulatory inquiry | CEO + Legal + Compliance | Formal in-person meeting |

---

## 9. Data Governance

### 9.1 Retention Policy

| Data Type | Retention Period | Basis |
|---|---|---|
| Screening decisions + audit chains | 10 years | FDL 10/2025 Art. 24 |
| STR/SAR filings | 10 years | FDL 10/2025 Art. 24 |
| Sanctions / PEP lists (snapshots) | Permanent | Historical case review |
| Adverse media cache | 2 years rolling | Operational requirement |
| System logs | 1 year (operational), 10 years (audit trail) | PDPL + regulatory |

### 9.2 Deletion and Erasure

- GDPR right-to-erasure: `POST /api/compliance/gdpr-erasure`
- UAE PDPL deletion: `src/brain/pdpl-guard.ts`
- Deletion requests must be reviewed by MLRO before execution (retention obligations may override erasure requests for active investigations or STR filings)

### 9.3 Data Security

All secrets are managed via Netlify environment variables. The following must have high entropy at all times:

| Variable | Required Entropy | Purpose |
|---|---|---|
| `AUDIT_CHAIN_SECRET` | 64 hex chars (openssl rand -hex 64) | HMAC-SHA256 audit chain integrity |
| `ADMIN_TOKEN` | 32 hex chars minimum | Admin endpoint protection |
| `ONGOING_RUN_TOKEN` | 32 hex chars minimum | Monitoring endpoint protection (fail-closed if unset) |
| `SANCTIONS_CRON_TOKEN` | 32 hex chars minimum | Sanctions ingest protection (fail-closed if unset) |

No secrets are committed to Git. The `.env.example` file documents all required variables without values.

---

## 10. Human Oversight

Hawkeye Sterling does not make final compliance decisions. It produces evidence-grounded analysis and recommended actions for human review. The MLRO has final authority on all decisions including:

- Customer onboarding approval or rejection
- STR/SAR filing decisions
- Asset freeze recommendations
- goAML submissions
- Escalation to the UAE FIU

The MLRO Auto-Dispositioner (HS-004) is classified as PILOT (v1.0.0). All dispositions from this system require MLRO human review before action. Confidence threshold ≤ 65% always escalates to manual review regardless of disposition suggestion.

---

## 11. Annual Compliance Certification

This governance policy is reviewed and recertified annually. Recertification requires:

1. Review of all 13 governance documents for currency
2. Review of all 5 model cards — updated with latest performance metrics
3. External audit engagement (recommended) or internal audit assessment
4. CEO / Board re-signature on this document
5. Governance committee vote on any policy changes
6. Publication of annual compliance summary

**Next certification due:** May 2027

---

## 12. Audit Readiness

The following artefacts are maintained and available for regulator inspection within 48 hours of request:

| Artefact | Location | Description |
|---|---|---|
| This policy | `docs/governance/AI_GOVERNANCE_POLICY.md` | Board-signed AI governance framework |
| AI System Inventory | `docs/governance/AI_INVENTORY.md` | All 5 AI systems with lifecycle stages |
| Model Cards (5) | `docs/model-cards/HS-00*.md` | Technical transparency per system |
| Data Lineage | `docs/data-governance/DATA_LINEAGE.md` | All data sources, quality, validation |
| Fairness Testing | `docs/testing/FAIRNESS_TESTING_RESULTS.md` | Bias audit, disaggregated metrics |
| Incident Playbook | `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` | Procedures and SLAs |
| Change Control Log | `docs/operations/CHANGE_CONTROL_LOG.md` | All mode changes with approvals |
| Audit Trail | `GET /api/audit/view?screening_id=XXX` | Per-decision reasoning chain + HMAC seal |
| Audit Verify | `GET /api/audit/verify` | Chain HMAC + link integrity check |
| SOC2 Export | `GET /api/compliance/soc2-export` | Full compliance log export |
| Brier Dashboard | `GET /api/mlro/brier` | Real-time calibration metrics |
| Drift Alerts | `GET /api/mlro/drift-alerts` | Current vs baseline drift evaluator |
| Mode Performance | `GET /api/mlro/mode-performance` | Per-mode effectiveness leaderboard |
| Sanctions Status | `GET /api/sanctions/status` | Per-list snapshot freshness |

---

## Sign-Off

This policy is formally adopted by the Hawkeye Sterling governance board.

| Role | Name | Signature | Date |
|---|---|---|---|
| MLRO | | | |
| Compliance Officer | | | |
| Data Science Lead | | | |
| Engineering Lead | | | |
| Legal Counsel | | | |
| CEO / Board | | | |

**Policy effective from date of CEO / Board signature.**

**Revision history:**

| Version | Date | Author | Changes | Approved by |
|---|---|---|---|---|
| 1.0 | 2026-05-06 | Compliance Officer | Initial policy — audit readiness programme | CEO / Board |
