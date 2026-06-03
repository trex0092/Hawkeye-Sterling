# Hawkeye Sterling — Module Compliance Register (MoE-aligned, audit-ready)

**Status:** Compliance-reviewed · audit-ready · change-controlled
**Supervisor:** UAE Ministry of Economy (MoE) — DNFBP / DPMS sector, via the National Anti-Money Laundering and Combating Financing of Terrorism Committee (NAMLCFTC) and the UAE FIU (goAML).
**Regulatory frame:** Federal Decree-Law No.20/2018 & its Executive Regulation (Cabinet Decision No.10/2019); Federal Decree-Law No.10/2025 (AI governance); Cabinet Decision No.58/2020 (UBO); Cabinet Decision No.74/2020 (TFS); CR 134/2025; MoE Circular No.08/AML/2021 (DPMS cash-threshold reporting); MoE AML/CFT Guidance for DNFBPs; MoE AML/CFT Supervisory Survey (MOEC/AML/001/2026); FATF Recommendations & Methodology; OECD Due Diligence Guidance; LBMA Responsible Gold Guidance v9; ISO/IEC 42001; EU AI Act; UAE PDPL; SOC 2.
**Record-keeping baseline:** 5 years minimum from end of relationship/transaction (FDL 20/2018 Art.16; Cabinet 10/2019); AI decisions & audit chain retained 10 years (FDL 10/2025 Art.24).

> Each entry: **Purpose · MoE / UAE obligation · Control & enforcement · Frequency / SLA · Responsible role · Evidence & retention.**

---

## 1. Onboarding & Customer Due Diligence

### Client Portal
- **Purpose:** Self-service onboarding capturing legal identity, UBOs and directors, auto-screened against sanctions/PEP/adverse-media/jurisdiction data before MLRO decision.
- **MoE / UAE obligation:** Risk-based CDD before establishing a business relationship — FDL 20/2018 Art.16; Cabinet 10/2019 Art.4–8; MoE AML/CFT Guidance for DNFBPs (CDD chapter); FATF R.10.
- **Control & enforcement:** Identification + verification + screening enforced as a hard gate; relationship cannot activate without a recorded MLRO disposition (`enforce` fail-closed).
- **Frequency / SLA:** Every new customer, at onboarding, before activation.
- **Responsible:** Compliance Officer (intake) → MLRO (disposition).
- **Evidence & retention:** Onboarding record + screening result + disposition in the immutable audit chain; **5 yrs** (CDD), decision log **10 yrs**.

### UBO Declaration
- **Purpose:** Capture and risk-rate every natural-person beneficial owner ≥25% ownership/control/voting, including layered/nominee structures.
- **MoE / UAE obligation:** Beneficial-ownership identification & maintenance — Cabinet Decision 58/2020; FDL 10/2025 Art.19; MoE UBO filing requirements for DNFBPs.
- **Control & enforcement:** Activation blocked where the true beneficial owner cannot be established; bearer-share/nominee triggers EDD.
- **Frequency / SLA:** At onboarding and on any ownership change.
- **Responsible:** Compliance Officer; MLRO sign-off on EDD cases.
- **Evidence & retention:** UBO register with percentages + verification status; **5 yrs**.

### PEP Profiles
- **Purpose:** Establish PEP tier, source of wealth/funds, relationship network and EDD measures.
- **MoE / UAE obligation:** PEP identification + senior-management approval + enhanced ongoing monitoring — Cabinet 10/2019 Art.15; FATF R.12; MoE DNFBP guidance (PEPs).
- **Control & enforcement:** Senior-management approval required before onboarding/continuing a PEP; EDD measures mandatory.
- **Frequency / SLA:** At onboarding; re-assessed at each periodic review.
- **Responsible:** MLRO + senior management.
- **Evidence & retention:** PEP determination, SoW narrative, EDD checklist, approval; **5 yrs**.

### CDD Review
- **Purpose:** Risk-tiered periodic re-KYC with AI adequacy checking of file completeness.
- **MoE / UAE obligation:** Ongoing CDD and keeping records current — Cabinet 10/2019 Art.7; FATF R.10; MoE DNFBP guidance (ongoing monitoring).
- **Control & enforcement:** Cadence enforced — high-risk 3-monthly, medium 6-monthly, low annually; overdue files flagged.
- **Frequency / SLA:** Per risk tier (3 / 6 / 12 months).
- **Responsible:** Compliance Officer; MLRO escalation.
- **Evidence & retention:** Review register with last/next-due dates; **5 yrs**.

