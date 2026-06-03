# Hawkeye Sterling — Module Compliance Register

**Status:** Compliance-reviewed · audit-ready · change-controlled
**Purpose:** Authoritative compliance description for every operational module — its function, the control it enforces, the regulatory obligation it satisfies, and the evidence it produces. This is the canonical source for the per-module daily Asana attestation tasks.
**Regulatory frame:** UAE FDL No.20/2018 (AML/CFT), FDL No.10/2025 (AI governance), Cabinet Decision No.10/2019 (STR/FIU), Cabinet Decision No.58/2020 (UBO), Cabinet Decision No.74/2020 (TFS), CR 134/2025, MoE Circular 08/AML/2021, FATF Recommendations & Methodology, OECD Due Diligence Guidance, LBMA Responsible Gold Guidance v9, ISO/IEC 42001, EU AI Act, UAE PDPL, SOC 2.

---

## 1. Onboarding & CDD

**Client Portal.** Provides self-service onboarding where an entity submits its legal identity, beneficial owners, and directors, which the compliance brain auto-screens against sanctions, PEP, adverse-media and jurisdiction databases before the MLRO renders a decision. Enforces risk-based Customer Due Diligence at the point of entry so no relationship is established without identification, verification and screening. *Regulatory basis:* FDL 10/2025 Art.10; Cabinet 58/2020; FATF R.10. *Evidence:* onboarding record + screening result + MLRO disposition written to the immutable audit chain.

**UBO Declaration.** Captures and risk-rates every natural-person beneficial owner holding ≥25% ownership, control or voting rights, including layered and nominee structures. Enforces the statutory UBO-identification obligation and blocks activation where the true owner cannot be established. *Regulatory basis:* Cabinet 58/2020; FDL 10/2025 Art.19. *Evidence:* UBO register entry with ownership percentages and verification status.

**PEP Profiles.** Establishes Politically Exposed Person tier, source of wealth/funds, relationship network and the enhanced due-diligence measures applied. Enforces senior-management approval and ongoing EDD for higher-risk relationships. *Regulatory basis:* FATF R.12; FDL 20/2018 Art.18. *Evidence:* PEP determination, SoW narrative and EDD checklist retained per file.

**CDD Review.** Runs risk-tiered periodic re-KYC (high-risk every 3 months, medium 6 months, low annually) with an AI adequacy check that flags incomplete or stale due diligence. Enforces the obligation to keep CDD current throughout the business relationship. *Regulatory basis:* FDL 10/2025 Art.11; FATF R.10. *Evidence:* review register with last-review date, outcome and next-due date.

**Data Quality.** Monitors CDD record completeness across the portfolio and generates an AI remediation plan for deficient files. Enforces accurate, adequate and up-to-date customer data as a precondition for reliable screening and reporting. *Regulatory basis:* FDL 10/2025 Art.8; FATF R.10. *Evidence:* completeness scorecard and remediation log.

**Ownership Explorer.** Maps UBO and ownership chains, detecting shell-company risk and jurisdiction-layering used to obscure control. Enforces look-through identification of complex structures. *Regulatory basis:* Cabinet 58/2020; FATF R.24/25. *Evidence:* ownership graph and shell-risk assessment.

**Employees.** Maintains the staff register with Emirates ID/passport expiry tracking and AML/CFT training currency per team member. Enforces fit-and-proper staffing and the training obligation. *Regulatory basis:* FDL 10/2025 Art.16. *Evidence:* staff record with document-expiry and training-completion status.

**Approvals.** Tracks entity onboarding approvals — status, risk score and approved country destinations — under a four-eyes control. Enforces dual authorisation and segregation of duties for relationship acceptance. *Regulatory basis:* FDL 10/2025 Art.20; CBUAE AML Standards §6. *Evidence:* approval record with both signatories logged in the audit chain.