### Data Quality
- **Purpose:** Monitor CDD completeness portfolio-wide with AI remediation planning.
- **MoE / UAE obligation:** Adequate, accurate, up-to-date records — Cabinet 10/2019; FDL 20/2018 Art.16; FATF R.10.
- **Control & enforcement:** Deficient files flagged and routed to remediation before reliance for screening/reporting.
- **Frequency / SLA:** Continuous; remediation per SLA.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Completeness scorecard + remediation log; **5 yrs**.

### Ownership Explorer
- **Purpose:** Map UBO/ownership chains, detect shell-company and jurisdiction-layering risk.
- **MoE / UAE obligation:** Understanding ownership & control structure — Cabinet 58/2020; FATF R.24/25.
- **Control & enforcement:** Look-through to ultimate control; chains >4 layers / circular structures trigger EDD/legal review.
- **Frequency / SLA:** At onboarding and on structure change.
- **Responsible:** Compliance Officer; MLRO on complex structures.
- **Evidence & retention:** Ownership graph + shell-risk assessment; **5 yrs**.

### Employees
- **Purpose:** Staff register with Emirates ID/passport expiry and AML/CFT training currency.
- **MoE / UAE obligation:** Fit-and-proper staffing & screening of employees — Cabinet 10/2019 Art.21; FDL 10/2025 Art.16; MoE DNFBP guidance (internal controls).
- **Control & enforcement:** Expiring/lapsed documents and overdue training auto-flagged.
- **Frequency / SLA:** Continuous; documents flagged 30 days pre-expiry.
- **Responsible:** Compliance Officer / HR.
- **Evidence & retention:** Staff record with expiry/training status; **5 yrs**.

### Approvals
- **Purpose:** Onboarding approval tracker — status, risk score, approved country destinations — under four-eyes.
- **MoE / UAE obligation:** Internal controls & segregation of duties — FDL 10/2025 Art.20; Cabinet 10/2019 Art.21; CBUAE AML Standards §6.
- **Control & enforcement:** Dual authorisation required; both signatories recorded.
- **Frequency / SLA:** Per onboarding decision.
- **Responsible:** Compliance Officer (maker) + MLRO/senior (checker).
- **Evidence & retention:** Approval record with both signatories in audit chain; **5 yrs**.

### Supplier / Vendor Due Diligence
- **Purpose:** Third-party/supplier DD with AI risk and tiered re-assessment.
- **MoE / UAE obligation:** Counterparty/third-party risk management — FATF R.10; OECD DDG; MoE DPMS supply-chain expectations.
- **Control & enforcement:** Risk-tiered cadence (critical annual, significant 18-month, standard 24-month).
- **Frequency / SLA:** Per tier.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Vendor assessment + next-review date; **5 yrs**.

### Onboarding Wizard
- **Purpose:** Guided new-customer intake routing to CDD/screening/MLRO.
- **MoE / UAE obligation:** Controlled CDD intake — Cabinet 10/2019 Art.4; FDL 10/2025 Art.10.
- **Control & enforcement:** No-gaps path; cannot complete without required CDD fields.
- **Frequency / SLA:** Per new customer.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Intake completion trail; **5 yrs**.

## 2. Risk & AML Operations

### EWRA / BWRA
- **Purpose:** Enterprise/business-wide ML/TF risk assessment with AI board report.
- **MoE / UAE obligation:** Documented business risk assessment — Cabinet 10/2019 Art.2–3; FATF R.1; MoE DNFBP guidance (risk assessment).
- **Control & enforcement:** Risk-based approach derived from the EWRA; Board approval required.
- **Frequency / SLA:** At least annually and on material change.
- **Responsible:** MLRO → Board approval.
- **Evidence & retention:** Dated Board-approved EWRA; **5 yrs**.

### STR/SAR QA
- **Purpose:** Four-eyes quality review of STRs before filing + goAML XML export.
- **MoE / UAE obligation:** Suspicious-transaction reporting to the FIU — Cabinet 10/2019 Art.17–18; FDL 20/2018 Art.15; FATF R.20.
- **Control & enforcement:** Dual-control gate before submission; report accuracy verified.
- **Frequency / SLA:** Per report; file without delay on suspicion.
- **Responsible:** MLRO (sole filing authority).
- **Evidence & retention:** QA sign-off + exported filing; **5 yrs**.