**Supplier / Vendor Due Diligence.** Performs third-party and supplier due diligence with AI risk assessment and a tier-based re-assessment cadence. Enforces counterparty/vendor risk management across the supply relationship. *Regulatory basis:* FATF R.10; OECD DDG. *Evidence:* vendor assessment, score and next-review date.

**Onboarding Wizard.** Guides the new-customer intake flow and routes the file to CDD, screening and MLRO review. Enforces a controlled, no-gaps intake path. *Regulatory basis:* FDL 10/2025 Art.10. *Evidence:* intake completion trail.

## 2. Risk & AML Operations

**EWRA / BWRA.** Produces the enterprise- and business-wide money-laundering/terrorist-financing risk assessment with an AI-generated board report. Enforces the obligation to identify, assess and document ML/TF risk and to inform the risk-based approach. *Regulatory basis:* FATF R.1; FDL 10/2025. *Evidence:* dated EWRA approved by the Board.

**STR/SAR QA.** Applies a four-eyes quality review to suspicious-transaction reports before filing and exports goAML-compliant XML. Enforces report accuracy and the dual-control gate prior to FIU submission. *Regulatory basis:* Cabinet 10/2019; FATF R.20. *Evidence:* QA sign-off and exported filing artifact.

**SAR Narrative.** Generates suspicious-activity narratives under a tipping-off egress gate that withholds output if disclosure risk is detected. Enforces the prohibition on tipping off while supporting timely reporting. *Regulatory basis:* FDL 10/2025 Art.17; Cabinet 10/2019. *Evidence:* egress-check result attached to the narrative.

**Supply Chain / Responsible Sourcing.** Assesses geographic and human-rights supply-chain risk (CSDDD/UFLPA) using the OECD five-step due-diligence framework. Enforces responsible-sourcing due diligence for minerals and high-risk supply chains. *Regulatory basis:* OECD DDG; LBMA RGG v9; MD 68/2024. *Evidence:* five-step DD record and CAHRA exposure assessment.

**RMI / RMAP.** Tracks Responsible Minerals Initiative assurance and Step-4 third-party audit history of smelters/refiners. Enforces upstream/downstream assurance obligations. *Regulatory basis:* OECD DDG Annex II; LBMA RGG v9. *Evidence:* RMAP audit status per supplier.

**OECD DDG.** Tracks conformance to the OECD Due Diligence Guidance for responsible mineral supply chains. Enforces the recognised five-step due-diligence standard. *Regulatory basis:* OECD DDG. *Evidence:* conformance checklist.

**Reg Changes.** Maintains a regulatory-change roadmap with an AI-built month-by-month implementation calendar. Enforces horizon-scanning and timely adoption of new obligations. *Regulatory basis:* FATF Methodology; FDL 10/2025. *Evidence:* change log with implementation deadlines and owners.

**Shipments.** Tracks bullion chain-of-custody from origin refinery through transit to vault settlement with AI trade-based money-laundering scanning; held shipments trigger automatic MLRO review. Enforces WORM-logged custody integrity for precious-metals flows. *Regulatory basis:* LBMA RGG v9; OECD 5-step DD. *Evidence:* WORM custody log per consignment.

**EOCN.** Handles UAE targeted financial sanctions registration, NAS/ARS processing and local control-list screening. Enforces mandatory TFS screening and the 24-hour freeze SLA. *Regulatory basis:* Cabinet 74/2020; UNSC Consolidated List. *Evidence:* screening result and freeze/no-match decision.

**TFS Alerts.** Monitors EOCN subscription alert emails and creates Asana compliance tasks automatically on new designations. Enforces continuous monitoring against the local terrorist and UN consolidated lists. *Regulatory basis:* TFS Mandatory Screening; Cabinet 74/2020. *Evidence:* alert log and resulting task/disposition.

**CNMR / PNMR.** Manages the confirmed and potential name-match queue and FIU notification workflow. Enforces adjudication of every potential match and notification where confirmed. *Regulatory basis:* Cabinet 74/2020; Cabinet 10/2019. *Evidence:* match adjudication record.