### SAR Narrative
- **Purpose:** Generate STR/SAR narratives under a tipping-off egress gate.
- **MoE / UAE obligation:** Prohibition on tipping off — FDL 20/2018 Art.25; Cabinet 10/2019; FDL 10/2025 Art.17.
- **Control & enforcement:** Egress gate fail-closed — output withheld (`held_review`) if disclosure risk detected.
- **Frequency / SLA:** Per report.
- **Responsible:** MLRO.
- **Evidence & retention:** Egress-check result attached; **5 yrs**.

### Supply Chain / Responsible Sourcing
- **Purpose:** Geographic + human-rights (CSDDD/UFLPA) supply-chain risk via OECD 5-step DD.
- **MoE / UAE obligation:** Responsible sourcing for DPMS — MoE/OECD DDG alignment; LBMA RGG v9; MD 68/2024.
- **Control & enforcement:** Five-step DD with CAHRA exposure assessment.
- **Frequency / SLA:** Per supplier; annual review.
- **Responsible:** Compliance Officer / DPMS compliance.
- **Evidence & retention:** Five-step record + CAHRA assessment; **5 yrs**.

### RMI / RMAP
- **Purpose:** Responsible-minerals assurance + Step-4 audit history.
- **MoE / UAE obligation:** Upstream/downstream assurance — OECD DDG Annex II; LBMA RGG v9.
- **Control & enforcement:** RMAP audit status tracked per smelter/refiner.
- **Frequency / SLA:** Per supplier; annual.
- **Responsible:** DPMS compliance.
- **Evidence & retention:** RMAP status records; **5 yrs**.

### OECD DDG
- **Purpose:** Conformance tracking to OECD Due Diligence Guidance for minerals.
- **MoE / UAE obligation:** Recognised 5-step standard for DPMS supply chains.
- **Control & enforcement:** Conformance checklist maintained.
- **Frequency / SLA:** Annual.
- **Responsible:** DPMS compliance.
- **Evidence & retention:** Conformance checklist; **5 yrs**.

### Reg Changes
- **Purpose:** Regulatory-change roadmap + AI implementation calendar.
- **MoE / UAE obligation:** Keeping the programme current with MoE/FATF changes — FDL 10/2025; FATF Methodology.
- **Control & enforcement:** Each change has an owner and implementation deadline.
- **Frequency / SLA:** Continuous horizon-scan.
- **Responsible:** MLRO / Compliance Officer.
- **Evidence & retention:** Change log with deadlines/owners; **5 yrs**.

### Shipments
- **Purpose:** Bullion chain-of-custody origin→vault with AI TBML scan; held shipments trigger MLRO review.
- **MoE / UAE obligation:** DPMS supply-chain integrity & TBML controls — MoE DPMS guidance; LBMA RGG v9; OECD 5-step DD.
- **Control & enforcement:** WORM-logged custody transfers; held status pauses settlement pending MLRO.
- **Frequency / SLA:** Per consignment / custody transfer.
- **Responsible:** DPMS compliance; MLRO on holds.
- **Evidence & retention:** WORM custody log; **5 yrs**.

### EOCN
- **Purpose:** UAE targeted financial sanctions registration, NAS/ARS, local control-list screening.
- **MoE / UAE obligation:** Mandatory TFS screening & freezing — Cabinet 74/2020; UNSC Consolidated List; EOCN executive office guidance.
- **Control & enforcement:** Freeze without delay on confirmed match; 24-hour SLA.
- **Frequency / SLA:** On every customer/transaction and on list updates; freeze **≤24h**.
- **Responsible:** MLRO.
- **Evidence & retention:** Screening result + freeze/no-match decision; **5 yrs**.

### TFS Alerts
- **Purpose:** Monitor EOCN alert emails; auto-create Asana compliance tasks on new designations.
- **MoE / UAE obligation:** Continuous monitoring of local terrorist & UN lists — Cabinet 74/2020; TFS mandatory screening.
- **Control & enforcement:** New designations generate a tracked task and re-screen trigger.
- **Frequency / SLA:** Continuous; act on designation **≤24h**.
- **Responsible:** MLRO / Compliance Officer.
- **Evidence & retention:** Alert log + disposition; **5 yrs**.

### CNMR / PNMR
- **Purpose:** Confirmed/potential name-match queue + FIU notification.
- **MoE / UAE obligation:** Adjudicate matches & notify — Cabinet 74/2020; Cabinet 10/2019.
- **Control & enforcement:** Every potential match adjudicated; confirmed matches notified.
- **Frequency / SLA:** On each alert; without delay.
- **Responsible:** MLRO.
- **Evidence & retention:** Match adjudication record; **5 yrs**.

### DPMSR
- **Purpose:** DPMS cash-transaction reporting at/above AED 55,000 via goAML.
- **MoE / UAE obligation:** **MoE Circular No.08/AML/2021** & CR 134/2025 Art.3 — DPMS report for any single or linked cash transaction ≥ AED 55,000, regardless of suspicion; fine for non-filing up to AED 200,000 (CR 71/2024).
- **Control & enforcement:** Amount-triggered filing; MLRO approval before submission.
- **Frequency / SLA:** Per qualifying transaction; file **≤24h** via goAML.
- **Responsible:** MLRO.
- **Evidence & retention:** DPMSR filing + approval; **5 yrs**.

### MoE Survey
- **Purpose:** Track completion of the mandatory MoE AML/CFT supervisory survey.
- **MoE / UAE obligation:** **MoE AML/CFT Survey (MOEC/AML/001/2026)** — mandatory for all DNFBPs.
- **Control & enforcement:** Completion tracked to submission deadline.
- **Frequency / SLA:** Per MoE survey cycle.
- **Responsible:** MLRO / Compliance Officer.
- **Evidence & retention:** Submission confirmation; **5 yrs**.

### Enforcement
- **Purpose:** Regulatory deadline + corrective-action tracker to closure.
- **MoE / UAE obligation:** Remediation of supervisory findings — FDL 10/2025; SOC2 CC7.4.
- **Control & enforcement:** Owner + due date per action; overdue escalates to MLRO.
- **Frequency / SLA:** Per finding/deadline.
- **Responsible:** MLRO / Compliance Officer.
- **Evidence & retention:** Action tracker; **5 yrs**.

### Oversight
- **Purpose:** Board/management four-eyes sign-off, committee minutes, circular disposition.
- **MoE / UAE obligation:** Governance & senior oversight — FDL 10/2025 Art.20; Cabinet 10/2019 Art.21; CBUAE AML §6.
- **Control & enforcement:** Two independent signatories; SLA breaches escalate to MLRO.
- **Frequency / SLA:** Per approval; periodic committee cadence.
- **Responsible:** Board / senior management / MLRO.
- **Evidence & retention:** Signed minutes + disposition; **5 yrs**.

### Maker-Checker
- **Purpose:** Dual-control workflow for regulated actions with TOCTOU protection.
- **MoE / UAE obligation:** Segregation of duties — FDL 10/2025 Art.20; Cabinet 10/2019 Art.21.
- **Control & enforcement:** Second authorised user must approve; record re-read under lock before commit.
- **Frequency / SLA:** Per sensitive action.
- **Responsible:** Two authorised users.
- **Evidence & retention:** Maker + checker identities logged; **5 yrs**.

### goAML Export / Submission
- **Purpose:** FIU goAML report generation/submission with entity-ID validation.
- **MoE / UAE obligation:** FIU reporting via goAML — Cabinet 10/2019; FATF R.20; UAE FIU registration (Rentity ID).
- **Control & enforcement:** Entity-ID validated before transmission; placeholder IDs blocked.
- **Frequency / SLA:** Per report; without delay.
- **Responsible:** MLRO.
- **Evidence & retention:** Validated XML + receipt; **5 yrs**.

### Batch Screening
- **Purpose:** Bulk portfolio screening on list updates.
- **MoE / UAE obligation:** Re-screening on watchlist change — FDL 20/2018 Art.18; Cabinet 74/2020; FATF R.6.
- **Control & enforcement:** Whole book re-screened when consolidated lists change.
- **Frequency / SLA:** On list update / scheduled.
- **Responsible:** Compliance Officer; MLRO on hits.
- **Evidence & retention:** Batch run report; **5 yrs**.

## 3. Governance & Audit