**DPMSR.** Reports designated precious-metals-and-stones cash transactions at or above the AED 55,000 threshold via goAML. Enforces the amount-triggered DPMS reporting obligation independent of suspicion. *Regulatory basis:* CR 134/2025 Art.3; MoE Circular 08/AML/2021. *Evidence:* DPMSR filing within 24h, MLRO-approved.

**MoE Survey.** Tracks completion of the mandatory AML/CFT survey for all DNFBPs. Enforces the supervisory reporting obligation. *Regulatory basis:* MOEC/AML/001/2026. *Evidence:* survey submission confirmation.

**Enforcement.** Tracks regulatory deadlines and corrective actions to closure. Enforces remediation accountability and SLA adherence. *Regulatory basis:* FDL 10/2025; SOC2 CC7.4. *Evidence:* action tracker with owner, due date and status.

**Oversight.** Captures board/management four-eyes sign-off, committee minutes and regulatory-circular disposition. Enforces governance oversight and segregation of duties at the senior level. *Regulatory basis:* FDL 10/2025 Art.20; CBUAE AML Standards §6. *Evidence:* signed minutes and disposition record.

**Maker-Checker.** Provides a dual-control workflow for regulated actions where a second authorised user must approve. Enforces segregation of duties / four-eyes on sensitive operations with TOCTOU protection. *Regulatory basis:* FDL 10/2025 Art.20. *Evidence:* maker and checker identities logged.

**goAML Export / Submission.** Generates and submits FIU goAML reports with entity-ID validation before transmission. Enforces correct, complete regulatory filing. *Regulatory basis:* Cabinet 10/2019; FATF R.20. *Evidence:* validated XML and submission receipt.

**Batch Screening.** Screens the portfolio in bulk against consolidated sanctions/PEP lists on list updates. Enforces re-screening of the book whenever watchlists change. *Regulatory basis:* FDL 20/2018 Art.18; FATF R.6. *Evidence:* batch run report with hits.

## 3. Governance & Audit

**Responsible AI.** Governs AI use under UNESCO/EU-AI-Act ethics principles with mandatory human oversight on every adverse customer disposition. Enforces accountable, explainable AI and the human-in-the-loop control. *Regulatory basis:* FDL 10/2025 Art.24; EU AI Act; ISO/IEC 42001. *Evidence:* model registry, human-review record, 10-year AI decision log.

**Inspection Room.** Aggregates a regulator-ready evidence pack (policies, EWRA, cases, audit chain, training, onboarding) on demand. Enforces examination readiness. *Regulatory basis:* FDL 10/2025; SOC2. *Evidence:* exported evidence pack with timestamps.

**Regulatory Library.** Provides a searchable UAE/FATF regulatory reference with framework tagging. Enforces access to current obligations supporting decisions. *Regulatory basis:* FATF Methodology. *Evidence:* citation references used in dispositions.

**Policies & SOPs.** Maintains the AML programme charter and procedures, versioned and bound to the audit chain so each decision references the policy in force. Enforces a documented, board-approved compliance programme. *Regulatory basis:* FDL 10/2025 Art.24. *Evidence:* versioned policy with effective dates.

**Typology Library.** Catalogues 500+ ML/TF typologies with AI search and UAE-localised context. Enforces typology-informed detection and analyst guidance. *Regulatory basis:* FATF Typologies. *Evidence:* typology references in case files.

**Playbook.** Provides step-by-step AML/CFT compliance playbooks where each mandated step generates an audit-chain entry. Enforces consistent, evidenced execution of regulated procedures. *Regulatory basis:* FATF Methodology; FDL 10/2025. *Evidence:* per-step audit entries.

**Corrections.** Handles data-subject access and correction requests. Enforces data-protection rights. *Regulatory basis:* UAE PDPL; GDPR (where applicable). *Evidence:* request log with resolution.