### Responsible AI
- **Purpose:** Govern AI under ethics principles with mandatory human oversight on adverse dispositions.
- **MoE / UAE obligation:** AI governance & accountability — FDL 10/2025 Art.24; EU AI Act; ISO/IEC 42001.
- **Control & enforcement:** Human-in-the-loop on every adverse customer decision; model registry with risk tier + approval.
- **Frequency / SLA:** Continuous; per AI decision.
- **Responsible:** MLRO / AI governance owner.
- **Evidence & retention:** Model registry + human-review records + AI decision log; **10 yrs**.

### Inspection Room
- **Purpose:** Regulator-ready evidence pack (policies, EWRA, cases, audit chain, training).
- **MoE / UAE obligation:** Examination readiness & record production to MoE — Cabinet 10/2019 Art.24; FDL 10/2025.
- **Control & enforcement:** One-click aggregated pack for inspectors.
- **Frequency / SLA:** On demand / examination.
- **Responsible:** MLRO.
- **Evidence & retention:** Exported pack with timestamps; **10 yrs**.

### Regulatory Library
- **Purpose:** Searchable UAE/FATF/MoE regulatory reference with framework tagging.
- **MoE / UAE obligation:** Access to current obligations supporting decisions — FATF Methodology; MoE guidance.
- **Control & enforcement:** Citations referenced in dispositions.
- **Frequency / SLA:** Continuous.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Citation references; **5 yrs**.

### Policies & SOPs
- **Purpose:** AML programme charter + procedures, versioned and bound to the audit chain.
- **MoE / UAE obligation:** Documented, approved AML/CFT programme — Cabinet 10/2019 Art.21; FDL 10/2025 Art.24.
- **Control & enforcement:** Each decision references the policy version in force.
- **Frequency / SLA:** Reviewed at least annually.
- **Responsible:** MLRO → Board.
- **Evidence & retention:** Versioned policy with effective dates; **10 yrs**.

### Typology Library
- **Purpose:** 500+ ML/TF typologies with AI search and UAE/DPMS context.
- **MoE / UAE obligation:** Typology-informed detection — FATF Typologies; MoE DPMS red-flags.
- **Control & enforcement:** Typology references attached to detections.
- **Frequency / SLA:** Continuous.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Typology references in cases; **5 yrs**.

### Playbook
- **Purpose:** Step-by-step AML/CFT playbooks; each step writes an audit entry.
- **MoE / UAE obligation:** Consistent, evidenced procedure execution — Cabinet 10/2019; FATF Methodology.
- **Control & enforcement:** Mandated steps cannot be skipped silently.
- **Frequency / SLA:** Per procedure.
- **Responsible:** Compliance Officer / MLRO.
- **Evidence & retention:** Per-step audit entries; **10 yrs**.

### Corrections
- **Purpose:** Data-subject access and correction request handling.
- **MoE / UAE obligation:** Data-protection rights — UAE PDPL; GDPR where applicable.
- **Control & enforcement:** Requests logged and resolved within statutory window.
- **Frequency / SLA:** Per request; statutory deadline.
- **Responsible:** Compliance Officer / DPO.
- **Evidence & retention:** Request log + resolution; **5 yrs**.

### AI Incident Playbook
- **Purpose:** Structured response to AI failures (hallucination, bias, poisoning, prompt injection); Shadow-AI register; Vendor-AI audit.
- **MoE / UAE obligation:** AI incident governance & disclosure to CBUAE/FSRA **≤72h** — FDL 10/2025 Art.24.
- **Control & enforcement:** Containment + root-cause + mandatory reporting workflow.
- **Frequency / SLA:** Per incident; report **≤72h**.
- **Responsible:** MLRO / AI governance owner.
- **Evidence & retention:** Incident record; **10 yrs**.

### Incident Runbook
- **Purpose:** AML/security incident response runbook with retention.
- **MoE / UAE obligation:** Documented incident handling — SOC2 CC7.4; FDL 10/2025 Art.24.
- **Control & enforcement:** Defined response steps + closure.
- **Frequency / SLA:** Per incident.
- **Responsible:** MLRO / security.
- **Evidence & retention:** Incident timeline + closure; **10 yrs**.