**AI Incident Playbook.** Provides structured response to AI failures — hallucination, bias spike, data poisoning, prompt injection — reportable to CBUAE/FSRA within 72 hours, plus Shadow-AI register and Vendor-AI audit. Enforces AI incident governance and mandatory disclosure. *Regulatory basis:* FDL 10/2025 Art.24. *Evidence:* incident record with containment and root-cause.

**Incident Runbook.** Provides the AML/security incident response runbook with retention. Enforces documented incident handling. *Regulatory basis:* SOC2 CC7.4; FDL 10/2025 Art.24. *Evidence:* incident timeline and closure.

**Eval KPI.** Tracks model/brain evaluation KPIs against governance thresholds (calibration, drift, mode effectiveness). Enforces ongoing AI performance assurance. *Regulatory basis:* FDL 10/2025 Art.18. *Evidence:* evaluation dashboard with thresholds.

**Audit Trail.** Maintains the immutable, tamper-evident decision chain with 10-year retention, exportable to goAML/FIU. Enforces the record-keeping and traceability obligation underpinning every other control. *Regulatory basis:* FDL 10/2025 Art.24. *Evidence:* hash-linked chain with integrity status.

## 4. Intelligence & KYC Tools

**Live Intelligence Feed.** Polls UAE regulatory bodies and global news on a live cadence and sweeps adverse media across seven languages, surfacing HIGH/CRITICAL items with AI triage. Enforces ongoing adverse-media and regulatory monitoring. *Regulatory basis:* FDL 20/2018 Art.18; FATF R.6. *Evidence:* triaged feed items with severity.

**Intelligence Hub.** Unifies the AI-brain, security, governance and operational intelligence views in one command centre. Enforces a consolidated, governed intelligence workspace. *Regulatory basis:* FDL 10/2025 Art.18. *Evidence:* per-section health and usage signals.

**OSINT.** Harvests open-source signals from public infrastructure, social platforms and domain records to support enhanced due diligence. *Regulatory basis:* FATF R.10 (EDD). *Evidence:* OSINT findings attached to subject.

**GLEIF / LEI.** Resolves Legal Entity Identifiers and performs counterparty name search for entity verification. *Regulatory basis:* FATF R.16. *Evidence:* LEI record.

**Entity Graph.** Builds the relationship and ownership network graph for complex or opaque structures. *Regulatory basis:* FATF R.24/25. *Evidence:* graph snapshot.

**Domain Intel.** Assesses domain and web-infrastructure intelligence including email-spoofing/phishing risk. *Regulatory basis:* FATF R.10. *Evidence:* domain risk report.

**Crypto Risk / Exposure.** Assesses wallet and virtual-asset exposure risk. *Regulatory basis:* FATF R.15; VARA. *Evidence:* wallet exposure score.

**Vessel Check.** Screens vessels for sanctions and dark-fleet indicators relevant to trade exposure. *Regulatory basis:* FATF R.6; OFAC SDN. *Evidence:* vessel screening result.

**Benford Analysis.** Runs Benford's-law statistical anomaly testing on transaction data to surface manipulation. *Regulatory basis:* FATF R.20 (analytics). *Evidence:* anomaly report.

**Investigation.** Provides the case investigation workbench with evidence vault and timeline. Enforces structured, evidenced investigations. *Regulatory basis:* Cabinet 10/2019. *Evidence:* investigation case file.

**Country & Geopolitical Risk.** Scores country-level ML/TF risk using the Basel AML Index, TI CPI, FATF grey/black lists, OFAC/EU/UN sanctions and political stability, and determines the correct CDD obligation (standard/enhanced/senior approval). *Regulatory basis:* FATF R.19; FDL 10/2025. *Evidence:* country risk determination.

**Sanctions Evasion.** Detects sanctions-evasion typologies. *Regulatory basis:* FATF R.6; OFAC. *Evidence:* evasion-pattern findings.