### Eval KPI
- **Purpose:** Model/brain evaluation KPIs vs governance thresholds (calibration, drift, mode effectiveness).
- **MoE / UAE obligation:** Ongoing AI performance assurance — FDL 10/2025 Art.18.
- **Control & enforcement:** Threshold breaches flagged for review.
- **Frequency / SLA:** Continuous / per evaluation window.
- **Responsible:** AI governance owner.
- **Evidence & retention:** Evaluation dashboard records; **10 yrs**.

### Audit Trail
- **Purpose:** Immutable, tamper-evident decision chain with FIU export.
- **MoE / UAE obligation:** Record-keeping & traceability — FDL 20/2018 Art.16; Cabinet 10/2019 Art.24; FDL 10/2025 Art.24.
- **Control & enforcement:** Hash-linked append-only chain; integrity verified.
- **Frequency / SLA:** Per event; continuous.
- **Responsible:** MLRO / CTO.
- **Evidence & retention:** Hash-linked chain; **10 yrs** (WORM backup).

## 4. Intelligence & KYC Tools

### Live Intelligence Feed
- **Purpose:** Live UAE regulatory + 7-language adverse-media feed with AI triage.
- **MoE / UAE obligation:** Ongoing adverse-media / negative-news monitoring — FDL 20/2018 Art.18; FATF R.6; MoE DNFBP guidance.
- **Control & enforcement:** HIGH/CRITICAL items surfaced and triaged.
- **Frequency / SLA:** Live (5-min refresh).
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Triaged items with severity; **5 yrs**.

### Intelligence Hub
- **Purpose:** Unified AI-brain / security / governance / ops command centre.
- **MoE / UAE obligation:** Governed, transparent intelligence tooling — FDL 10/2025 Art.18.
- **Control & enforcement:** Consolidated, access-controlled workspace.
- **Frequency / SLA:** Continuous.
- **Responsible:** Compliance Officer / MLRO.
- **Evidence & retention:** Section health/usage signals; **5 yrs**.

### OSINT
- **Purpose:** Open-source signal harvesting for EDD.
- **MoE / UAE obligation:** Enhanced due diligence — FATF R.10; Cabinet 10/2019 Art.15.
- **Control & enforcement:** Findings attached to subject file.
- **Frequency / SLA:** On EDD trigger.
- **Responsible:** Compliance Officer / investigator.
- **Evidence & retention:** OSINT findings; **5 yrs**.

### GLEIF / LEI
- **Purpose:** LEI lookup + counterparty name search for entity verification.
- **MoE / UAE obligation:** Counterparty identification — FATF R.16.
- **Control & enforcement:** LEI captured where available.
- **Frequency / SLA:** At onboarding / on demand.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** LEI record; **5 yrs**.

### Entity Graph
- **Purpose:** Relationship/ownership network graph for opaque structures.
- **MoE / UAE obligation:** Understanding control structures — FATF R.24/25; Cabinet 58/2020.
- **Control & enforcement:** Graph used in EDD of complex entities.
- **Frequency / SLA:** On complex-structure review.
- **Responsible:** Investigator / MLRO.
- **Evidence & retention:** Graph snapshot; **5 yrs**.

### Domain Intel
- **Purpose:** Domain/web-infra intelligence + email-spoofing risk.
- **MoE / UAE obligation:** EDD / fraud-risk signals — FATF R.10.
- **Control & enforcement:** Domain risk recorded in subject file.
- **Frequency / SLA:** On EDD trigger.
- **Responsible:** Investigator.
- **Evidence & retention:** Domain risk report; **5 yrs**.

### Crypto Risk / Exposure
- **Purpose:** Wallet / virtual-asset exposure risk.
- **MoE / UAE obligation:** VA exposure assessment — FATF R.15; VARA.
- **Control & enforcement:** Exposure score informs risk rating.
- **Frequency / SLA:** On VA-linked subject.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Wallet exposure score; **5 yrs**.

### Vessel Check
- **Purpose:** Vessel sanctions + dark-fleet screening for trade exposure.
- **MoE / UAE obligation:** Sanctions screening — Cabinet 74/2020; OFAC SDN; FATF R.6.
- **Control & enforcement:** Vessel hits routed to MLRO.
- **Frequency / SLA:** On trade-related screening.
- **Responsible:** Compliance Officer / MLRO.
- **Evidence & retention:** Vessel screening result; **5 yrs**.

### Benford Analysis
- **Purpose:** Benford's-law anomaly testing on transactions.
- **MoE / UAE obligation:** Transaction analytics for suspicion — FATF R.20.
- **Control & enforcement:** Anomalies feed investigation.
- **Frequency / SLA:** On dataset analysis.
- **Responsible:** Analyst.
- **Evidence & retention:** Anomaly report; **5 yrs**.

### Investigation
- **Purpose:** Case workbench with evidence vault + timeline.
- **MoE / UAE obligation:** Structured, evidenced investigation supporting STR decisions — Cabinet 10/2019.
- **Control & enforcement:** Evidence + timeline captured per case.
- **Frequency / SLA:** Per case.
- **Responsible:** Investigator / MLRO.
- **Evidence & retention:** Investigation case file; **5 yrs**.

### Country & Geopolitical Risk
- **Purpose:** Country ML/TF risk (Basel AML Index, CPI, FATF lists, sanctions, stability) → correct CDD obligation.
- **MoE / UAE obligation:** Country/jurisdiction risk in the risk-based approach — FATF R.19; Cabinet 10/2019; MoE high-risk-jurisdiction guidance.
- **Control & enforcement:** Determines standard / enhanced / senior-approval CDD.
- **Frequency / SLA:** At onboarding & review; lists refreshed continuously.
- **Responsible:** Compliance Officer / MLRO.
- **Evidence & retention:** Country risk determination; **5 yrs**.

### Sanctions Evasion
- **Purpose:** Sanctions-evasion typology detection.
- **MoE / UAE obligation:** Sanctions compliance — Cabinet 74/2020; OFAC; FATF R.6.
- **Control & enforcement:** Evasion patterns flagged to MLRO.
- **Frequency / SLA:** Continuous.
- **Responsible:** MLRO.
- **Evidence & retention:** Evasion-pattern findings; **5 yrs**.

### Intelligence Tools
- **Purpose:** UBO walker + crypto exposure + synthetic-ID detection.
- **MoE / UAE obligation:** EDD / UBO verification — FATF R.10/24; Cabinet 58/2020.
- **Control & enforcement:** Tool output attached to subject.
- **Frequency / SLA:** On EDD trigger.
- **Responsible:** Investigator.
- **Evidence & retention:** Tool output; **5 yrs**.

### Adverse-Media (Live / Lookback)
- **Purpose:** Real-time + historical adverse-media screening across 7 languages.
- **MoE / UAE obligation:** Negative-news due diligence — FATF R.6; FDL 20/2018 Art.18.
- **Control & enforcement:** Hits classified by severity; HIGH/CRITICAL escalate.
- **Frequency / SLA:** At onboarding, ongoing, and on demand.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Adverse-media hits classified; **5 yrs**.

### Analyst Behavior (UEBA)
- **Purpose:** UEBA over compliance staff (bulk exports, off-hours, override rates, audit recon).
- **MoE / UAE obligation:** Internal controls / insider-threat monitoring — FDL 10/2025 Art.20; SOC2 CC7.4.
- **Control & enforcement:** Insider-threat alerts surfaced before findings; CSV export for evidence.
- **Frequency / SLA:** Continuous; configurable window.
- **Responsible:** MLRO / security.
- **Evidence & retention:** UEBA alert log (CSV); **5 yrs**.

### Brain Map
- **Purpose:** Reasoning-faculty catalogue + integrity view of the AI engine.
- **MoE / UAE obligation:** AI transparency/explainability — FDL 10/2025 Art.18.
- **Control & enforcement:** Faculty/version manifest exposed.
- **Frequency / SLA:** Continuous.
- **Responsible:** AI governance owner.
- **Evidence & retention:** Faculty/version manifest; **10 yrs**.

### Intel Status
- **Purpose:** Live intelligence-source + watchlist health monitoring.
- **MoE / UAE obligation:** Assurance screening sources are current — FATF R.6; Cabinet 74/2020.
- **Control & enforcement:** Source health surfaced; stale sources flagged.
- **Frequency / SLA:** Continuous.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Source health snapshot; **5 yrs**.

## 5. Screening, Monitoring & Core

### Screening
- **Purpose:** Name/entity screening vs UNSC/OFAC/EU CFSP/local lists with scoring + disambiguation.
- **MoE / UAE obligation:** Mandatory sanctions/PEP/adverse-media screening — FDL 20/2018 Art.18; Cabinet 74/2020; FATF R.6.
- **Control & enforcement:** Screening at onboarding and ongoing; hits route to MLRO.
- **Frequency / SLA:** At onboarding, on transactions, on list updates.
- **Responsible:** Compliance Officer; MLRO on hits.
- **Evidence & retention:** Screening result + match scores; **5 yrs**.