**Intelligence Tools.** Bundles UBO walker, crypto exposure and synthetic-ID detection for investigators. *Regulatory basis:* FATF R.10/24. *Evidence:* tool output per subject.

**Adverse-Media (Live / Lookback).** Performs real-time and historical adverse-media screening across seven languages. Enforces negative-news due diligence. *Regulatory basis:* FATF R.6; FDL 20/2018 Art.18. *Evidence:* adverse-media hits with classification.

**Analyst Behavior.** Applies User & Entity Behaviour Analytics to compliance staff — bulk exports, off-hours access, verdict-override rates, audit-trail reconnaissance — to surface insider-threat signals before they become findings. Enforces the segregation/monitoring control over privileged users. *Regulatory basis:* SOC2 CC7.4; FDL 10/2025 Art.20. *Evidence:* UEBA alert log (CSV-exportable).

**Brain Map.** Exposes the reasoning-faculty catalogue and integrity view of the compliance brain. Enforces transparency of the AI decision engine. *Regulatory basis:* FDL 10/2025 Art.18. *Evidence:* faculty/version manifest.

**Intel Status.** Monitors live intelligence-source and watchlist health. Enforces assurance that screening sources are current and operational. *Regulatory basis:* FATF R.6. *Evidence:* source health snapshot.

## 5. Screening, Monitoring & Core

**Screening.** Screens names/entities against UNSC, OFAC, EU CFSP and local lists with risk scoring and disambiguation. Enforces mandatory sanctions/PEP/adverse-media screening at onboarding and on an ongoing basis. *Regulatory basis:* FDL 20/2018 Art.18; FATF R.6. *Evidence:* screening result with match scores.

**Transaction Monitor.** Performs behavioural transaction monitoring with DPMS-threshold and typology flagging, auto-opening cases for critical alerts. Enforces ongoing monitoring of transactions for suspicious activity. *Regulatory basis:* MoE Circular 08/AML/2021; FATF R.20. *Evidence:* alert and disposition record.

**Ongoing Monitor.** Re-screens enrolled subjects on a schedule (high-risk twice-daily) with an AI pattern scan, writing results to the case timeline. Enforces perpetual, risk-based ongoing monitoring. *Regulatory basis:* FDL 10/2025 Art.12; FATF R.10. *Evidence:* per-subject run history.

**STR Cases.** Manages the STR/SAR case lifecycle from first screening through MLRO disposition to FIU filing. Enforces end-to-end case governance and reporting. *Regulatory basis:* Cabinet 10/2019; FATF R.20. *Evidence:* case timeline with disposition and filing reference.

**MLRO Advisor.** Provides AI-assisted MLRO advisory across executor/advisor/challenger modes with a full audit trail. Enforces decision support that preserves MLRO independence and documents reasoning. *Regulatory basis:* FDL 10/2025 Art.18/24. *Evidence:* advisory record in the audit chain.

**Access Control.** Manages platform users, roles and module permissions with an immutable permission audit trail. Enforces logical access control and segregation of duties. *Regulatory basis:* FDL 10/2025 Art.20; SOC2 CC6.1. *Evidence:* permission change log.

**Analytics Dashboard.** Provides the MLRO digest, bias monitoring and risk forecast. Enforces non-discrimination monitoring and management oversight of the programme. *Regulatory basis:* FATF R.10 (non-discrimination); FDL 10/2025. *Evidence:* bias-ratio and digest reports.

**KRI Dashboard.** Tracks key risk indicators against risk-appetite bands. Enforces risk-appetite monitoring and escalation. *Regulatory basis:* FATF R.1. *Evidence:* KRI readings vs thresholds.

**Training.** Logs AML/CFT staff training completion with expiry tracking and the annual programme. Enforces the staff-training obligation. *Regulatory basis:* FDL 10/2025 Art.16. *Evidence:* training completion register.

---

*Change-controlled: any new module must be added here with its compliance description, regulatory basis and a daily Asana attestation task before go-live.*