### Transaction Monitor
- **Purpose:** Behavioural TM with DPMS-threshold + typology flagging; auto-opens cases on critical alerts.
- **MoE / UAE obligation:** Ongoing transaction monitoring — **MoE Circular 08/AML/2021**; Cabinet 10/2019 Art.7; FATF R.20.
- **Control & enforcement:** Threshold/typology rules; critical alerts open cases.
- **Frequency / SLA:** Continuous / per transaction.
- **Responsible:** Compliance Officer; MLRO on escalation.
- **Evidence & retention:** Alert + disposition; **5 yrs**.

### Ongoing Monitor
- **Purpose:** Scheduled re-screening (high-risk twice-daily) + AI pattern scan to the case timeline.
- **MoE / UAE obligation:** Ongoing/perpetual monitoring — Cabinet 10/2019 Art.7; FDL 10/2025 Art.12; FATF R.10.
- **Control & enforcement:** Cadence enforced; results written to case.
- **Frequency / SLA:** Per cadence (twice-daily / daily / weekly).
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Per-subject run history; **5 yrs**.

### STR Cases
- **Purpose:** STR/SAR case lifecycle from screening → MLRO disposition → FIU filing.
- **MoE / UAE obligation:** Suspicious-activity case governance & reporting — Cabinet 10/2019 Art.17; FATF R.20.
- **Control & enforcement:** Full lifecycle with disposition + filing reference.
- **Frequency / SLA:** Per case; file without delay.
- **Responsible:** MLRO.
- **Evidence & retention:** Case timeline + filing reference; **5 yrs**.

### MLRO Advisor
- **Purpose:** AI advisory (executor/advisor/challenger) with full audit trail.
- **MoE / UAE obligation:** Decision support preserving MLRO independence — FDL 10/2025 Art.18/24; Cabinet 10/2019 Art.20 (MLRO).
- **Control & enforcement:** Advisory logged; MLRO retains decision authority.
- **Frequency / SLA:** On demand.
- **Responsible:** MLRO.
- **Evidence & retention:** Advisory record in audit chain; **10 yrs**.

### Access Control
- **Purpose:** Users/roles/module permissions with immutable permission audit trail.
- **MoE / UAE obligation:** Logical access control & segregation of duties — FDL 10/2025 Art.20; SOC2 CC6.1; Cabinet 10/2019 Art.21.
- **Control & enforcement:** RBAC + every change logged immutably.
- **Frequency / SLA:** Per change; continuous.
- **Responsible:** Administrator / MLRO.
- **Evidence & retention:** Permission change log; **10 yrs**.

### Analytics Dashboard
- **Purpose:** MLRO digest, bias monitoring, risk forecast.
- **MoE / UAE obligation:** Non-discrimination + management oversight — FATF R.10; FDL 10/2025.
- **Control & enforcement:** Bias ratio monitored vs threshold; digest to MLRO.
- **Frequency / SLA:** Continuous / periodic digest.
- **Responsible:** MLRO.
- **Evidence & retention:** Bias-ratio + digest reports; **5 yrs**.

### KRI Dashboard
- **Purpose:** Key risk indicators vs risk-appetite bands.
- **MoE / UAE obligation:** Risk-appetite monitoring — FATF R.1.
- **Control & enforcement:** Breaches escalate.
- **Frequency / SLA:** Continuous.
- **Responsible:** MLRO / Board.
- **Evidence & retention:** KRI readings vs thresholds; **5 yrs**.

### Training
- **Purpose:** AML/CFT training completion + expiry + annual programme.
- **MoE / UAE obligation:** Staff training — Cabinet 10/2019 Art.21; FDL 10/2025 Art.16; MoE DNFBP guidance.
- **Control & enforcement:** Completion tracked; lapses flagged.
- **Frequency / SLA:** At least annually.
- **Responsible:** Compliance Officer.
- **Evidence & retention:** Training completion register; **5 yrs**.

---

*Change-controlled: any new module must be added here with its six-field MoE-aligned entry and a daily Asana attestation task before go-live.*
