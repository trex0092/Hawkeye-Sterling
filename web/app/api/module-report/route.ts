import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { asanaGids, moduleProjectGid } from "@/lib/server/asanaConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function projectGidForModule(module: string): string {
  // Per-module routing (2026-06-10 workspace rebuild): every sidebar module
  // has its own board; aliases map shared/legacy ids; anything unmapped
  // lands on 00 · Hawkeye Inbox — Master Landing for MLRO triage.
  return moduleProjectGid(module);
}

const MODULE_LABELS: Record<string, string> = {
  // 01 · Screening
  screening:                "Screening",
  batch:                    "Batch Screen",
  "adverse-media-lookback": "Adverse Media Lookback",
  "adverse-media":          "Adverse Media",
  "adverse-media-live":     "Live Adverse Media Feed",
  // 02 · MLRO Daily Digest
  analytics:                "Analytics",
  rmi:                      "Risk & Management Information",
  oversight:                "Oversight",
  // 03 · Audit Log
  "audit-trail":            "Audit Trail",
  // 04 · Four-Eyes Approvals
  "screening-four-eyes":    "Four-Eyes Queue",
  "cdd-review":             "CDD Review",
  "ubo-declaration":        "UBO Declaration",
  // 05 · STR/SAR
  "str-cases":              "STR / SAR Cases",
  "sar-qa":                 "SAR Quality Assurance",
  cases:                    "Cases",
  enforcement:              "Enforcement",
  "goaml-submission":       "goAML STR Submission",
  // 06 · FFR
  benford:                  "Benford Analysis",
  // 07 · CDD/KYC
  gleif:                    "GLEIF / LEI",
  "entity-graph":           "Entity Graph & UBO Intelligence",
  "domain-intel":           "Domain Intel",
  "crypto-risk":            "Crypto Risk",
  "vendor-dd":              "Vendor Due Diligence",
  "client-portal":          "Client Portal",
  intel:                    "OSINT Intelligence",
  // 08 · Transaction Monitoring
  "transaction-monitor":    "Transaction Monitor",
  // 09 · Compliance Ops
  policies:                 "Policies",
  regulatory:               "Regulatory",
  playbook:                 "Playbook",
  corrections:              "Corrections",
  // 10 · Shipments
  shipments:                "Shipments",
  // 11 · Employees
  employees:                "Employees",
  // 12 · Training
  training:                 "Training",
  // 13 · Compliance Governance
  ewra:                     "Enterprise-Wide Risk Assessment",
  "api-docs":               "API Documentation",
  "responsible-ai":         "Responsible AI Governance",
  "ai-governance":          "AI Governance Framework",
  "eval-kpi":               "Eval KPIs & Performance Metrics",
  // 14 · Routines
  "ongoing-monitor":        "Ongoing Monitor",
  // 15 · MLRO Workbench
  workbench:                "MLRO Workbench",
  "mlro-advisor":           "MLRO Advisor",
  investigation:            "Investigation",
  "weaponized-brain":       "Weaponized Brain",
  heatmap:                  "Geographic Heatmap",
  telemetry:                "Mode Telemetry",
  "red-team":               "Red-Team Prompt Tests",
  "security-audit":         "Security Audit",
  // 16 · Supply Chain
  "vessel-check":           "Vessel Check",
  // 17 · Export Control
  eocn:                     "EOCN Trade Compliance",
  // 18 · Regulator Portal
  "inspection-room":        "Inspection Room",
  // 19 · Incidents & Grievances
  "grievances-whistleblowing": "Grievances & Whistleblowing",
  // 07 · CDD — Onboarding
  onboarding:               "Onboarding Wizard",
  // 05 · STR/SAR
  goaml:                    "goAML Export",
  // Additional modules
  "analytics-dashboard":    "Analytics Dashboard",
  "kri-dashboard":          "KRI Dashboard",
  "incident-runbook":       "Incident Runbook",
  "reg-change":             "Regulatory Change",
  "brain-map":              "Brain Map",
  "intelligence-hub":       "Intelligence Hub",
  "intelligence-tools":     "Intelligence Tools",
  "batch-screening":        "Batch Screening",
  "country-risk":           "Country Risk",
  "country-risk-map":       "Country Risk Map",
  "sanctions-evasion":      "Sanctions Evasion",
  "supply-chain":           "Supply Chain",
  "pep-profile":            "PEP Profile",
  ownership:                "Ownership",
  "sar-narrative":          "SAR Narrative",
  "access-control":         "Access Control",
  "maker-checker":          "Maker-Checker",
  approvals:                "Approvals",
  profile:                  "Profile",
  cnmr:                     "CNMR",
  dpmsr:                    "DPMSR",
  "moe-survey":             "MoE Survey",
  "oecd-ddg":               "OECD DDG",
  "responsible-sourcing":   "Responsible Sourcing",
  "tfs-alerts":             "TFS Alerts",
  "typology-library":       "Typology Library",
  "analyst-behavior":       "UEBA — Analyst Behaviour Analytics",
  "intel-status":           "Intelligence Source Health",
  "admin-tenants":          "Tenant Administration",
  // Additional modules
  "ai-incident-playbook":   "AI Incident Log",
  "audit-findings":         "Audit Findings",
  "board-dashboard":        "Board Dashboard",
  bra:                      "Business Risk Assessment",
  "coi-register":           "COI Register",
  comtrade:                 "COMTRADE Trade Intelligence",
  contact:                  "Contact",
  "document-intelligence":  "Document Intelligence",
  "dormant-accounts":       "Dormant Accounts",
  "env-check":              "Environment Check",
  "esg-risk":               "ESG Risk",
  "fp-optimizer":           "False Positive Optimizer",
  functions:                "Functions",
  gdpr:                     "GDPR / PDPL",
  geopolitical:             "Geopolitical Intelligence",
  lbma:                     "LBMA Responsible Gold",
  operator:                 "Operator Settings",
  "outsourcing-register":   "Outsourcing Register",
  pkyc:                     "Perpetual KYC",
  pnmr:                     "PNMR Filing",
  "predictive-risk":        "Predictive Risk",
  privacy:                  "Privacy",
  "regulatory-filing":      "Regulatory Filing",
  "risk-appetite":          "Risk Appetite",
  rmap:                     "RMAP Smelter Database",
  "security-scan":          "Security Scan",
  "shadow-ai":              "Shadow AI Monitor",
  "system-card":            "AI System Card",
  "system-status":          "System Status",
  "tm-rules":               "TM Rule Management",
  "training-tracker":       "Training Tracker",
  "vendor-ai-audit":        "Vendor AI Audit",
  "voluntary-disclosure":   "Voluntary Disclosure",
  webhooks:                 "Webhooks",
  workflow:                 "Workflow",
};

// Project board label — shown in the Asana task notes.
const PROJECT_BOARD: Record<string, string> = {
  screening:                "01 · Screening — Sanctions & Adverse Media",
  batch:                    "01 · Screening — Sanctions & Adverse Media",
  "adverse-media-lookback": "01 · Screening — Sanctions & Adverse Media",
  "adverse-media":          "01 · Screening — Sanctions & Adverse Media",
  "adverse-media-live":     "01 · Screening — Sanctions & Adverse Media",
  analytics:                "02 · Central MLRO Daily Digest",
  rmi:                      "02 · Central MLRO Daily Digest",
  oversight:                "02 · Central MLRO Daily Digest",
  "audit-trail":            "03 · Audit Log 10-Year Trail",
  "screening-four-eyes":    "04 · Four-Eyes Approvals",
  "cdd-review":             "04 · Four-Eyes Approvals",
  "ubo-declaration":        "04 · Four-Eyes Approvals",
  "str-cases":              "05 · STR/SAR/CTR/PMR GoAML Filings",
  "sar-qa":                 "05 · STR/SAR/CTR/PMR GoAML Filings",
  cases:                    "05 · STR/SAR/CTR/PMR GoAML Filings",
  enforcement:              "05 · STR/SAR/CTR/PMR GoAML Filings",
  "goaml-submission":       "05 · STR/SAR/CTR/PMR GoAML Filings",
  benford:                  "06 · FFR Incidents & Asset Freezes",
  gleif:                    "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "entity-graph":           "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "domain-intel":           "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "crypto-risk":            "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "vendor-dd":              "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "client-portal":          "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  intel:                    "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "transaction-monitor":    "08 · Transaction Monitoring",
  policies:                 "09 · Compliance Ops — Daily & Weekly Tasks",
  regulatory:               "09 · Compliance Ops — Daily & Weekly Tasks",
  playbook:                 "09 · Compliance Ops — Daily & Weekly Tasks",
  corrections:              "09 · Compliance Ops — Daily & Weekly Tasks",
  shipments:                "10 · Shipments — Tracking",
  employees:                "11 · Employees",
  training:                 "12 · Training",
  ewra:                     "13 · Compliance Governance",
  "api-docs":               "13 · Compliance Governance",
  "responsible-ai":         "13 · Compliance Governance",
  "eval-kpi":               "13 · Compliance Governance",
  "ongoing-monitor":        "14 · Routines — Scheduled",
  workbench:                "15 · MLRO Workbench",
  "mlro-advisor":           "15 · MLRO Workbench",
  investigation:            "15 · MLRO Workbench",
  "weaponized-brain":       "15 · MLRO Workbench",
  heatmap:                  "15 · MLRO Workbench",
  telemetry:                "15 · MLRO Workbench",
  "red-team":               "15 · MLRO Workbench",
  "security-audit":         "15 · MLRO Workbench",
  "vessel-check":           "16 · Supply Chain, ESG & LBMA Gold",
  eocn:                     "17 · Export Control & Dual-Use",
  "inspection-room":        "18 · Regulator Portal Handoff",
  "grievances-whistleblowing": "19 · Incidents & Grievances",
  onboarding:               "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  goaml:                    "05 · STR/SAR/CTR/PMR GoAML Filings",
  "analytics-dashboard":    "13 · Compliance Governance",
  "kri-dashboard":          "13 · Compliance Governance",
  "incident-runbook":       "13 · Compliance Governance",
  "reg-change":             "13 · Compliance Governance",
  "brain-map":              "15 · MLRO Workbench",
  "intelligence-hub":       "15 · MLRO Workbench",
  "intelligence-tools":     "15 · MLRO Workbench",
  "batch-screening":        "15 · MLRO Workbench",
  "country-risk":           "15 · MLRO Workbench",
  "country-risk-map":       "15 · MLRO Workbench",
  "sanctions-evasion":      "15 · MLRO Workbench",
  "supply-chain":           "15 · MLRO Workbench",
  "pep-profile":            "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  ownership:                "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "sar-narrative":          "05 · STR/SAR/CTR/PMR GoAML Filings",
  "access-control":         "09 · Compliance Ops — Daily & Weekly Tasks",
  "maker-checker":          "09 · Compliance Ops — Daily & Weekly Tasks",
  approvals:                "09 · Compliance Ops — Daily & Weekly Tasks",
  profile:                  "09 · Compliance Ops — Daily & Weekly Tasks",
  cnmr:                     "09 · Compliance Ops — Daily & Weekly Tasks",
  dpmsr:                    "09 · Compliance Ops — Daily & Weekly Tasks",
  "moe-survey":             "09 · Compliance Ops — Daily & Weekly Tasks",
  "oecd-ddg":               "09 · Compliance Ops — Daily & Weekly Tasks",
  "responsible-sourcing":   "09 · Compliance Ops — Daily & Weekly Tasks",
  "tfs-alerts":             "09 · Compliance Ops — Daily & Weekly Tasks",
  "typology-library":       "09 · Compliance Ops — Daily & Weekly Tasks",
  "analyst-behavior":       "13 · Compliance Governance",
  "intel-status":           "15 · MLRO Workbench",
  "admin-tenants":          "00 · Master Inbox",
  "ai-incident-playbook":   "19 · Incidents & Grievances",
  "audit-findings":         "09 · Compliance Ops — Daily & Weekly Tasks",
  "board-dashboard":        "13 · Compliance Governance",
  bra:                      "09 · Compliance Ops — Daily & Weekly Tasks",
  "coi-register":           "09 · Compliance Ops — Daily & Weekly Tasks",
  comtrade:                 "15 · MLRO Workbench",
  contact:                  "00 · Master Inbox",
  "document-intelligence":  "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "dormant-accounts":       "09 · Compliance Ops — Daily & Weekly Tasks",
  "env-check":              "13 · Compliance Governance",
  "esg-risk":               "09 · Compliance Ops — Daily & Weekly Tasks",
  "fp-optimizer":           "01 · Screening — Sanctions & Adverse Media",
  functions:                "00 · Master Inbox",
  gdpr:                     "13 · Compliance Governance",
  geopolitical:             "15 · MLRO Workbench",
  lbma:                     "16 · Supply Chain, ESG & LBMA Gold",
  operator:                 "13 · Compliance Governance",
  "outsourcing-register":   "09 · Compliance Ops — Daily & Weekly Tasks",
  pkyc:                     "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  pnmr:                     "05 · STR/SAR/CTR/PMR GoAML Filings",
  "predictive-risk":        "09 · Compliance Ops — Daily & Weekly Tasks",
  privacy:                  "13 · Compliance Governance",
  "regulatory-filing":      "09 · Compliance Ops — Daily & Weekly Tasks",
  "risk-appetite":          "13 · Compliance Governance",
  rmap:                     "16 · Supply Chain, ESG & LBMA Gold",
  "security-scan":          "13 · Compliance Governance",
  "shadow-ai":              "13 · Compliance Governance",
  "system-card":            "13 · Compliance Governance",
  "system-status":          "13 · Compliance Governance",
  "tm-rules":               "08 · Transaction Monitoring",
  "training-tracker":       "12 · Training",
  "vendor-ai-audit":        "13 · Compliance Governance",
  "voluntary-disclosure":   "09 · Compliance Ops — Daily & Weekly Tasks",
  webhooks:                 "13 · Compliance Governance",
  workflow:                 "09 · Compliance Ops — Daily & Weekly Tasks",
};

// Per-module compliance report summaries — used in Asana task notes.
// Server-side override ensures every task carries an audit-ready description
// regardless of what the client sends in the summary field.
const MODULE_SUMMARIES: Record<string, string> = {
  // 01 · Screening
  screening:
    "SANCTIONS & ADVERSE MEDIA SCREENING — COMPLIANCE REPORT\n\n" +
    "Screening run completed against consolidated watchlists including UN Security Council Consolidated List, OFAC SDN and Non-SDN Lists, EU Consolidated Financial Sanctions List, UK HMT Consolidated List, DFAT Australia, and internal proprietary risk lists. All match dispositions have been recorded with confidence scores, MLRO override rationale, and timestamped audit entries.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All MATCH_FOUND results investigated individually — no bulk clearance permitted\n" +
    "☐ Confidence threshold verified: scores ≥ 85% treated as confirmed hit pending MLRO review\n" +
    "☐ UN/OFAC/EU/UK list hits each assigned a written disposition with cited reasoning\n" +
    "☐ PEP co-hits escalated to enhanced due diligence (EDD) track\n" +
    "☐ Adverse media co-hits cross-referenced with standalone adverse media module\n" +
    "☐ No HIGH or CRITICAL-risk subject onboarded without documented MLRO written sign-off\n" +
    "☐ False-positive rate within approved operating threshold (≤ 3%)\n" +
    "☐ Audit chain entry confirmed: every AI screening decision logged per Federal Decree-Law No. 10 of 2025 Art.18\n" +
    "☐ Screening timestamp within 24 hours of subject submission\n\n" +
    "ESCALATION TRIGGERS: Any unresolved MATCH_FOUND disposition older than 24 hours must be escalated to MLRO. Any subject matching a designation issued within the past 30 days requires immediate senior MLRO review and potential asset freeze assessment.\n\n" +
    "CONSEQUENCES OF NON-COMPLIANCE: Failure to screen against designated persons lists before establishing a business relationship or executing a transaction constitutes a criminal offence under UAE law. Penalties include regulatory fines, licence suspension, and personal liability for the MLRO.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. (10) of 2025 Art.18 (CDD obligations), Federal Decree-Law No. 10 of 2025 Art.18 (AI audit trail), FATF Recommendation 6 (Targeted Financial Sanctions), FATF Recommendation 10 (Customer Due Diligence), Cabinet Decision No.74/2020 (Anti-Money Laundering).",

  batch:
    "BATCH SCREENING RUN — COMPLIANCE REPORT\n\n" +
    "Batch screening job completed against all active watchlists. The full subject population was processed with 100% coverage confirmed. Batch job ID, execution timestamp, total subject count, hit count, hit rate, and per-record disposition status are all recorded in the audit trail.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Batch job ID and execution timestamp verified and logged\n" +
    "☐ Total subjects processed equals the submitted population (no silently skipped records)\n" +
    "☐ Hit rate reviewed against historical baseline — anomalous spikes require investigation\n" +
    "☐ All MATCH_FOUND records individually queued for MLRO disposition (no bulk clearance)\n" +
    "☐ NO_MATCH records confirmed — random sample audit of ≥ 5% conducted\n" +
    "☐ Watchlist version confirmed current at time of batch execution\n" +
    "☐ Batch runtime within SLA (< 4 hours for standard batch; < 12 hours for enterprise)\n" +
    "☐ Error records (PROCESSING_ERROR) investigated and requeued\n" +
    "☐ Output file integrity hash verified before MLRO review queue is populated\n" +
    "☐ Every positive match requires individual MLRO disposition before onboarding or transaction approval proceeds\n\n" +
    "SLA REQUIREMENTS: MATCH_FOUND dispositions must be reviewed within 24 hours of batch completion. Overdue dispositions beyond 48 hours breach internal SLA and require MLRO escalation with written justification.\n\n" +
    "ESCALATION TRIGGERS: Hit rate deviating more than 2 standard deviations from the 30-day rolling average must be investigated immediately. Any batch producing zero results against a known-populated watchlist must be treated as a system failure.\n\n" +
    "CONSEQUENCES OF NON-COMPLIANCE: Undisposed batch hits create unacknowledged sanctions exposure. Any transaction processed against a subject with an unresolved MATCH_FOUND may constitute a sanctions violation.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 6, FATF Recommendation 10, Cabinet Decision No.74/2020.",

  "adverse-media-lookback":
    "ADVERSE MEDIA LOOKBACK SCREENING — COMPLIANCE REPORT\n\n" +
    "Historical adverse media lookback screening completed for the submitted subject population. All flagged articles have been retrieved, deduplicated, grouped by subject, and classified by the NLP sentiment and risk engine. 22-language coverage was applied across all major news sources, regulatory databases, court records, and sanction notices.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Article grouping and deduplication accuracy verified — no duplicate articles inflating scores\n" +
    "☐ Source reliability scores reviewed (tier-1 = verified regulatory/court source; tier-2 = major press; tier-3 = unverified)\n" +
    "☐ NLP classification verdicts (CRITICAL / HIGH / MEDIUM / LOW / CLEAR) reviewed per subject\n" +
    "☐ 22-language coverage confirmed active — no language exclusion logs present\n" +
    "☐ Lookback period covers the configured historical window (default: 10 years)\n" +
    "☐ Co-hits with sanctions module cross-referenced and combined risk score computed\n" +
    "☐ All subjects scoring HIGH or CRITICAL escalated to CDD/EDD review within 48 hours\n" +
    "☐ Article URLs and capture timestamps retained for audit admissibility\n" +
    "☐ MLRO disposition recorded for every HIGH/CRITICAL-scored subject before onboarding\n\n" +
    "THRESHOLDS & SLAs: HIGH-risk subjects must receive MLRO disposition within 48 hours. CRITICAL-risk subjects must receive MLRO disposition within 24 hours and trigger automatic EDD. Subjects with no adverse media must have a CLEAR verdict logged for audit purposes.\n\n" +
    "ESCALATION TRIGGERS: Any subject with adverse media allegations of terrorism financing, sanctions evasion, or bribery of a public official requires immediate senior MLRO review regardless of NLP score.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 12 (Politically Exposed Persons — EDD obligations), FATF Recommendation 10 (CDD), Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted screening audit trail).",

  "adverse-media":
    "ADVERSE MEDIA SCREENING — COMPLIANCE REPORT\n\n" +
    "Real-time adverse media screening completed for the submitted subject. Articles retrieved from configured live news feeds, regulatory gazettes, court databases, and proprietary intelligence sources. NLP classification, entity disambiguation, and sentiment scoring applied. All results logged to the append-only audit chain with AI decision metadata.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Subject identity disambiguation confirmed — no misidentification artifacts present\n" +
    "☐ Article count and source diversity reviewed (minimum 3 independent sources for HIGH verdict)\n" +
    "☐ Deduplication pipeline output verified — duplicate URLs removed from scoring inputs\n" +
    "☐ Sentiment classification per article confirmed and reviewed by MLRO\n" +
    "☐ Overall risk score and verdict (CRITICAL / HIGH / MEDIUM / LOW / CLEAR) documented\n" +
    "☐ HIGH and CRITICAL verdicts confirmed as blocking onboarding until MLRO disposition recorded\n" +
    "☐ Article evidence preserved with URL, publication date, and capture timestamp\n" +
    "☐ Hallucination gate passed — no AI-generated article citations present in output\n" +
    "☐ Audit chain entry written per Federal Decree-Law No. 10 of 2025 Art.18 AI decision logging requirement\n" +
    "☐ MLRO override (if applicable) documented with written reasoning\n\n" +
    "THRESHOLDS: Any unresolved HIGH-risk adverse media finding blocks onboarding and transaction approval until MLRO written disposition is recorded. CRITICAL findings trigger automatic EDD and senior management notification within 4 hours.\n\n" +
    "ESCALATION TRIGGERS: Adverse media involving current or former heads of state, government ministers, or designated terrorist financiers must be escalated to the MLRO and legal counsel regardless of overall score.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 12, Federal Decree-Law No. 10 of 2025 Art.18, Federal Decree-Law No. (10) of 2025 Art.18 (CDD), FATF Recommendation 10.",

  "adverse-media-live":
    "LIVE ADVERSE MEDIA FEED — COMPLIANCE REPORT\n\n" +
    "Live adverse media alert queue reviewed for the reporting period. Real-time feed is processing articles from all configured sources including sanctioned jurisdictions, domestic regulatory gazettes, and major international financial press. Alert acknowledgement status, escalation history, and feed health metrics reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Alert queue reviewed — no unacknowledged alerts older than 24 hours\n" +
    "☐ All HIGH-risk alerts acknowledged and assigned to MLRO reviewer\n" +
    "☐ All CRITICAL-risk alerts actioned within 4-hour SLA\n" +
    "☐ Feed connectivity status confirmed GREEN for all configured sources\n" +
    "☐ Last successful sync timestamps within SLA for every source (≤ 15 minutes for tier-1 feeds)\n" +
    "☐ Alert de-duplication pipeline operational — no repeat alerts for same article\n" +
    "☐ Any feed downtime in the period < 4 hours; downtime > 4 hours logged as operational incident\n" +
    "☐ Alert volume within expected statistical range — anomalous spike investigated\n" +
    "☐ NLP engine version current and validated against approved model registry\n" +
    "☐ Escalation path to MLRO on-call confirmed operational and tested within past 30 days\n\n" +
    "SLAs: CRITICAL alerts must be actioned within 4 hours. HIGH alerts within 24 hours. Feed downtime exceeding 4 hours constitutes an operational incident requiring MLRO notification and incident log entry (SOC2 CC7.4). Feeds silent for more than 1 hour without maintenance window require automated alerting.\n\n" +
    "ESCALATION TRIGGERS: Any CRITICAL alert involving a current customer triggers immediate MLRO notification and potential account restriction. Alert queue backlog exceeding 50 unacknowledged items requires a declared incident response.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (system resilience and AI decision audit), FATF Recommendation 12, SOC2 CC7.4 (incident detection and response).",
  // 02 · MLRO Daily Digest
  analytics:
    "MLRO DAILY DIGEST — ANALYTICS COMPLIANCE REPORT\n\n" +
    "MLRO Daily Digest analytics reviewed for the reporting period. All core performance KPIs assessed including false-positive rate, bias ratio, daily case volume, escalation rate, alert-to-SAR conversion rate, and model drift indicators. Anomalous trends and threshold breaches documented with root-cause analysis.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ False-positive rate at or below approved threshold (≤ 3%); breach triggers mandatory root-cause analysis\n" +
    "☐ Bias ratio within MLRO policy limit (≤ 1.15 — tighter than FATF floor of 1.5 per CG-BIAS-001)\n" +
    "☐ Daily case volume within ±2 standard deviations of 30-day rolling average\n" +
    "☐ Escalation rate reviewed — sustained increase ≥ 20% week-on-week requires documented assessment\n" +
    "☐ Alert-to-SAR conversion rate consistent with historical baseline\n" +
    "☐ Model drift indicators reviewed — any drifted mode triggers re-attestation within 5 business days\n" +
    "☐ All AI performance metrics logged to audit chain per Federal Decree-Law No. 10 of 2025 Art.18\n" +
    "☐ Dashboard reviewed by MLRO at minimum weekly cadence; ad-hoc review on any RED KPI\n" +
    "☐ Comparative trend analysis completed for current period versus prior 4 weeks\n" +
    "☐ Board reporting pack updated with current-period analytics summary\n\n" +
    "THRESHOLDS & SLAs: Any KPI breach since last review requires documented root-cause analysis within 48 hours. Sustained FP rate > 5% for more than 3 consecutive days requires MLRO written assessment and board notification within 5 business days.\n\n" +
    "ESCALATION TRIGGERS: Bias ratio exceeding 1.15, FP rate exceeding 5%, or case volume spike > 50% day-on-day must be escalated to MLRO immediately and investigated within 24 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI performance monitoring and audit trail), FATF Recommendation 1 (risk-based approach), NIST AI RMF MEASURE-2.7 (model performance monitoring).",

  rmi:
    "RISK & MANAGEMENT INFORMATION (RMI) — COMPLIANCE REPORT\n\n" +
    "Risk and Management Information review completed for the reporting period. All Key Risk Indicators reviewed, trend analysis completed, open action items assessed, and portfolio risk distribution examined by MLRO. Material changes to the risk profile documented and escalated as required.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All KRIs reviewed against their approved thresholds (GREEN / AMBER / RED status)\n" +
    "☐ Trend analysis completed for each KRI against 4-week rolling baseline\n" +
    "☐ All RED-status KRIs have documented action plans with assigned owners and resolution deadlines\n" +
    "☐ Action items open > 10 business days without material progress escalated to senior management\n" +
    "☐ Portfolio risk distribution reviewed — any material concentration in HIGH-risk tier documented\n" +
    "☐ KRI thresholds reviewed for continued relevance — last approved by MLRO confirmed current\n" +
    "☐ Board reporting pack updated with current KRI status and trend narrative\n" +
    "☐ Comparison to prior period included — new RED KRIs highlighted\n" +
    "☐ MI data sourced exclusively from validated, audit-trailed systems\n" +
    "☐ MLRO sign-off recorded before board submission\n\n" +
    "THRESHOLDS & SLAs: Any KRI breaching RED threshold must be escalated to the board within 5 business days. KRIs in breach for more than 10 business days without a documented remediation plan require mandatory CEO and board notification.\n\n" +
    "ESCALATION TRIGGERS: New RED KRI identified, KRI breaching threshold for second consecutive period, or any KRI with no assigned owner must be escalated to MLRO immediately.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (risk governance), FATF Recommendation 1 (risk-based approach and risk assessment), Federal Decree-Law No. (10) of 2025 (enterprise risk management obligations).",

  oversight:
    "COMPLIANCE OVERSIGHT — MLRO REVIEW REPORT\n\n" +
    "Compliance oversight review completed for the reporting period. Open investigations, pending four-eyes approvals, overdue STR filings, training compliance, and access control status reviewed by the MLRO. Material compliance failures identified and escalated per policy.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All open investigations reviewed — case age, assigned owner, and evidence status confirmed\n" +
    "☐ Pending four-eyes approval queue reviewed — no items overdue beyond defined SLA\n" +
    "☐ STR/SAR filing pipeline reviewed — no cases open beyond 30 days without disposition\n" +
    "☐ goAML submission status confirmed — no rejected submissions pending correction\n" +
    "☐ Staff AML/CFT training completion rate ≥ 95%; non-compliant staff suspended from regulated activities\n" +
    "☐ Access control recertification status current — no accounts with expired access rights active\n" +
    "☐ Model attestation status reviewed — no OVERDUE attestations in production\n" +
    "☐ Compliance gap register reviewed — all open gaps have action plans and owners\n" +
    "☐ Any material compliance failure in period notified to senior management with written documentation\n" +
    "☐ MLRO certification completed and dated before period close\n\n" +
    "SLA REQUIREMENTS: Overdue STR cases (> 30 days open) require senior MLRO escalation. Four-eyes items overdue > 5 business days require written justification and MLRO approval to extend. Staff suspended from regulated activities must be reinstated via a formal competency sign-off process.\n\n" +
    "ESCALATION TRIGGERS: Any material compliance failure, regulatory breach, or criminal conduct disclosure must be notified to the board within 2 business days and to the competent authority per applicable regulatory timeframes.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight and governance), Federal Decree-Law No. (10) of 2025 Art.18 (MLRO responsibilities), FATF Recommendation 18 (internal controls and compliance function).",
  // 03 · Audit Log
  "audit-trail":
    "AUDIT TRAIL INTEGRITY — COMPLIANCE REPORT\n\n" +
    "Audit trail integrity review completed for the reporting period. HMAC-SHA256 chain continuity verified with zero sequence gaps detected. All AI decisions, screening results, SAR determinations, four-eyes approvals, and egress check outcomes confirmed as logged to the append-only audit chain. Retention compliance and backup integrity assessed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ HMAC-SHA256 chain continuity verified — no sequence gaps, no missing entries\n" +
    "☐ All AI-assisted screening decisions logged with model ID, input hash, and output verdict\n" +
    "☐ All SAR determinations (filed, declined, pending) logged with MLRO identity and timestamp\n" +
    "☐ All four-eyes approval events logged with maker identity, checker identity, and outcome\n" +
    "☐ All egress gate decisions logged — including HELD_REVIEW outcomes\n" +
    "☐ 10-year retention policy compliance verified for all entries in the period\n" +
    "☐ Backup integrity hash verified against the WORM archive (CG-6 S3/WORM requirement)\n" +
    "☐ No direct database writes to the audit table detected outside the authorised writeAuditChainEntry() path\n" +
    "☐ Audit log access controls verified — read-only access for all non-system users\n" +
    "☐ Chain integrity validation script (validate-audit-chain.mjs) run and passed\n\n" +
    "CRITICAL CONTROLS: The audit chain is append-only by architecture. Any detected modification, deletion, or gap constitutes a critical compliance incident. Chain integrity failures must be reported to the board within 24 hours and to the regulator within the applicable notification window.\n\n" +
    "ESCALATION TRIGGERS: Any single gap in the HMAC chain, any AI decision found to be unlogged, or any audit entry found to have been modified after creation must be treated as a critical incident per the Incident Runbook.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (append-only AI decision audit trail), SOC2 CC7.4 (audit log integrity), Federal Decree-Law No. (10) of 2025 Art.26 (record retention for 10 years), FATF Recommendation 11 (record-keeping).",

  // 04 · Four-Eyes Approvals
  "cdd-review":
    "CUSTOMER DUE DILIGENCE (CDD) — FOUR-EYES REVIEW REPORT\n\n" +
    "CDD four-eyes review submitted for MLRO approval. Maker-checker separation enforced by system — TOCTOU protection re-reads the record under write lock before finalising approval. CDD completeness, EDD triggers, risk classification, and MLRO sign-off requirements reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Maker and checker identities confirmed as different individuals — system-enforced, verified in audit log\n" +
    "☐ TOCTOU re-read record matches the record reviewed by the checker — no in-flight modification detected\n" +
    "☐ Identity verification documents reviewed: passport/EID (valid, unexpired), proof of address (≤ 3 months)\n" +
    "☐ Risk classification (LOW / MEDIUM / HIGH / CRITICAL) assigned and rationale documented\n" +
    "☐ PEP status verified — if PEP, senior management written approval obtained\n" +
    "☐ Adverse media result reviewed and MLRO disposition recorded\n" +
    "☐ Sanctions screening result reviewed — no unresolved MATCH_FOUND present\n" +
    "☐ EDD documentation complete for all HIGH and CRITICAL-risk subjects\n" +
    "☐ Complex ownership structures (> 2 layers) flagged for UBO declaration module\n" +
    "☐ CDD review must not be approved by the initiating officer — any single-person approval is invalid\n\n" +
    "THRESHOLDS & SLAs: CDD reviews must be completed within 5 business days of submission. HIGH/CRITICAL risk reviews require senior MLRO sign-off within 48 hours. Expired CDD (> 12 months without refresh for HIGH risk, > 24 months for MEDIUM) must be re-initiated before any account activity.\n\n" +
    "ESCALATION TRIGGERS: Any CDD review where the same officer appears as both maker and checker must be immediately voided, re-submitted, and the incident logged. Any subject attempting onboarding with expired CDD must be blocked.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight and four-eyes controls), FATF Recommendation 10 (CDD measures), Federal Decree-Law No. (10) of 2025 Art.18 (CDD obligations), Cabinet Decision No.74/2020.",

  "ubo-declaration":
    "UBO DECLARATION — BENEFICIAL OWNERSHIP REVIEW REPORT\n\n" +
    "UBO declaration submitted for review. Beneficial ownership chain mapped to the ≥ 25% shareholding or control threshold. All identified UBOs screened against sanctions lists, PEP registers, and adverse media sources. Corporate structure diagram attached and nominee arrangements documented.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Beneficial ownership chain documented to the ≥ 25% threshold or natural-person ultimate owner\n" +
    "☐ All entities in the ownership chain identified by legal name, jurisdiction, and registration number\n" +
    "☐ Corporate structure diagram attached and reviewed for accuracy\n" +
    "☐ All UBO individuals screened against UN, OFAC, EU, UK sanctions lists and PEP registers\n" +
    "☐ Adverse media check completed for each UBO — results logged\n" +
    "☐ Nominee director or nominee shareholder arrangements identified and documented\n" +
    "☐ Circular ownership structures flagged for legal counsel review\n" +
    "☐ Significant control (SIG_CONTROL) holders identified even below the 25% threshold where applicable\n" +
    "☐ UBO declarations signed and dated by the submitting entity's authorised representative\n" +
    "☐ Account opening blocked until all UBO chains are fully resolved and MLRO-approved\n" +
    "☐ UBO register to be refreshed annually or on any material change in ownership\n\n" +
    "THRESHOLDS & SLAs: Unresolved UBO chains block account opening indefinitely. Any new UBO emerging post-onboarding must be notified within 14 days and the UBO declaration refreshed. Shell company layers > 3 require escalation to EDD with legal counsel engagement.\n\n" +
    "ESCALATION TRIGGERS: Circular ownership patterns, nominee structures obscuring beneficial ownership, or UBO identification impossible due to bearer shares require immediate MLRO and legal counsel notification.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (beneficial ownership identification), Cabinet Decision No.74/2020 Art.8 (UBO transparency), UAE Federal Decree-Law No.32/2021 (Companies Act UBO register), Federal Decree-Law No. 10 of 2025 Art.18.",
  // 05 · STR/SAR
  "str-cases":
    "SUSPICIOUS TRANSACTION REPORT (STR) CASE — COMPLIANCE REPORT\n\n" +
    "STR/SAR case submitted for MLRO review and filing determination. Case narrative reviewed, all supporting evidence assembled, and filing deadline assessed. The MLRO must make a formal suspicion determination before any filing or declination is recorded.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Case narrative reviewed for factual accuracy and consistency with underlying evidence\n" +
    "☐ All supporting documents attached: transaction records, screening outputs, CDD documents, correspondence\n" +
    "☐ Suspicion basis clearly articulated — narrative avoids tipping-off the subject\n" +
    "☐ Filing deadline assessed — STR must be filed within the regulatory window from suspicion formation\n" +
    "☐ Case open < 30 days; if > 30 days without disposition, senior MLRO escalation documented\n" +
    "☐ Duplicate filing check completed — if amending, original filing reference cited\n" +
    "☐ goAML XML pre-validation completed before formal submission\n" +
    "☐ Four-eyes gate cleared — second qualified MLRO approved the filing\n" +
    "☐ Egress tipping-off gate passed — case narrative cleared for external transmission\n" +
    "☐ Post-filing acknowledgement receipt retained and referenced in the case record\n" +
    "☐ All case documentation retained for 10 years from filing date\n\n" +
    "THRESHOLDS & SLAs: STR cases must not remain open without a disposition for more than 30 days. Cases approaching the regulatory filing deadline (varies by jurisdiction — confirm with MLRO) require immediate escalation. Late filings must be disclosed to the regulator with an explanation.\n\n" +
    "TIPPING-OFF PROHIBITION: No information about the STR filing or the underlying suspicion may be disclosed to the subject or to any unauthorised third party. Tipping-off is a criminal offence.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. (10) of 2025 Art.15 (STR filing obligation), Cabinet Resolution No. (134) of 2025 Art.15 (goAML reporting), Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 20 (suspicious transaction reporting).",

  "sar-qa":
    "SAR QUALITY ASSURANCE — COMPLIANCE REPORT\n\n" +
    "SAR quality assurance review completed. Narrative accuracy, factual consistency with case evidence, regulatory citation validity, goAML XML schema compliance, and AI hallucination gate status reviewed. Four-eyes clearance confirmed before finalisation.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Narrative factually consistent with all documents in the case file — no unsupported assertions\n" +
    "☐ All regulatory citations verified against the approved citation source list — no hallucinated provisions\n" +
    "☐ Hallucination gate passed with zero flagged citations (fire-and-forget gate completed before QA)\n" +
    "☐ goAML XML schema (v5.x) validated — all mandatory fields populated with correct values\n" +
    "☐ Rentity IDs confirmed as live production IDs (not REPLACE_ME placeholders — CG-4 compliance)\n" +
    "☐ Subject identifiers (name, DOB, nationality, account number) verified against source CDD documents\n" +
    "☐ Transaction details (dates, amounts, currencies, account numbers) verified against transaction records\n" +
    "☐ Typology classification reviewed and consistent with FATF typologies guidance\n" +
    "☐ Four-eyes gate cleared by a second qualified MLRO — same officer cannot initiate and QA-approve\n" +
    "☐ AI-generated narrative sections clearly identified; MLRO has reviewed and endorsed each section\n" +
    "☐ No AI-only SAR may be filed — human MLRO written approval is a non-negotiable prerequisite\n\n" +
    "QUALITY STANDARDS: Any SAR narrative containing a hallucinated regulatory citation is immediately rejected and must be rewritten before QA re-commences. Factual errors in subject identifiers or transaction details invalidate the SAR and require correction before submission.\n\n" +
    "ESCALATION TRIGGERS: Repeated hallucination gate failures for a single case require escalation to the AI governance team for model review.\n\n" +
    "REGULATORY BASIS: Cabinet Resolution No. (134) of 2025 Art.15 (goAML reporting standards), Federal Decree-Law No. 10 of 2025 Art.18 (human oversight of AI-generated content), FATF Recommendation 20.",

  cases:
    "CASE MANAGEMENT — COMPLIANCE REPORT\n\n" +
    "Case management review completed for the reporting period. All open cases reviewed for assigned ownership, evidence trail completeness, target resolution dates, and escalation status. Overdue and stalled cases identified and escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All open cases have an assigned MLRO officer with confirmed responsibility\n" +
    "☐ Each open case has a documented evidence trail with dated entries\n" +
    "☐ Target resolution date set for every open case — overdue cases escalated immediately\n" +
    "☐ Cases open > 45 days without material update reviewed by senior MLRO with written justification\n" +
    "☐ Cases requiring SAR determination assessed — no case beyond 30 days without a suspicion decision\n" +
    "☐ Evidence integrity verified — case files have not been modified without an audit trail entry\n" +
    "☐ Closed cases reviewed: closure reason documented, all documents retained for 10 years\n" +
    "☐ Case workload distribution reviewed — no single MLRO overloaded beyond defined capacity\n" +
    "☐ Priority classification (URGENT / HIGH / STANDARD) assigned and queue order correct\n" +
    "☐ Linked cases (same subject, related transactions) cross-referenced\n\n" +
    "RETENTION: All case documentation — including internal notes, evidence, and dispositions — must be retained for a minimum of 10 years from case closure. Retention policy enforced by system; manual deletion is not permitted.\n\n" +
    "ESCALATION TRIGGERS: Any case with no activity for 14 consecutive days, or any case approaching a filing deadline with no action plan, must be immediately escalated to the senior MLRO.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.26-27 (record keeping and retention), Federal Decree-Law No. (10) of 2025 Art.15 (investigation obligations), FATF Recommendation 20 (suspicious activity), FATF Recommendation 11 (record-keeping for 5 years minimum; UAE mandates 10 years).",

  enforcement:
    "ENFORCEMENT ACTION — COMPLIANCE REPORT\n\n" +
    "Regulatory enforcement action compliance report submitted. Regulatory notice received, formally logged, and assessed. Legal counsel engagement, response deadline tracking, board notification, and remediation plan status reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Regulatory notice/correspondence received and formally logged with date of receipt\n" +
    "☐ Response deadline identified and calendar entry with owner assigned immediately on receipt\n" +
    "☐ Legal counsel engaged where the notice concerns potential sanctions, fines, or criminal referral\n" +
    "☐ Board notified within 24 hours of receipt of any enforcement notice\n" +
    "☐ Internal investigation initiated where the notice alleges a compliance failure\n" +
    "☐ Response draughted, reviewed by MLRO and legal counsel, and submitted before deadline\n" +
    "☐ Remediation plan prepared — root cause identified, control gaps addressed, timeline confirmed\n" +
    "☐ Follow-up correspondence from the regulator tracked and responded to within the stated timeframe\n" +
    "☐ Enforcement outcome (fine, remediation direction, no action) formally recorded\n" +
    "☐ All enforcement correspondence and response records retained for 10 years\n\n" +
    "CRITICAL DEADLINES: No enforcement correspondence may be left without a formal response past the stated deadline. Missing a regulatory response deadline constitutes a further compliance breach and must itself be disclosed. The board must be informed of the final outcome within 5 business days of resolution.\n\n" +
    "ESCALATION TRIGGERS: Any enforcement notice alleging criminal conduct, money laundering, or sanctions violations must be escalated to the board and to external legal counsel within 4 hours of receipt.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.26-27 (regulatory cooperation), CR 134/2025 Art.18 (supervisory response obligations), Federal Decree-Law No. (10) of 2025 (regulatory engagement), FATF Recommendation 27 (powers of supervisors).",

  "goaml-submission":
    "goAML STR SUBMISSION — COMPLIANCE REPORT\n\n" +
    "goAML STR/CTR/PMR submission reviewed for schema validity, field completeness, Rentity ID accuracy, and transmission integrity. Submission timestamp recorded and acknowledgement receipt retained with the case record.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ XML payload validated against the goAML 5.x schema — zero validation errors\n" +
    "☐ All mandatory fields populated: reporting entity, subject details, transaction details, suspicion basis\n" +
    "☐ Rentity IDs confirmed as live production values (CBUAE-assigned — not REPLACE_ME placeholders)\n" +
    "☐ Subject personal data (name spelling, DOB format, nationality code) verified against source CDD\n" +
    "☐ Transaction currency codes confirmed as ISO 4217 compliant\n" +
    "☐ Submission timestamp recorded to millisecond precision in the audit trail\n" +
    "☐ Egress tipping-off gate passed before transmission (gate is fail-closed — HELD_REVIEW blocks submission)\n" +
    "☐ Transmission encryption (TLS 1.2 minimum) confirmed\n" +
    "☐ Acknowledgement receipt (ACK) from goAML portal received and retained with case record\n" +
    "☐ Any REJECTED status (goAML error code) corrected and resubmitted within 24 hours\n\n" +
    "SLAs: Rejected submissions must be corrected and resubmitted within 24 hours of rejection receipt. Unacknowledged submissions (no ACK within 48 hours) must be investigated as a potential transmission failure.\n\n" +
    "ESCALATION TRIGGERS: Repeated goAML schema rejections for the same case must be escalated to the compliance technology team. Missing Rentity IDs (CG-4 compliance gap) must be treated as a P1 incident and the MLRO and CTO notified.\n\n" +
    "REGULATORY BASIS: Cabinet Resolution No. (134) of 2025 Art.15 (goAML reporting requirements), CBUAE reporting circular, Federal Decree-Law No. (10) of 2025 Art.15, FATF Recommendation 20.",

  goaml:
    "goAML XML EXPORT — COMPLIANCE REPORT\n\n" +
    "goAML XML export reviewed for schema validity, field completeness, PII transmission minimisation, and transmission security. All STR/CTR/PMR records confirmed as included in the export for the reporting period.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Export schema validated against goAML 5.x — zero schema errors\n" +
    "☐ All STR, CTR, and PMR records for the period included — completeness count verified\n" +
    "☐ All mandatory fields populated with correct values\n" +
    "☐ PII transmission minimised to goAML mandatory fields only — no excess personal data included\n" +
    "☐ Export file encrypted before transmission (TLS in transit; AES-256 at rest during staging)\n" +
    "☐ Recipient system identity verified — goAML portal SSL certificate confirmed valid\n" +
    "☐ Export file integrity hash (SHA-256) computed and retained in audit record\n" +
    "☐ Egress tipping-off gate passed for the export batch\n" +
    "☐ Export audit log entry confirms MLRO authorisation before transmission\n" +
    "☐ Archive copy retained with the case management system for 10 years\n\n" +
    "DATA MINIMISATION: Only fields required by goAML schema may be populated. Additional PII fields available in the system but not required by the schema must not be included. Post-transmission, staging files must be deleted within 24 hours.\n\n" +
    "ESCALATION TRIGGERS: Any transmission failure, export file tampering, or inadvertent inclusion of excess PII requires immediate MLRO notification and a data incident log entry.\n\n" +
    "REGULATORY BASIS: Cabinet Resolution No. (134) of 2025 Art.15 (goAML reporting), Federal Decree-Law No. 10 of 2025 Art.18 (data minimisation and audit), UAE PDPL (data minimisation principle), FATF Recommendation 20.",

  "sar-narrative":
    "AI-GENERATED SAR NARRATIVE — COMPLIANCE REPORT\n\n" +
    "AI-generated SAR narrative submitted for MLRO review. The narrative was produced by the Hawkeye Sterling language model pipeline with PII redaction and rehydration applied. The hallucination gate has been executed as a fire-and-forget check. Human MLRO review and sign-off is mandatory — the AI output is a first draft only.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Hallucination gate executed and all citations verified against the approved regulatory source list\n" +
    "☐ Zero hallucinated citations present — any flagged citation requires narrative rewrite before proceeding\n" +
    "☐ Narrative factually consistent with all case documents, transaction records, and screening outputs\n" +
    "☐ Every factual claim in the narrative can be traced to a specific document in the case file\n" +
    "☐ Subject identifiers reviewed and verified against source CDD documentation\n" +
    "☐ Transaction amounts, dates, and currencies verified against banking records\n" +
    "☐ Typology classification consistent with current FATF typologies guidance\n" +
    "☐ Tipping-off language check: narrative does not disclose the filing or underlying suspicion prematurely\n" +
    "☐ AI-generated sections clearly marked and MLRO endorsement recorded for each section\n" +
    "☐ Human MLRO written sign-off obtained — AI output alone is never sufficient for STR filing\n" +
    "☐ goAML XML wrapper prepared and pre-validated against schema before final submission\n\n" +
    "NON-NEGOTIABLE REQUIREMENT: AI-generated narratives may not be filed without mandatory human MLRO review and written sign-off. This is an absolute requirement under Federal Decree-Law No. 10 of 2025 Art.18 (human oversight of AI-assisted decisions in regulated contexts).\n\n" +
    "ESCALATION TRIGGERS: Multiple hallucination gate failures for a single case require AI governance team escalation and possible model suspension from the SAR pipeline.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight requirement for AI decisions), Cabinet Resolution No. (134) of 2025 Art.15 (STR content requirements), FATF Recommendation 20.",
  // 06 · FFR
  benford:
    "BENFORD'S LAW FINANCIAL FRAUD DETECTION — COMPLIANCE REPORT\n\n" +
    "Benford's Law analysis completed for the submitted transaction dataset. Leading-digit and first-two-digit distributions computed, Z-scores calculated, and flagged clusters reviewed. Analysis methodology and dataset provenance documented for audit admissibility.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Dataset integrity verified — no records removed or modified before analysis\n" +
    "☐ Dataset size sufficient for statistical significance (minimum 1,000 transactions recommended)\n" +
    "☐ Leading-digit distribution deviation scores computed and compared to Benford's expected values\n" +
    "☐ Z-scores calculated for each digit position — significance threshold applied (p < 0.05)\n" +
    "☐ Z-score > 2.5 for any leading-digit position triggers escalation to FFR investigation\n" +
    "☐ Flagged transaction clusters reviewed — structuring, round-number concentration, and splitting patterns examined\n" +
    "☐ Time-series clustering assessed — unusual transaction timing patterns documented\n" +
    "☐ Analysis methodology documented: data source, time period, currency, and transaction types included\n" +
    "☐ Comparison to prior period analysis included — deterioration in digit distribution noted\n" +
    "☐ Findings cross-referenced with transaction monitoring alerts for the same period\n\n" +
    "THRESHOLDS & SLAs: Any Z-score > 2.5 for leading-digit distribution must trigger a formal FFR investigation within 48 hours. Identified transaction clusters consistent with structuring (amounts just below reporting thresholds) must be escalated to MLRO and assessed for STR filing within 24 hours.\n\n" +
    "ESCALATION TRIGGERS: Statistically significant deviation in digit distribution combined with known high-risk typology patterns (round amounts, just-below-threshold clustering, high transaction frequency from single counterparty) constitutes a combined red flag requiring immediate MLRO escalation.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted fraud detection audit trail), FATF Typologies Report on financial fraud and money laundering through trade, FATF Recommendation 20 (reporting of suspicious transactions).",

  // 07 · CDD/KYC
  gleif:
    "GLEIF / LEI VERIFICATION — COMPLIANCE REPORT\n\n" +
    "GLEIF Legal Entity Identifier verification completed for the submitted entity. LEI status, legal entity name, registered address, jurisdiction, and ultimate parent entity reviewed against the GLEIF Global LEI Index.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ LEI format validated (20-character ISO 17442 standard)\n" +
    "☐ LEI status confirmed: ISSUED (valid); LAPSED (must block onboarding until renewed); RETIRED (requires successor investigation)\n" +
    "☐ Legal entity name exact-match verified against the entity's registration documents — phonetic variations noted\n" +
    "☐ Registered jurisdiction and address confirmed and compared to CDD documentation\n" +
    "☐ GLEIF next renewal date reviewed — LEIs expiring within 30 days flagged for follow-up\n" +
    "☐ Ultimate parent entity (Level 2 data) identified and screened against sanctions and adverse media\n" +
    "☐ Direct parent entity identified and reviewed\n" +
    "☐ Any discrepancy between GLEIF data and CDD documentation investigated and documented\n" +
    "☐ LEI verification timestamp recorded — GLEIF data valid for 24 hours before re-fetch required\n" +
    "☐ Verification result logged to audit chain with GLEIF API response hash\n\n" +
    "THRESHOLDS: LAPSED LEIs block onboarding immediately and must not be unblocked until the entity has renewed and the LEI status returns to ISSUED. RETIRED LEIs require investigation into whether a successor entity exists and what happened to the predecessor.\n\n" +
    "ESCALATION TRIGGERS: Entity with a RETIRED LEI and no identified successor, or entity using an LEI belonging to a different legal person, must be treated as a potential identity fraud attempt and escalated to MLRO.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (entity identity verification), FATF Recommendation 10 (CDD — legal entity identification), EU Regulation 648/2012 (EMIR — LEI requirement for derivatives), FSB LEI framework.",

  "entity-graph":
    "ENTITY GRAPH & UBO INTELLIGENCE — COMPLIANCE REPORT\n\n" +
    "Entity graph and UBO intelligence analysis completed. Network connections, beneficial ownership chains, shell company structures, circular ownership patterns, and high-risk jurisdiction exposure reviewed. Graph methodology and data sources documented for audit.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Entity network graph constructed using all available sources: GLEIF, corporate registries, CDD documents, public filings\n" +
    "☐ All first, second, and third-degree connections identified and assessed\n" +
    "☐ Beneficial ownership chain traced to the natural-person UBO at the ≥ 25% threshold\n" +
    "☐ Shell company hop count assessed — > 3 hops triggers mandatory EDD escalation\n" +
    "☐ Circular ownership detected and flagged for legal counsel review\n" +
    "☐ High-risk jurisdiction exposure assessed for each node in the graph\n" +
    "☐ All entities in the graph screened against sanctions lists and adverse media\n" +
    "☐ Graph visualisation reviewed by MLRO — anomalous structures highlighted\n" +
    "☐ Data source citations recorded: each edge in the graph has a documented source\n" +
    "☐ Graph methodology reviewed for completeness — no known data gaps left unaddressed\n\n" +
    "THRESHOLDS & SLAs: Entities with > 3 shell company hops require EDD within 5 business days. Circular ownership requires legal counsel engagement within 48 hours. Entities connected to a sanctioned party at any degree require immediate MLRO escalation.\n\n" +
    "ESCALATION TRIGGERS: Any entity in the graph appearing on a sanctions list, with a confirmed PEP connection, or with more than 3 unresolvable UBO chain layers must be escalated to the MLRO for an EDD determination.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (beneficial ownership), Cabinet Decision No.74/2020 Art.8, Federal Decree-Law No. 10 of 2025 Art.18, UAE Federal Decree-Law No.32/2021 (Companies Act).",

  "domain-intel":
    "DOMAIN INTELLIGENCE — COMPLIANCE REPORT\n\n" +
    "Domain intelligence assessment completed for the submitted entity or counterparty. Domain age, registrar identity, DNS configuration, SSL certificate status, MX records, and threat intelligence feed flags reviewed and assessed against the risk framework.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Domain age verified — newly-registered domains (< 12 months) automatically trigger EDD\n" +
    "☐ Registrar identity confirmed and assessed for high-risk registrar patterns\n" +
    "☐ WHOIS privacy shielding status noted — shielded registrations trigger enhanced investigation\n" +
    "☐ DNS A record and nameserver configuration reviewed for suspicious hosting patterns\n" +
    "☐ MX record configuration reviewed — no-MX domains flagged (potential shell entity indicator)\n" +
    "☐ SSL certificate validity confirmed — expired or self-signed certificates noted as risk indicators\n" +
    "☐ Threat intelligence feed cross-reference completed: domain not flagged in malware, phishing, or C2 databases\n" +
    "☐ Domain not listed in OFAC domain-linked entity designations\n" +
    "☐ Historical WHOIS data reviewed for recent ownership changes\n" +
    "☐ Assessment documented with data-pull timestamps for audit admissibility\n\n" +
    "THRESHOLDS: Domains registered < 12 months old, privacy-shielded registrations, or domains flagged in threat intelligence feeds automatically trigger EDD before any business relationship proceeds. Domains with expired SSL certificates combined with any other risk flag block counterparty approval.\n\n" +
    "ESCALATION TRIGGERS: Any domain flagged in active threat intelligence feeds (malware, phishing, sanctions nexus) blocks counterparty approval immediately and requires MLRO review before the block may be lifted.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (CDD — enhanced due diligence for high-risk indicators), Federal Decree-Law No. 10 of 2025 Art.18 (digital identity verification), FATF Guidance on Virtual Assets and VASPs.",

  "crypto-risk":
    "CRYPTOCURRENCY / VIRTUAL ASSET RISK ASSESSMENT — COMPLIANCE REPORT\n\n" +
    "Crypto risk assessment completed for the submitted blockchain address or VASP counterparty. Blockchain address risk scoring, mixer/tumbler exposure, darknet market association, VASP regulatory status, and transaction cluster analysis reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Blockchain address risk score computed using the configured on-chain analytics provider\n" +
    "☐ Mixer/tumbler exposure percentage reviewed — > 10% exposure constitutes a HIGH-risk indicator\n" +
    "☐ Darknet market association flag reviewed — any confirmed darknet association blocks the transaction\n" +
    "☐ Ransomware-linked address check completed\n" +
    "☐ VASP counterparty regulatory status verified: licensed, registered, or unregistered\n" +
    "☐ VASP Travel Rule compliance assessed — originator/beneficiary information complete\n" +
    "☐ Transaction cluster analysis reviewed for unusual patterns: rapid layering, mixing sequences\n" +
    "☐ FATF Virtual Asset jurisdiction risk applied to the VASP's home jurisdiction\n" +
    "☐ Address not listed on OFAC Virtual Currency addresses list\n" +
    "☐ All HIGH or CRITICAL scored addresses blocked from transaction processing until MLRO review\n" +
    "☐ Assessment documented with blockchain explorer reference links and timestamp\n\n" +
    "THRESHOLDS: Any address scoring HIGH or CRITICAL must be escalated to MLRO before transaction processing. Mixer exposure > 10% is an automatic HIGH indicator. Any unregistered VASP counterparty requires enhanced due diligence and MLRO approval.\n\n" +
    "ESCALATION TRIGGERS: Confirmed darknet market association, confirmed ransomware linkage, or confirmed sanctioned entity connection requires immediate transaction blocking and MLRO + legal counsel notification.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 15 (Virtual Assets and VASPs), UAE Virtual Assets Regulatory Authority (VARA) framework, Federal Decree-Law No. 10 of 2025 Art.18, FATF Travel Rule guidance (Recommendation 16).",

  "vendor-dd":
    "VENDOR DUE DILIGENCE — COMPLIANCE REPORT\n\n" +
    "Vendor due diligence assessment completed. Sanctions screening, adverse media check, AML/CFT contractual compliance, UBO identification, and risk scoring reviewed. MLRO approval requirements assessed based on overall vendor risk score.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Vendor legal entity identity verified via primary source (company registry, GLEIF)\n" +
    "☐ Sanctions screening completed against UN, OFAC, EU, UK lists — no unresolved MATCH_FOUND\n" +
    "☐ Adverse media check completed — no HIGH or CRITICAL findings unresolved\n" +
    "☐ UBO beneficial ownership chain documented to the ≥ 25% threshold\n" +
    "☐ All UBO individuals screened against sanctions and PEP registers\n" +
    "☐ AML/CFT contractual clauses included in the vendor agreement — right-to-audit confirmed\n" +
    "☐ Overall vendor risk score computed and documented (LOW / MEDIUM / HIGH / CRITICAL)\n" +
    "☐ Vendors scoring ≥ 70 (out of 100) require MLRO written approval before engagement\n" +
    "☐ Annual re-screening scheduled and calendar entry confirmed for all active vendors\n" +
    "☐ Vendor geographic risk assessed — vendors operating in FATF grey-list/black-list jurisdictions flagged\n\n" +
    "THRESHOLDS & SLAs: Vendors scoring ≥ 70 require MLRO written approval before any commercial engagement proceeds. HIGH-risk vendor re-screening must occur every 6 months. MEDIUM-risk vendors must be re-screened annually. Vendors whose risk score escalates to HIGH during the contract period must be reviewed within 30 days.\n\n" +
    "ESCALATION TRIGGERS: Any vendor with an unresolved sanctions match, a confirmed PEP beneficial owner, or a risk score change to CRITICAL must be suspended from use pending MLRO review.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (third-party risk management), FATF Recommendation 10 (CDD for business relationships), FATF Recommendation 18 (group-wide AML controls).",

  "client-portal":
    "CLIENT PORTAL — ACTIVITY & COMPLIANCE REVIEW REPORT\n\n" +
    "Client portal activity review completed. Client-submitted documentation reviewed for completeness, pending verification item queue assessed, portal access audit log inspected for anomalous activity, and session security status reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All mandatory CDD documents submitted and reviewed: identity document, proof of address, source of wealth\n" +
    "☐ No mandatory document pending verification for more than 7 days without escalation\n" +
    "☐ Document expiry status reviewed — expired documents block account progression\n" +
    "☐ Portal access audit log reviewed for anomalous patterns: off-hours access, bulk downloads, unusual geolocation\n" +
    "☐ Non-verified users are read-only or blocked — no unverified user has write or submit access\n" +
    "☐ Failed authentication attempts reviewed — brute force patterns investigated\n" +
    "☐ MFA enforcement confirmed for all portal users\n" +
    "☐ Document upload integrity verified — file hashes computed and retained\n" +
    "☐ Client notification audit trail confirmed — all document requests acknowledged by client\n" +
    "☐ Portal session logs retained for 10 years per record-keeping obligations\n\n" +
    "THRESHOLDS & SLAs: Pending verification items older than 7 days must be escalated. Pending items older than 30 days without any client response must trigger a formal account hold. Non-response after 60 days may trigger account termination per onboarding policy.\n\n" +
    "ESCALATION TRIGGERS: Anomalous portal access patterns (bulk document download, access from a new jurisdiction not previously associated with the client, repeated failed MFA) must be referred to the security team and MLRO within 24 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (CDD document management), FATF Recommendation 10 (CDD), SOC2 CC6.1 (access controls), UAE PDPL (data minimisation for client documents).",

  intel:
    "OSINT INTELLIGENCE — COMPLIANCE REPORT\n\n" +
    "Open-source intelligence assessment completed for the submitted subject. Intelligence findings gathered from public records, court databases, regulatory publications, news sources, and social media. Source reliability rated and findings cross-referenced with internal screening and CDD data.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Source reliability rating applied to each finding: tier-1 (verified official source), tier-2 (major media), tier-3 (unverified)\n" +
    "☐ All findings timestamped and source-attributed — full URL, publication date, and access date recorded\n" +
    "☐ OSINT findings cross-referenced with internal adverse media screening results\n" +
    "☐ OSINT findings cross-referenced with internal sanctions screening results\n" +
    "☐ Identity disambiguation confirmed — findings relate to the correct subject (not a namesake)\n" +
    "☐ Conflicting information between sources documented and investigated\n" +
    "☐ Any findings indicative of criminal activity, fraud, or sanctions nexus escalated to MLRO\n" +
    "☐ OSINT report retained as part of the subject's CDD file for 10 years\n" +
    "☐ No OSINT findings rely on unverifiable social media rumour without corroborating source\n" +
    "☐ Assessment reviewed by MLRO and outcome disposition recorded\n\n" +
    "EVIDENCE STANDARDS: OSINT findings used to support an EDD decision, a SAR filing, or a risk reclassification must be from tier-1 or tier-2 sources with full provenance recorded. Tier-3 sources may be noted but must be corroborated before being used as a primary basis for a compliance decision.\n\n" +
    "ESCALATION TRIGGERS: OSINT findings indicating politically-exposed status, involvement in criminal proceedings, or links to designated persons must be immediately escalated to the MLRO regardless of other screening results.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (EDD — open-source public information), Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 12 (PEP identification).",

  osint:
    "OSINT INTELLIGENCE — COMPLIANCE REPORT\n\n" +
    "Open-source intelligence assessment completed for the submitted subject. Intelligence findings gathered from public records, court databases, regulatory publications, news sources, and social media. Source reliability rated and findings cross-referenced with internal screening and CDD data.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Source reliability rating applied to each finding: tier-1 (verified official source), tier-2 (major media), tier-3 (unverified)\n" +
    "☐ All findings timestamped and source-attributed — full URL, publication date, and access date recorded\n" +
    "☐ OSINT findings cross-referenced with internal adverse media screening results\n" +
    "☐ OSINT findings cross-referenced with internal sanctions screening results\n" +
    "☐ Identity disambiguation confirmed — findings relate to the correct subject (not a namesake)\n" +
    "☐ Conflicting information between sources documented and investigated\n" +
    "☐ Any findings indicative of criminal activity, fraud, or sanctions nexus escalated to MLRO\n" +
    "☐ OSINT report retained as part of the subject's CDD file for 10 years\n" +
    "☐ No OSINT findings rely on unverifiable social media rumour without corroborating source\n" +
    "☐ Assessment reviewed by MLRO and outcome disposition recorded\n\n" +
    "EVIDENCE STANDARDS: OSINT findings used to support an EDD decision, a SAR filing, or a risk reclassification must be from tier-1 or tier-2 sources with full provenance recorded. Tier-3 sources may be noted but must be corroborated before being used as a primary basis for a compliance decision.\n\n" +
    "ESCALATION TRIGGERS: OSINT findings indicating politically-exposed status, involvement in criminal proceedings, or links to designated persons must be immediately escalated to the MLRO regardless of other screening results.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (EDD — open-source public information), Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 12 (PEP identification).",

  onboarding:
    "CUSTOMER ONBOARDING — COMPLIANCE REPORT\n\n" +
    "Customer onboarding process report submitted. All mandatory CDD workflow steps reviewed for completeness. Risk classification assessed and confirmed. MLRO approval status verified for HIGH and CRITICAL-risk customers. Account activation eligibility confirmed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Identity verification step completed — government-issued ID validated and unexpired\n" +
    "☐ Proof of address verified (≤ 3 months old for the accepted document type)\n" +
    "☐ Sanctions screening completed at point of onboarding — no unresolved MATCH_FOUND\n" +
    "☐ Adverse media screening completed — no unresolved HIGH or CRITICAL verdict\n" +
    "☐ PEP status check completed\n" +
    "☐ UBO declaration completed for all legal entity customers\n" +
    "☐ Risk classification (LOW / MEDIUM / HIGH / CRITICAL) assigned with documented rationale\n" +
    "☐ HIGH and CRITICAL risk customers: MLRO written approval obtained before account activation\n" +
    "☐ Source of wealth and source of funds documented for HIGH/CRITICAL risk customers\n" +
    "☐ All onboarding documents retained with the customer record for 10 years\n" +
    "☐ Incomplete onboarding records older than 30 days escalated to MLRO\n" +
    "☐ Account activation blocked until all mandatory CDD steps are complete and signed off\n\n" +
    "THRESHOLDS & SLAs: Onboarding records incomplete after 30 days must be reviewed by MLRO. Records incomplete after 60 days without a valid exception must be closed. HIGH and CRITICAL risk customers must have MLRO written approval before any account activation — no exceptions.\n\n" +
    "ESCALATION TRIGGERS: Any customer attempting to proceed without completing mandatory CDD, any customer providing forged or tampered identity documents, or any customer with an unresolved sanctions hit must be blocked and the MLRO notified immediately.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. (10) of 2025 Art.18 (CDD at onboarding), FATF Recommendation 10 (CDD measures), Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted CDD audit trail), Cabinet Decision No.74/2020.",

  "pep-profile":
    "POLITICALLY EXPOSED PERSON (PEP) PROFILE — COMPLIANCE REPORT\n\n" +
    "PEP profile review submitted. PEP status verified via primary source. Source of wealth and source of funds documented. Enhanced due diligence completed. Senior management approval obtained per policy.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ PEP status confirmed via primary source (official government directory, regulatory PEP list, or confirmed media source)\n" +
    "☐ PEP category identified: domestic PEP, foreign PEP, international organisation PEP, or close associate\n" +
    "☐ PEP position and tenure documented with start and end dates\n" +
    "☐ Source of wealth fully documented and independently corroborated where possible\n" +
    "☐ Source of funds for the specific account relationship documented\n" +
    "☐ Enhanced due diligence completed: ownership structure, business activities, geographic exposure\n" +
    "☐ Adverse media check completed — any findings requiring further investigation documented\n" +
    "☐ Senior management written approval obtained before establishing or continuing a PEP relationship\n" +
    "☐ Annual PEP relationship review scheduled — calendar entry confirmed\n" +
    "☐ Ongoing monitoring applied at the ENHANCED level for the duration of the relationship\n" +
    "☐ PEP status change monitoring active — system notifies MLRO if PEP leaves position\n\n" +
    "THRESHOLDS & SLAs: PEP relationships must be reviewed annually at minimum. Any adverse media finding involving a current PEP customer triggers immediate re-assessment within 48 hours. Foreign PEPs generally require higher scrutiny than domestic PEPs — risk classification must reflect this.\n\n" +
    "ESCALATION TRIGGERS: Any PEP customer with unexplained wealth inconsistent with their known official income, or with adverse media allegations of corruption or financial crime, must be immediately escalated to the MLRO and the board for a relationship continuation decision.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 12 (PEP — enhanced due diligence), Federal Decree-Law No. (10) of 2025 Art.18 (PEP obligations), Federal Decree-Law No. 10 of 2025 Art.18, FATF Guidance on PEPs (2013).",

  ownership:
    "OWNERSHIP STRUCTURE — BENEFICIAL OWNERSHIP REVIEW REPORT\n\n" +
    "Ownership structure analysis submitted. Beneficial ownership chain documented. All entities within the chain screened. Complex and layered structures identified and escalated. MLRO review completed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Full ownership structure mapped using corporate registry, GLEIF, CDD documents, and public filings\n" +
    "☐ Beneficial ownership chain traced to the natural-person UBO at the ≥ 25% shareholding or control threshold\n" +
    "☐ All intermediate holding entities identified with jurisdiction, registration number, and ownership percentage\n" +
    "☐ All UBO individuals identified with full name, DOB, nationality, and residential address\n" +
    "☐ All UBO individuals screened against sanctions lists and PEP registers\n" +
    "☐ All UBO individuals subject to adverse media check\n" +
    "☐ Nominee director and nominee shareholder arrangements identified and documented\n" +
    "☐ Circular ownership patterns identified and flagged for legal counsel review\n" +
    "☐ Bearer share instruments identified — must be converted to registered shares or relationship refused\n" +
    "☐ Ownership structure diagram prepared and attached to the CDD file\n" +
    "☐ Ownership structure to be refreshed on any material change and at minimum annually\n\n" +
    "THRESHOLDS: Ownership chains > 4 layers require EDD and legal counsel review. Circular structures that make UBO identification impossible are an automatic relationship-refusal trigger. Bearer shares not converted to registered form within 30 days of notification block account activation.\n\n" +
    "ESCALATION TRIGGERS: Failure to identify UBOs after exhaustive investigation, discovery of bearer shares, or identification of a UBO who is a designated person or subject to a sanctions designation requires immediate MLRO and legal counsel escalation.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (beneficial ownership), Cabinet Decision No.74/2020 Art.8, UAE Federal Decree-Law No.32/2021 (Companies Act — UBO register), Federal Decree-Law No. 10 of 2025 Art.18.",
  // 08 · TM
  "transaction-monitor":
    "TRANSACTION MONITORING — ALERT REVIEW COMPLIANCE REPORT\n\n" +
    "Transaction monitoring alert review submitted. All HIGH and CRITICAL alerts investigated with documented rationale. Typology match evidence recorded and SAR determination made for each alert reaching the suspicion threshold.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All HIGH-risk alerts investigated and dispositioned within 24 hours of generation\n" +
    "☐ All CRITICAL-risk alerts investigated and escalated to MLRO within 4 hours of generation\n" +
    "☐ Unreviewed alerts older than 72 hours escalated to MLRO — breach of internal SLA documented\n" +
    "☐ Typology match evidence recorded for each alert: matching pattern, transaction references, amounts\n" +
    "☐ SAR determination made for each alert above the suspicion threshold — filed or declined with reasoning\n" +
    "☐ False positive dispositions documented with rationale — not a blanket clearance\n" +
    "☐ Alert recurrence monitoring active: same subject triggering repeat alerts reviewed cumulatively\n" +
    "☐ Alert-to-SAR conversion rate reviewed against historical baseline — material decline investigated\n" +
    "☐ Rule parameters reviewed for continued effectiveness — outdated rules flagged for recalibration\n" +
    "☐ All alert dispositions logged to audit chain with MLRO identity and timestamp\n\n" +
    "SLAs: CRITICAL alerts must be reviewed within 4 hours. HIGH alerts within 24 hours. MEDIUM alerts within 72 hours. Any alert exceeding its SLA without a disposition requires MLRO escalation with written justification.\n\n" +
    "ESCALATION TRIGGERS: Alert clusters for the same subject across multiple typologies simultaneously indicate a potential complex money laundering scheme — immediately escalate to MLRO for cumulative review regardless of individual alert severity.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 20 (suspicious transaction reporting), Federal Decree-Law No. (10) of 2025 Art.15, Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted TM audit trail), Cabinet Decision No.74/2020.",

  // 09 · Compliance Ops
  policies:
    "COMPLIANCE POLICY — REVIEW REPORT\n\n" +
    "Compliance policy review submitted. Current policy version, MLRO approval currency, regulatory reflection, staff notification status, and next scheduled review date assessed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Current policy version bears MLRO approval signature and approval date\n" +
    "☐ Policy reflects all applicable Federal Decree-Law No. 10 of 2025 and Federal Decree-Law No. (10) of 2025 provisions\n" +
    "☐ Policy reflects current FATF Recommendations — last FATF update applied\n" +
    "☐ Policy reflects Cabinet Decision No.74/2020 and all applicable subsidiary regulations\n" +
    "☐ All staff notified of the current policy version — acknowledgement receipts retained\n" +
    "☐ Next mandatory review date scheduled (maximum 12-month review cycle)\n" +
    "☐ Policy version control maintained — previous versions archived and accessible for audit\n" +
    "☐ Board-approved policy summary available for regulators on request\n" +
    "☐ Material policy changes approved by the board — not MLRO alone\n" +
    "☐ Policies not reviewed within 12 months are immediately escalated for emergency review\n\n" +
    "REVIEW CYCLE: The AML/CFT policy must be reviewed and re-approved at minimum annually. An extraordinary review must be triggered by any material change in the regulatory framework, a significant business change, or a material compliance failure. Outdated policies create regulatory liability.\n\n" +
    "ESCALATION TRIGGERS: Any policy found to be non-compliant with current regulations (not just lapsed review date) must be immediately suspended from active use and an emergency review convened within 5 business days.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 18 (internal controls and AML/CFT policies), Federal Decree-Law No. (10) of 2025 Art.16 (AML policy obligations), Federal Decree-Law No. 10 of 2025 Art.18, CBUAE Supervisory Guidance.",

  regulatory:
    "REGULATORY OBLIGATION TRACKING — COMPLIANCE REPORT\n\n" +
    "Regulatory obligation tracking report submitted. All open regulatory requirements reviewed for owner assignment, deadline currency, and completion status. Overdue and at-risk obligations escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All open regulatory obligations have an assigned owner — no unowned obligations\n" +
    "☐ All obligations have confirmed regulatory deadlines — no unconfirmed dates\n" +
    "☐ Completion status for each obligation: NOT STARTED / IN PROGRESS / COMPLETE / OVERDUE\n" +
    "☐ Any obligation OVERDUE escalated to the board within 2 business days\n" +
    "☐ Any obligation AT RISK (deadline within 10 business days, < 50% complete) escalated to MLRO\n" +
    "☐ New obligations identified in the period triaged within 5 business days — owner and deadline assigned\n" +
    "☐ Obligation changes (deadline extension, scope change) documented with regulatory source\n" +
    "☐ Completed obligations confirmed closed with evidence of completion retained\n" +
    "☐ Regulatory change feed reviewed — no new obligations from recent regulatory publications missed\n" +
    "☐ Board reporting pack updated with current obligation status summary\n\n" +
    "THRESHOLDS & SLAs: Overdue obligations must be escalated to the board within 2 business days of breach. New obligations must be triaged within 5 business days. Material obligations (those carrying criminal liability or significant fine risk) must be escalated to the board and legal counsel immediately on identification.\n\n" +
    "ESCALATION TRIGGERS: Any obligation with criminal liability if missed (e.g., STR filing deadline, TFS notification window) must be escalated to MLRO and legal counsel on identification with a daily monitoring cadence until resolved.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (governance and regulatory compliance), Federal Decree-Law No. (10) of 2025 (MLRO obligations), FATF Recommendation 18, CBUAE supervisory requirements.",

  playbook:
    "COMPLIANCE PLAYBOOK — REVIEW REPORT\n\n" +
    "Compliance playbook review submitted. Playbook currency, testing status, responsible officer assignments, and integration with current regulatory requirements reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All playbook steps reviewed against applicable regulations — no outdated procedures present\n" +
    "☐ Last tested or table-top simulated date confirmed and within 6-month window\n" +
    "☐ Responsible officers for each playbook step named and confirmed available and trained\n" +
    "☐ Contact details for all responsible officers current (updated within 90 days)\n" +
    "☐ Escalation paths (MLRO, legal, regulator, board) confirmed and tested\n" +
    "☐ Playbook integrated with the incident runbook — no conflicting instructions\n" +
    "☐ Playbook tested with realistic scenarios — not only simple tabletop but stress-test scenarios\n" +
    "☐ Lessons learned from prior activations incorporated into current version\n" +
    "☐ MLRO re-certification obtained after any material update\n" +
    "☐ Playbooks not tested within 6 months suspended from active status pending re-certification\n\n" +
    "TESTING REQUIREMENT: Compliance playbooks must be tested at minimum every 6 months. Testing methods accepted: full simulation, table-top exercise, or documented peer review by a qualified compliance officer. The testing method, date, participants, and any gaps identified must be recorded.\n\n" +
    "ESCALATION TRIGGERS: Any playbook invoked in a live incident where responsible officers were unavailable, contact details were wrong, or escalation paths failed must be immediately reviewed and updated. Gaps found during an incident are priority-one remediation items.\n\n" +
    "REGULATORY BASIS: SOC2 CC7.4 (incident response and recovery procedures), Federal Decree-Law No. 10 of 2025 Art.18 (operational resilience), FATF Recommendation 18 (internal controls), CBUAE Operational Resilience Guidance.",

  "access-control":
    "ACCESS CONTROL AUDIT — COMPLIANCE REPORT\n\n" +
    "Access control audit report submitted. User permission assignments, role changes in the period, privileged access events, dormant accounts, and MFA enforcement status reviewed. Non-compliant access rights identified and suspended.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All user permission assignments reviewed against the least-privilege principle\n" +
    "☐ Role changes in the period reviewed — all changes have documented business justification and MLRO/manager approval\n" +
    "☐ Privileged access events (admin actions, bulk exports, direct DB access) reviewed\n" +
    "☐ Access rights not recertified within 90 days suspended pending review\n" +
    "☐ Dormant accounts (no login > 60 days) deactivated or escalated for deactivation\n" +
    "☐ MFA enforcement confirmed for all active user accounts — no MFA exemptions without CISO written approval\n" +
    "☐ Service account permissions reviewed — no service accounts with human-user-level rights\n" +
    "☐ API key assignments reviewed — no shared keys across users or systems\n" +
    "☐ Terminated employee accounts confirmed disabled within 24 hours of termination\n" +
    "☐ Privileged user list (admins, MLRO-level) reviewed and approved by board annually\n\n" +
    "THRESHOLDS & SLAs: Access recertification must occur at minimum every 90 days. Dormant accounts must be deactivated within 30 days of the 60-day inactivity trigger. Terminated employee access must be revoked within 24 hours of HR notification — immediate revocation for involuntary terminations.\n\n" +
    "ESCALATION TRIGGERS: Any orphaned admin account (no associated active employee), any access rights granted without documented approval, or any privileged access event outside approved hours requires immediate security team and MLRO investigation.\n\n" +
    "REGULATORY BASIS: SOC2 CC6.1 (logical access controls), Federal Decree-Law No. 10 of 2025 Art.18 (access governance), FATF Recommendation 18 (internal controls — segregation of duties).",

  "maker-checker":
    "MAKER-CHECKER WORKFLOW — COMPLIANCE REPORT\n\n" +
    "Maker-checker workflow report submitted. All pending regulated actions reviewed for independent checker assignment. Queue age assessed. Single-person approvals investigated. TOCTOU protection confirmed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All pending items have an assigned independent checker — no unassigned regulated actions\n" +
    "☐ Maker and checker confirmed as different individuals for every action in the period\n" +
    "☐ TOCTOU protection confirmed: record re-read under write lock before approval finalised\n" +
    "☐ No regulated action approved by the same person who initiated it — system-enforced control verified\n" +
    "☐ Queue age within defined SLA: HIGH-priority items ≤ 24 hours; STANDARD items ≤ 5 business days\n" +
    "☐ Overdue items escalated to senior MLRO with written justification\n" +
    "☐ Checker comments documented — not blank approvals without substantive review\n" +
    "☐ Rejection reasons documented and actioned by the maker\n" +
    "☐ All four-eyes actions logged to the append-only audit chain\n" +
    "☐ Checker workload distribution reviewed — no single checker overloaded\n\n" +
    "TOCTOU PROTECTION: The system re-reads every regulated record under write lock immediately before the checker's approval is finalised. This prevents the classic Time-of-Check-Time-of-Use vulnerability where a record is modified between the checker reviewing it and the approval being recorded. Any system issue disabling this lock must be treated as a critical security incident.\n\n" +
    "ESCALATION TRIGGERS: Any single-person approval on a regulated action (CDD sign-off, SAR filing, risk override) is a four-eyes breach. The action must be voided, the incident logged, and the MLRO and security team notified within 4 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight and four-eyes controls), FATF Recommendation 18 (segregation of duties), SOC2 CC6.1 (logical access — segregation).",

  approvals:
    "APPROVAL WORKFLOW — COMPLIANCE REPORT\n\n" +
    "Approval workflow report submitted. All pending approvals reviewed for SLA compliance, escalation trigger status, and audit trail completeness. Approvals processed outside the system identified.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All pending approvals within defined SLA windows: URGENT ≤ 4 hours; HIGH ≤ 24 hours; STANDARD ≤ 5 business days\n" +
    "☐ Escalation rules triggered automatically for any item breaching its SLA — escalation log reviewed\n" +
    "☐ Complete audit trail exists for each approved and rejected action: who, when, outcome, rationale\n" +
    "☐ Approved actions include substantive checker comment — not just a click-through\n" +
    "☐ Rejected actions include reason codes and the action taken in response\n" +
    "☐ No approvals processed outside the system (email, phone, verbal) — any identified are a compliance breach\n" +
    "☐ Escalated items from the prior period resolved and documented\n" +
    "☐ Approval authority limits verified — no approvals exceed the approver's delegated authority level\n" +
    "☐ Board-reserved approvals (new PEP relationships, enforcement responses) approved at board level\n" +
    "☐ All approval events logged to the append-only audit chain\n\n" +
    "NON-COMPLIANT APPROVALS: Any approval processed outside the system (verbal approval, email instruction, or informal sign-off) is a compliance breach with no valid audit trail. It must be logged as an incident, the approval re-processed through the system, and controls reviewed to prevent recurrence.\n\n" +
    "ESCALATION TRIGGERS: URGENT items not approved within 4 hours, any approval where the authority level was exceeded, or any out-of-system approval discovered must be escalated to the MLRO within 2 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight controls), FATF Recommendation 18 (four-eyes and segregation), SOC2 CC6.1 (authorisation controls).",

  profile:
    "USER PROFILE & PERMISSIONS — COMPLIANCE REPORT\n\n" +
    "User profile and permissions review submitted. Role assignments, least-privilege compliance, MFA status, and inactive account management reviewed for the reporting period.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All role assignments reviewed for least-privilege compliance\n" +
    "☐ No user has permissions beyond those required for their current role\n" +
    "☐ MFA enabled for all active user accounts — zero MFA exemptions without written CISO approval\n" +
    "☐ Inactive accounts (no login > 90 days) flagged for deactivation review\n" +
    "☐ Deactivation requests processed within 5 business days of flagging\n" +
    "☐ Any privilege escalation in the period documented with business justification and manager approval\n" +
    "☐ Privilege escalation events reviewed for anomalous patterns (off-hours changes, self-escalation)\n" +
    "☐ Shared accounts identified — sharing prohibited; each user must have individual credentials\n" +
    "☐ Service account profiles reviewed — no human users sharing service account credentials\n" +
    "☐ Password policy compliance confirmed for all accounts not using SSO\n\n" +
    "THRESHOLDS & SLAs: Inactive accounts (> 90 days without login) must be reviewed within 5 business days and either reactivated with justification or deactivated. Privilege escalations must be reviewed and approved within 24 hours of request. Any self-escalation attempt is a security incident.\n\n" +
    "ESCALATION TRIGGERS: Any account with orphaned (no associated active user) admin rights, any shared credentials discovered, or any privilege escalation without documented approval must be treated as a security incident and investigated within 24 hours.\n\n" +
    "REGULATORY BASIS: SOC2 CC6.1 (user access management), Federal Decree-Law No. 10 of 2025 Art.18 (access controls for AI systems), FATF Recommendation 18 (segregation of duties and access controls).",

  cnmr:
    "CASH AND NON-MONETARY REPORT (CNMR) — COMPLIANCE REPORT\n\n" +
    "CNMR filing queue reviewed. All cash transactions at or above the reporting threshold and all non-monetary transfers reviewed for completeness, accuracy, and timely submission to the competent authority.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All cash transactions meeting or exceeding the CBUAE-prescribed threshold included in the filing\n" +
    "☐ Non-monetary transfer details fully documented: asset type, estimated value, counterparty, date\n" +
    "☐ Filing scope covers the complete reporting period — no gaps\n" +
    "☐ Filing submitted to the competent authority before the regulatory deadline\n" +
    "☐ Submission acknowledgement receipt obtained and retained with the filing record\n" +
    "☐ All mandatory fields populated with verified data — no placeholder values\n" +
    "☐ Threshold application methodology consistent with CBUAE guidance — no selective exclusions\n" +
    "☐ Late filings (if any) disclosed to the regulator with an explanation and remediation plan\n" +
    "☐ Filing records retained for 10 years from submission date\n" +
    "☐ MLRO review and sign-off obtained before submission\n\n" +
    "FILING DEADLINE: Late CNMR filings carry regulatory penalties and must be immediately disclosed to the MLRO and reported to the board. A root-cause analysis must be conducted for any late filing, and the findings reported to the board within 5 business days.\n\n" +
    "ESCALATION TRIGGERS: Any failure to identify and report a transaction above the threshold is a regulatory breach. Any discovered unreported transaction from a prior period must be treated as a late filing and disclosed to the regulator immediately.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. (10) of 2025 Art.15 (reporting obligations), CBUAE Cash Transaction Reporting requirements, Federal Decree-Law No. 10 of 2025 Art.18 (audit trail for regulatory filings), Cabinet Decision No.74/2020.",

  dpmsr:
    "DESIGNATED PERSONS MONITORING & SANCTIONS REPORT (DPMSR) — COMPLIANCE REPORT\n\n" +
    "DPMSR filing queue reviewed. All designated person alerts actioned and filed. Submission acknowledgements confirmed. Outstanding filings identified and escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All designated person alerts generated in the period reviewed and actioned\n" +
    "☐ Filing thresholds met for each category of designated person (UN, OFAC, EU, domestic lists)\n" +
    "☐ DPMSR submissions filed within the regulatory time window from identification\n" +
    "☐ Submission acknowledgements from the competent authority received and retained\n" +
    "☐ Rejected DPMSR filings corrected and resubmitted within 24 hours of rejection\n" +
    "☐ Asset freeze instructions issued and documented where applicable\n" +
    "☐ Account restriction actions confirmed and logged\n" +
    "☐ Outstanding DPMSR filings older than the regulatory deadline escalated to the MLRO immediately\n" +
    "☐ Filing records retained for 10 years\n" +
    "☐ MLRO sign-off obtained before each DPMSR submission\n\n" +
    "CRITICAL REQUIREMENT: DPMSR filings for confirmed designated persons (particularly UN Security Council designations) are time-critical. Delays beyond the prescribed regulatory window may constitute a criminal offence. Any backlog in DPMSR filings must be treated as a P1 incident.\n\n" +
    "ESCALATION TRIGGERS: Any unactioned designated person alert older than 24 hours must be immediately escalated to the MLRO. Any confirmed designation where asset freeze has not been initiated must be treated as an emergency compliance incident.\n\n" +
    "REGULATORY BASIS: Cabinet Decision No.74/2020 (TFS obligations), UN Security Council Resolutions (immediate asset freeze requirements), Federal Decree-Law No. (10) of 2025 Art.18 (designated person reporting), CBUAE reporting circulars.",

  "moe-survey":
    "MINISTRY OF ECONOMY AML/CFT SURVEY — COMPLIANCE REPORT\n\n" +
    "Ministry of Economy AML/CFT Survey submission reviewed. All survey sections completed, data validated, MLRO endorsement obtained, and submission confirmed before the regulatory deadline.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All survey sections completed — no blank or placeholder responses\n" +
    "☐ Data in each section validated against internal records: transaction volumes, screening counts, SAR statistics\n" +
    "☐ Response consistency checked across sections — no internal contradictions\n" +
    "☐ Statistical data reviewed for accuracy — counts verified against system reports\n" +
    "☐ MLRO review and written endorsement obtained before submission\n" +
    "☐ Board review of material responses completed\n" +
    "☐ Submission completed before the MoE deadline — confirmation timestamp retained\n" +
    "☐ Submission acknowledgement receipt obtained and retained\n" +
    "☐ Late submission (if applicable) disclosed to the board and a root-cause analysis submitted to MoE\n" +
    "☐ Survey data retained for 10 years as part of regulatory correspondence records\n\n" +
    "DEADLINE COMPLIANCE: Late or incomplete MoE AML/CFT survey submissions carry regulatory penalties and may reflect negatively in the institutional risk assessment conducted by the supervisory authority. Any anticipated late submission must be proactively communicated to MoE before the deadline.\n\n" +
    "ESCALATION TRIGGERS: Any survey response that reveals a material compliance gap or a previously unreported regulatory breach must be immediately disclosed to the MLRO and legal counsel before submission.\n\n" +
    "REGULATORY BASIS: UAE Ministry of Economy AML/CFT supervisory framework, Federal Decree-Law No. (10) of 2025 (regulatory reporting obligations), Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 27 (powers of supervisors).",

  "oecd-ddg":
    "OECD 5-STEP DUE DILIGENCE GUIDANCE — COMPLIANCE REPORT\n\n" +
    "OECD 5-Step Due Diligence Guidance compliance report submitted. All five steps reviewed for completion and documentation quality. Adverse impact assessments reviewed and senior management sign-off confirmed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Step 1 — Establish strong company management systems: internal policies, grievance mechanisms, and traceability systems documented and operational\n" +
    "☐ Step 2 — Identify and assess risks in the supply chain: risk assessment completed for all tier-1 and tier-2 suppliers, red flags documented\n" +
    "☐ Step 3 — Design and implement a strategy to respond to identified risks: risk response strategy approved by senior management, remediation plans active\n" +
    "☐ Step 4 — Carry out independent third-party audit: audit completed by qualified independent auditor, findings documented\n" +
    "☐ Step 5 — Report annually on supply chain due diligence: annual report prepared and published (or submitted to MoE where required)\n" +
    "☐ Adverse impact assessments documented for all identified risk areas\n" +
    "☐ Senior management review of OECD DDG compliance obtained\n" +
    "☐ OECD DDG compliance report retained for 10 years\n" +
    "☐ Next annual review date scheduled\n\n" +
    "ANNUAL REPORTING: The OECD 5-Step DDG requires annual public reporting on supply chain due diligence. Failure to report, or reporting that misrepresents compliance status, creates reputational and regulatory risk. The annual report must be reviewed by legal counsel before publication.\n\n" +
    "ESCALATION TRIGGERS: Any identified supply chain risk flagged as SEVERE (conflict minerals, child labour, forced labour, or direct financing of armed groups) must be immediately escalated to the MLRO, legal counsel, and the board regardless of the overall assessment stage.\n\n" +
    "REGULATORY BASIS: OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas, UAE Ministerial Decision No.68/2024 (responsible sourcing requirements), Federal Decree-Law No. 10 of 2025 Art.18.",

  "responsible-sourcing":
    "RESPONSIBLE SOURCING — COMPLIANCE REPORT\n\n" +
    "Responsible sourcing compliance report submitted. Mineral and commodity origin verified through chain-of-custody documentation. Conflict-zone exposure assessed. Supplier attestations reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Mineral and commodity origin documented through certified chain-of-custody records\n" +
    "☐ Chain-of-custody certification current and from an ICGLR-recognised or equivalent body\n" +
    "☐ Conflict-zone exposure assessed against OECD Annex II red flags\n" +
    "☐ Smelter/refiner list reviewed against RMAP or equivalent programme validated smelters\n" +
    "☐ Supplier attestations current (not expired) and signed by an authorised representative\n" +
    "☐ Any conflict-mineral exposure documented with the specific mineral, source country, and risk level\n" +
    "☐ Unresolved conflict-zone exposure: supply chain suspended pending MLRO and legal review\n" +
    "☐ Remediation actions for identified risks documented with target dates and owners\n" +
    "☐ Country of origin verified against FATF and OECD high-risk country assessments\n" +
    "☐ Third-party audit findings reviewed and integrated into risk assessment\n\n" +
    "THRESHOLD: Any supply chain with unresolved conflict-zone exposure must be suspended from procurement immediately pending MLRO and legal review. No payment to a suspended supplier may be authorised until the review is complete and the risk disposition documented.\n\n" +
    "ESCALATION TRIGGERS: Any supply chain found to directly finance armed groups, involve child or forced labour, or violate applicable export control laws requires immediate suspension, MLRO notification, and legal counsel engagement.\n\n" +
    "REGULATORY BASIS: UAE Ministerial Decision No.68/2024 (responsible sourcing), OECD 5-Step Due Diligence Guidance, Dodd-Frank Act Section 1502 (for applicable entities), Federal Decree-Law No. 10 of 2025 Art.18.",

  "tfs-alerts":
    "TARGETED FINANCIAL SANCTIONS (TFS) ALERT REVIEW — COMPLIANCE REPORT\n\n" +
    "Targeted Financial Sanctions alert queue reviewed. All TFS alerts screened and actioned. Asset freeze instructions assessed and issued where applicable. Regulatory filing status confirmed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All TFS alerts reviewed and actioned within 24 hours of generation — no overdue alerts\n" +
    "☐ Every MATCH_FOUND alert individually investigated — no bulk clearance\n" +
    "☐ Confidence threshold applied: scores ≥ 85% treated as confirmed designation pending MLRO review\n" +
    "☐ Confirmed TFS matches: asset freeze instructions issued immediately and documented\n" +
    "☐ Confirmed TFS matches: account/relationship restriction applied pending regulatory guidance\n" +
    "☐ DPMSR filing initiated for all confirmed TFS matches within the regulatory time window\n" +
    "☐ Notification to the MLRO completed within 1 hour of confirmation\n" +
    "☐ Notification to the competent authority (CBUAE) completed within the required timeframe\n" +
    "☐ False positives cleared with documented rationale — not a blanket clearance\n" +
    "☐ All TFS alert dispositions logged to the append-only audit chain\n" +
    "☐ Board notified of all confirmed TFS matches within 24 hours\n\n" +
    "CRIMINAL LIABILITY: Failure to act on a confirmed TFS match (designated person, sanctioned entity) within the prescribed timeframe is a criminal offence in the UAE and may carry personal liability for the MLRO. There is no de minimis threshold — all confirmed matches must be actioned.\n\n" +
    "ESCALATION TRIGGERS: Any unactioned TFS alert older than 24 hours, any confirmed designation where asset freeze has not been initiated, or any suspected tipping-off of the designated person must be treated as a P1 incident requiring immediate escalation.\n\n" +
    "REGULATORY BASIS: Cabinet Decision No.74/2020 (TFS immediate obligations), UN Security Council Resolutions (binding — no exceptions), Federal Decree-Law No. (10) of 2025 Art.18, FATF Recommendation 6 (targeted financial sanctions implementation).",

  "typology-library":
    "TYPOLOGY LIBRARY — REVIEW REPORT\n\n" +
    "Typology library review submitted. All active typology modes reviewed for regulatory currency, performance metrics, drift assessment, and recalibration status. Suspended or overdue modes identified and escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All active typology modes reviewed against latest FATF, MENAFATF, and internal typologies updates\n" +
    "☐ Each mode's last update date confirmed within the 12-month review window\n" +
    "☐ Performance metrics reviewed: precision, recall, false-positive rate, and alert-to-SAR conversion per mode\n" +
    "☐ Drift assessment completed: mode performance compared to baseline at the time of last calibration\n" +
    "☐ Low-performing modes (recall < 70% or FP rate > 10%) flagged for recalibration\n" +
    "☐ Modes not reviewed within 12 months suspended from production scoring immediately\n" +
    "☐ Recalibration plan in place for all flagged modes — owner and target date assigned\n" +
    "☐ New typology patterns from recent FATF Mutual Evaluation and MENAFATF guidance incorporated\n" +
    "☐ Jurisdiction-specific typologies (UAE real estate, trade finance, virtual assets) current\n" +
    "☐ Typology library version control maintained — previous versions archived\n\n" +
    "REVIEW CYCLE: Typologies must be reviewed and re-validated at minimum annually. A triggered review is required following any FATF Mutual Evaluation finding, any MENAFATF guidance update, or any material change in the institution's risk profile or product mix.\n\n" +
    "ESCALATION TRIGGERS: Any typology mode that has generated zero alerts for 90 consecutive days must be reviewed for calibration failure. A production typology returning anomalous results (e.g., sudden 10x alert spike) must be suspended and investigated immediately.\n\n" +
    "REGULATORY BASIS: FATF Typologies Reports, MENAFATF Typologies, Federal Decree-Law No. 10 of 2025 Art.18 (AI model performance monitoring), FATF Recommendation 20 (suspicious transaction detection), NIST AI RMF MEASURE-2.7.",
  // 10 · Shipments
  shipments:
    "SHIPMENT COMPLIANCE — REVIEW REPORT\n\n" +
    "Shipment compliance report submitted. Cargo manifest reviewed for dual-use and controlled goods. Sanctioned port and vessel screening completed. EOCN export classification verified. Bill of lading cross-checked against declared counterparty.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Cargo manifest reviewed for dual-use goods — EOCN/HS codes cross-referenced against control lists\n" +
    "☐ Controlled goods export licence confirmed valid and on file for each restricted commodity\n" +
    "☐ Destination country verified against UAE export control prohibition list and OFAC embargo list\n" +
    "☐ Sanctioned port check completed for all ports of call in the routing\n" +
    "☐ Vessel AIS transponder status reviewed — no dark vessel periods > 6 hours in open water\n" +
    "☐ Vessel flag state sanctions exposure assessed\n" +
    "☐ Vessel ownership chain reviewed for sanctions exposure\n" +
    "☐ Bill of lading counterparty (shipper, consignee, notify party) screened against sanctions lists\n" +
    "☐ Declared end-user certificate verified and not expired\n" +
    "☐ Shipments with unresolved sanctions or export control flags held pending MLRO clearance\n" +
    "☐ All shipping documentation retained for 10 years\n\n" +
    "HOLD REQUIREMENT: Any shipment with unresolved sanctions, export control, or dark-vessel flags must be placed on hold immediately. No goods may be released, no payment made, and no freight forwarding instruction issued until MLRO clearance is documented.\n\n" +
    "ESCALATION TRIGGERS: Confirmed sanctioned vessel, confirmed sanctioned counterparty, goods destined for a UN-embargoed jurisdiction, or evidence of cargo misdeclaration requires immediate MLRO escalation and potential law enforcement notification.\n\n" +
    "REGULATORY BASIS: UAE Federal Export Control Law, Federal Decree-Law No. 10 of 2025 Art.18 (trade compliance), FATF Recommendation 6 (trade-based money laundering), OFAC vessel guidance, UN Security Council embargo resolutions.",

  // 11 · Employees
  employees:
    "EMPLOYEE COMPLIANCE — REVIEW REPORT\n\n" +
    "Employee compliance report submitted. AML/CFT training completion rates, background screening status, declarations of interest, and regulated staff obligation compliance reviewed for the reporting period.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ AML/CFT training completion rate ≥ 95% across all departments — shortfalls documented\n" +
    "☐ Employees overdue for training suspended from regulated activities pending completion\n" +
    "☐ Background screening completed for all new hires before commencement in a regulated role\n" +
    "☐ Annual re-screening completed for all staff in regulated roles\n" +
    "☐ Background screening covers: criminal record check, sanctions check, adverse media, employment history\n" +
    "☐ Declarations of interest filed by all regulated staff — outstanding declarations flagged\n" +
    "☐ Conflict of interest disclosures reviewed by MLRO — material conflicts assessed\n" +
    "☐ Staff role changes reviewed — any staff moving to a regulated role screened immediately\n" +
    "☐ Whistleblowing channel confirmed operational and communicated to all staff\n" +
    "☐ Training records retained for 10 years from the date of each training completion\n\n" +
    "THRESHOLDS & SLAs: Training completion rate below 95% triggers a remediation plan within 5 business days. Staff in a regulated role without current training must be immediately suspended from regulated activities until training is completed. Background screening must be completed before any new hire commences in a regulated role — no exceptions.\n\n" +
    "ESCALATION TRIGGERS: Any employee found to have a criminal conviction for financial crime, fraud, or money laundering discovered during background screening must be immediately suspended pending HR and MLRO review. Any employee who refuses to file a declaration of interest must be reported to the MLRO.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (staff competency for AI-assisted compliance), Federal Decree-Law No. (10) of 2025 Art.17 (staff AML/CFT training obligations), FATF Recommendation 18 (AML/CFT internal controls — staff training).",

  // 12 · Training
  training:
    "AML/CFT TRAINING — COMPLETION REPORT\n\n" +
    "AML/CFT training completion report submitted. Pass rates, outstanding completions by department, current training content version, and MLRO certification of training content currency reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Overall pass rate reviewed — department-level breakdown provided\n" +
    "☐ Pass rate ≥ 80% per department; departments below threshold investigated\n" +
    "☐ Outstanding completions listed by name, department, and days overdue\n" +
    "☐ Staff overdue > 30 days suspended from regulated activities\n" +
    "☐ Employees who fail assessment twice require supervisor-led refresher — MLRO notified\n" +
    "☐ Employees who fail assessment three times flagged for fitness-for-role review\n" +
    "☐ Current training content version reviewed against latest FATF and regulatory updates\n" +
    "☐ Training content approved by MLRO — last approval date within 12 months\n" +
    "☐ New regulatory developments from the period incorporated into training content\n" +
    "☐ Training records retained for 10 years per AML training record-keeping obligations\n" +
    "☐ Third-party training providers (if used) confirmed as qualified and contracted\n\n" +
    "QUALITY STANDARD: Training content must be reviewed and re-approved by the MLRO at minimum annually and on any significant regulatory update. Training that does not reflect current regulatory requirements creates a compliance risk and may be grounds for regulatory criticism during an examination.\n\n" +
    "ESCALATION TRIGGERS: A department with a pass rate < 60% constitutes a systemic training failure requiring immediate MLRO notification and an emergency refresher programme. Any employee in a client-facing regulated role failing training must be removed from regulated activities until remediation is completed.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. (10) of 2025 Art.17 (AML/CFT training obligations), Federal Decree-Law No. 10 of 2025 Art.18 (competency requirements for AI-assisted compliance), FATF Recommendation 18 (staff training and awareness).",
  // 13 · Governance
  ewra:
    "ENTERPRISE-WIDE RISK ASSESSMENT (EWRA) — COMPLIANCE REPORT\n\n" +
    "EWRA report submitted. Risk category scores, inherent vs. residual risk gaps, control effectiveness ratings, and all open action items reviewed by the board.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All risk categories assessed: customer risk, product/service risk, geographic risk, channel risk, legal/regulatory risk\n" +
    "☐ Inherent risk scores documented per category with supporting rationale\n" +
    "☐ Control effectiveness ratings assessed: EFFECTIVE / PARTIAL / INEFFECTIVE per control\n" +
    "☐ Residual risk scores computed: inherent risk adjusted for control effectiveness\n" +
    "☐ Risk appetite statement reviewed and confirmed current\n" +
    "☐ All open action items from the prior EWRA have assigned owners, target dates, and progress status\n" +
    "☐ New action items generated from this EWRA cycle: owner assigned, deadline confirmed\n" +
    "☐ EWRA reviewed by the board at minimum annually — extraordinary review triggered by material business change\n" +
    "☐ Material changes since last EWRA (new products, new geographies, new customer segments) incorporated\n" +
    "☐ EWRA conclusions shared with all business lines — sign-off obtained from each line's compliance lead\n" +
    "☐ EWRA document version-controlled and retained for 10 years\n\n" +
    "REVIEW TRIGGERS: An extraordinary EWRA must be initiated within 30 days of: a new product launch, entry into a new geographic market, a material change in customer risk profile, a regulatory enforcement action, or a material compliance failure.\n\n" +
    "ESCALATION TRIGGERS: Any risk category assessed as CRITICAL with an INEFFECTIVE control must be escalated to the board within 5 business days with an emergency remediation plan.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 1 (risk-based approach — national and institutional risk assessments), Federal Decree-Law No. 10 of 2025 Art.18 (AI risk governance), Federal Decree-Law No. (10) of 2025 Art.16 (institutional risk assessment obligations), FATF Guidance on Risk-Based Approach.",

  "responsible-ai":
    "RESPONSIBLE AI GOVERNANCE — COMPLIANCE REPORT\n\n" +
    "Responsible AI governance report submitted. Model registry attestations, bias ratio, drift monitor status, and human oversight documentation reviewed for all AI-assisted decisions in the period.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All models in the MODEL_REGISTRY reviewed: attestation status CURRENT (not OVERDUE)\n" +
    "☐ No OVERDUE model attestations in production — OVERDUE models must be suspended immediately\n" +
    "☐ Bias ratio reviewed against approved threshold: ≤ 1.15 (internal policy — tighter than FATF floor of 1.5; see CG-BIAS-001)\n" +
    "☐ Bias ratio breach (> 1.15): immediate suspension of affected model and MLRO notification\n" +
    "☐ Drift monitor status reviewed — no modes in DRIFTED state without an active recalibration plan\n" +
    "☐ Human oversight documentation complete for all AI-assisted decisions in the period\n" +
    "☐ AI model risk tiers reviewed: HIGH-risk models require enhanced oversight documentation\n" +
    "☐ Model approval chain verified: all production models have riskTier, approval, and cardRef populated\n" +
    "☐ Prompt hash manifest validated — all SYSTEM_PROMPT constants appear in the manifest (Art.18 AI audit)\n" +
    "☐ Hallucination gate fire-and-forget pattern confirmed — not blocking the response path\n" +
    "☐ AI governance policy reviewed and current — last MLRO approval within 12 months\n\n" +
    "NON-NEGOTIABLE THRESHOLD: Bias ratio > 1.15 (per CG-BIAS-001 deliberate deviation — tighter than FATF floor 1.5) requires the affected model to be immediately suspended from production and the MLRO notified. MLRO acknowledgement of the threshold deviation is required annually.\n\n" +
    "ESCALATION TRIGGERS: Any OVERDUE attestation in a production model, any bias ratio breach, or any prompt hash manifest mismatch (indicating an unapproved system prompt in production) must be treated as a P1 AI governance incident.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI governance, audit trail, human oversight), NIST AI RMF (GOVERN-1, MAP-1, MEASURE-2, MANAGE-1), FATF Recommendation 1 (non-discrimination in risk assessment).",

  "eval-kpi":
    "AI EVALUATION KPI — COMPLIANCE REPORT\n\n" +
    "AI evaluation KPI report submitted. F1 score, precision, recall, false-positive rate, false-negative rate, and fairness metrics reviewed for all active models in the reporting period. Models below threshold identified and escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ F1 score reviewed per model — minimum acceptable threshold confirmed by MLRO\n" +
    "☐ Precision reviewed: high precision reduces FP burden on MLRO (target ≥ 80%)\n" +
    "☐ Recall reviewed: high recall is critical for compliance (target ≥ 90% — missing a true positive is a compliance risk)\n" +
    "☐ False-positive rate reviewed against approved threshold (≤ 3% per policy)\n" +
    "☐ False-negative rate reviewed — any increase must be immediately escalated (missed sanctions hits)\n" +
    "☐ Fairness metrics reviewed per demographic group: no significant disparity in FP or FN rates\n" +
    "☐ Bias ratio confirmed ≤ 1.15 for all models in production (CG-BIAS-001)\n" +
    "☐ KPI trend analysis: period-over-period performance reviewed for deterioration\n" +
    "☐ Any KPI breach: affected model suspended from production scoring pending re-evaluation\n" +
    "☐ Re-evaluation and MLRO sign-off completed before model is reinstated to production\n\n" +
    "CRITICAL KPI: The false-negative rate (missed true positives — screening misses) is the highest-risk metric from a compliance perspective. Any increase in the false-negative rate, even within an otherwise acceptable F1 range, must be investigated as a potential compliance risk.\n\n" +
    "ESCALATION TRIGGERS: Any model whose recall drops below 85%, FP rate exceeds 5%, or bias ratio exceeds 1.15 must be suspended from production and the MLRO notified within 4 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI performance monitoring), NIST AI RMF MEASURE-2.7 (AI system performance metrics), FATF Recommendation 1 (non-discriminatory and effective risk-based approach).",

  "analytics-dashboard":
    "ANALYTICS DASHBOARD — COMPLIANCE REPORT\n\n" +
    "Analytics dashboard compliance report submitted. MLRO digest metrics, risk forecast trends, anomaly alerts, and AI performance KPIs reviewed. Dashboard reviewed by MLRO at minimum weekly.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ MLRO daily digest reviewed: FP rate, bias ratio, case volume, escalation rate — all within approved ranges\n" +
    "☐ Risk forecast trends reviewed: no material deterioration in the 30-day forward risk estimate\n" +
    "☐ All anomaly alerts reviewed and dispositioned — no outstanding anomalies older than 48 hours\n" +
    "☐ KPI metrics outside the approved operating range: documented response within 48 hours\n" +
    "☐ Dashboard reviewed by MLRO at minimum weekly — monthly board pack updated\n" +
    "☐ FP rate confirmed ≤ 3%; breach requires root-cause analysis\n" +
    "☐ Bias ratio confirmed ≤ 1.15 (CG-BIAS-001)\n" +
    "☐ Escalation rate trend reviewed — sustained increase investigated\n" +
    "☐ Model drift indicators reviewed — drifted modes flagged for recalibration\n" +
    "☐ Dashboard data sourced exclusively from validated, audit-trailed systems — no manual overrides\n\n" +
    "THRESHOLDS: Any metric outside the approved operating range requires a documented response within 48 hours. Metrics outside the range for more than 3 consecutive review days require escalation to the board with a remediation plan.\n\n" +
    "ESCALATION TRIGGERS: Simultaneous breach of multiple KPIs (e.g., FP rate AND bias ratio breach on the same day) indicates a potential systemic model issue and must be treated as a P1 AI governance incident.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI performance monitoring and audit trail), NIST AI RMF MEASURE-2.7, FATF Recommendation 1 (ongoing risk-based monitoring).",

  "kri-dashboard":
    "KEY RISK INDICATOR (KRI) DASHBOARD — COMPLIANCE REPORT\n\n" +
    "KRI dashboard report submitted. All RED-status KRIs reviewed with action plans, owners, and resolution deadlines. KRI thresholds validated. Board reporting pack updated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All KRIs reviewed against approved thresholds — GREEN / AMBER / RED status current\n" +
    "☐ All RED-status KRIs have documented action plans with assigned owners and resolution deadlines\n" +
    "☐ KRI in breach > 5 business days without resolution: board escalation completed\n" +
    "☐ AMBER-status KRIs monitored daily until resolved\n" +
    "☐ KRI thresholds reviewed and approved by MLRO — last approval within 12 months\n" +
    "☐ Board reporting pack updated with current KRI status and trend narrative\n" +
    "☐ KRI trend analysis: deteriorating trends identified and investigated proactively\n" +
    "☐ New KRIs identified since last review: owner assigned, threshold set, MLRO-approved\n" +
    "☐ KRI bands (open-ended ranges) display ∞ not null — verify data serialisation is correct\n" +
    "☐ All KRI data sourced from validated, audit-trailed systems\n\n" +
    "THRESHOLDS & SLAs: Any KRI breaching RED threshold must be escalated to the board within 5 business days. KRIs in breach for more than 10 business days without a documented remediation plan require mandatory CEO and board notification. AMBER KRIs not resolved within 20 business days escalate to RED.\n\n" +
    "ESCALATION TRIGGERS: Simultaneous RED breaches across 3 or more KRIs indicate a systemic compliance stress event and must be escalated to the board and the MLRO as a priority risk assessment.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 1 (risk-based approach and ongoing risk monitoring), Federal Decree-Law No. 10 of 2025 Art.18 (risk governance), Federal Decree-Law No. (10) of 2025 (enterprise risk management obligations).",

  "incident-runbook":
    "INCIDENT RESPONSE RUNBOOK — REVIEW REPORT\n\n" +
    "Incident response runbook review submitted. Runbook currency, testing status, responsible officer contacts, and escalation paths reviewed and certified by the MLRO.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Runbook last tested or table-top exercised within 6 months\n" +
    "☐ Testing method documented: full simulation / table-top / peer review — date and participants recorded\n" +
    "☐ All responsible officers named with current contact details (phone and email verified within 90 days)\n" +
    "☐ On-call MLRO rotation confirmed operational and tested\n" +
    "☐ Escalation path to the board confirmed: maximum notification window documented per incident type\n" +
    "☐ Escalation path to legal counsel confirmed\n" +
    "☐ Escalation path to the regulator (CBUAE, MoE) confirmed per applicable notification obligation\n" +
    "☐ Incident classification matrix current: P1/P2/P3 definitions clear and unambiguous\n" +
    "☐ Runbook covers: sanctions breach, data breach, goAML system failure, audit chain integrity failure, AI model failure\n" +
    "☐ Lessons learned from prior activations incorporated into the current version\n" +
    "☐ Runbooks not tested within 6 months suspended from active status pending re-certification\n\n" +
    "TESTING REQUIREMENT: The incident runbook must be tested every 6 months. Results of each test, including identified gaps and remediation actions, must be documented and reviewed by the MLRO. A runbook that has never been tested is not a runbook — it is a document.\n\n" +
    "ESCALATION TRIGGERS: Any incident runbook invocation where responsible officers were unreachable, escalation paths failed, or regulator notification deadlines were missed must be reviewed and remediated within 5 business days.\n\n" +
    "REGULATORY BASIS: SOC2 CC7.4 (incident response and recovery), Federal Decree-Law No. 10 of 2025 Art.18 (operational resilience), FATF Recommendation 18 (internal controls — incident response), CBUAE Operational Resilience Guidance.",

  "reg-change":
    "REGULATORY CHANGE MANAGEMENT — COMPLIANCE REPORT\n\n" +
    "Regulatory change management report submitted. All new regulatory obligations in the period triaged, impact-assessed, and implementation owners assigned. At-risk and overdue changes escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All new regulatory publications (FDL amendments, Cabinet Decisions, CBUAE circulars, FATF updates) identified and logged\n" +
    "☐ Each new obligation triaged within 5 business days — impact assessment initiated\n" +
    "☐ Impact assessment completed: which systems, processes, and policies are affected\n" +
    "☐ Implementation owner assigned with target date for each obligation\n" +
    "☐ Any new obligation unassigned for more than 14 days escalated to the MLRO\n" +
    "☐ Material changes affecting core compliance processes approved by the board\n" +
    "☐ Criminal liability obligations (STR filing windows, TFS notification windows) tracked with daily monitoring\n" +
    "☐ Implementation status reviewed: NOT STARTED / IN PROGRESS / COMPLETE\n" +
    "☐ Regulatory change log maintained with source citation, effective date, and implementation status\n" +
    "☐ Staff communications issued for changes affecting day-to-day compliance activities\n\n" +
    "THRESHOLDS & SLAs: All new obligations must be triaged within 5 business days. Obligations carrying criminal liability must be escalated to MLRO and legal counsel immediately on identification — zero triage delay. Implementation plans must be board-approved for material changes within 15 business days of identification.\n\n" +
    "ESCALATION TRIGGERS: Any regulatory change that creates a compliance gap in a currently active process (e.g., new screening requirement, shorter STR window) must be immediately escalated as a priority remediation item.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (regulatory compliance governance), Federal Decree-Law No. (10) of 2025 (ongoing compliance obligations), FATF Recommendation 18 (regulatory compliance function), CBUAE supervisory expectations.",
  // 14 · Routines
  "ongoing-monitor":
    "ONGOING MONITORING — COMPLIANCE REPORT\n\n" +
    "Ongoing monitoring report submitted. Periodic re-screening completed for all active customers within their scheduled cadence. Risk reclassifications reviewed by MLRO. EDD triggered for elevated-risk customers.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ HIGH-risk customers re-screened within quarterly cadence — no overdue re-screens\n" +
    "☐ MEDIUM-risk customers re-screened within bi-annual cadence\n" +
    "☐ LOW-risk customers re-screened within annual cadence\n" +
    "☐ All re-screenings cover sanctions, PEP, and adverse media in the same pass\n" +
    "☐ Risk reclassifications triggered by monitoring results reviewed and approved by MLRO\n" +
    "☐ EDD triggered for any customer whose risk profile has materially elevated\n" +
    "☐ Customers downgraded from HIGH to MEDIUM or MEDIUM to LOW: MLRO written approval obtained\n" +
    "☐ Transaction pattern monitoring active for all customer tiers — unusual patterns flagged\n" +
    "☐ Customer lifecycle events (name change, address change, new beneficial owner) trigger re-screen\n" +
    "☐ Ongoing monitoring records retained for 10 years per record-keeping obligations\n\n" +
    "THRESHOLDS & SLAs: HIGH-risk customers overdue for quarterly re-screening by more than 14 days must be suspended from new transactions pending completion. Any customer whose re-screening produces a new MATCH_FOUND must be treated as a new sanctions alert with immediate MLRO escalation.\n\n" +
    "ESCALATION TRIGGERS: Any customer identified through ongoing monitoring as a designated person or as having materially elevated risk must be immediately escalated to the MLRO. A customer downgrading their own risk profile through document changes without corresponding substance (e.g., new incorporation in a lower-risk jurisdiction) must be investigated for evasion.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 10 (ongoing monitoring as a core CDD obligation), Federal Decree-Law No. (10) of 2025 Art.18 (periodic CDD refresh), Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted monitoring audit trail).",

  // 15 · MLRO Workbench
  "mlro-advisor":
    "MLRO ADVISOR — AI-ASSISTED GUIDANCE REPORT\n\n" +
    "MLRO Advisor AI session report submitted. AI-generated regulatory guidance reviewed by a qualified MLRO. All regulatory citations validated against the approved source list. MLRO acknowledgement and any overriding assessment recorded.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ AI-generated regulatory guidance reviewed by a qualified, named MLRO officer\n" +
    "☐ All regulatory citations in the AI output validated against the approved citation source list\n" +
    "☐ Zero hallucinated citations present — any flagged citation requires the guidance to be revised\n" +
    "☐ Hallucination gate executed (fire-and-forget) before guidance was presented to the MLRO\n" +
    "☐ MLRO's acknowledgement and any overriding assessment recorded with name and timestamp\n" +
    "☐ AI-generated guidance not relied upon without human MLRO review — non-negotiable requirement\n" +
    "☐ Any MLRO override of AI guidance documented with the reason for disagreement\n" +
    "☐ Guidance session output retained in the audit trail for 10 years\n" +
    "☐ Subject matter of guidance documented (jurisdiction, regulatory topic, decision context)\n" +
    "☐ If guidance was relied upon for a compliance decision, that decision is separately documented\n\n" +
    "NON-NEGOTIABLE REQUIREMENT: AI-generated regulatory guidance may never be relied upon for a compliance decision without mandatory human MLRO review and written sign-off. This is an absolute requirement under Federal Decree-Law No. 10 of 2025 Art.18 (human oversight of AI-assisted decisions in regulated contexts). The MLRO must apply professional judgment — not merely ratify AI output.\n\n" +
    "ESCALATION TRIGGERS: Repeated hallucination gate failures in the MLRO Advisor module require escalation to the AI governance team for model review. Any guidance that leads to an incorrect compliance decision must be investigated as a near-miss incident.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (human oversight requirement for AI decisions in regulated contexts), Federal Decree-Law No. (10) of 2025 Art.17 (MLRO responsibilities and expertise requirements).",

  investigation:
    "COMPLIANCE INVESTIGATION — REPORT\n\n" +
    "Investigation report submitted. All evidence collected and documented. Applicable typology pattern identified. Internal suspicion report filed. SAR determination made by the MLRO.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All relevant evidence collected: transaction records, CDD documents, screening results, communications\n" +
    "☐ Evidence chain documented with source, date, and how obtained\n" +
    "☐ Evidence integrity verified — no gaps or unexplained modifications in the evidence trail\n" +
    "☐ Applicable typology pattern identified and referenced (FATF, MENAFATF, or internal typology)\n" +
    "☐ Internal suspicion report filed — documenting the basis for suspicion\n" +
    "☐ SAR determination made by the MLRO: FILE / DECLINE WITH RATIONALE / FURTHER INVESTIGATE\n" +
    "☐ If SAR filed: goAML XML prepared, pre-validated, and submitted within the regulatory window\n" +
    "☐ If SAR declined: written rationale recorded and retained with the case file\n" +
    "☐ Investigations open > 60 days without material progress: senior MLRO review and written justification\n" +
    "☐ Investigation records retained for 10 years from case closure\n" +
    "☐ Tipping-off prohibition observed throughout — subject not informed of the investigation or filing\n\n" +
    "TIPPING-OFF PROHIBITION: Throughout the investigation, no information about the investigation or any potential STR filing may be communicated to the subject, any associate of the subject, or any third party not authorised to receive it. Tipping-off is a criminal offence.\n\n" +
    "ESCALATION TRIGGERS: Investigations with indicators of terrorism financing, proliferation financing, or state-sanctioned money laundering require immediate escalation to MLRO, legal counsel, and — where there is an immediate risk — law enforcement.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 20 (suspicious transaction reporting), Federal Decree-Law No. (10) of 2025 Art.15 (STR investigation obligations), Federal Decree-Law No. 10 of 2025 Art.18 (audit trail for AI-assisted investigation), Cabinet Resolution No. (134) of 2025.",

  heatmap:
    "GEOGRAPHIC RISK HEATMAP — COMPLIANCE REPORT\n\n" +
    "Geographic risk heatmap report submitted. High-risk jurisdiction exposure, country risk score changes, FATF grey-list and black-list updates, and transaction volume by jurisdiction reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Country risk scores reviewed against current FATF grey-list and black-list status\n" +
    "☐ Any new FATF grey-list additions in the period: immediate portfolio re-screening initiated within 5 business days\n" +
    "☐ Any new FATF black-list additions: immediate enhanced counter-measures assessed\n" +
    "☐ Country risk score changes of ≥ 2 tiers: customer re-assessment for affected relationships within 30 days\n" +
    "☐ Transaction volume by jurisdiction reviewed — concentration risk in high-risk jurisdictions assessed\n" +
    "☐ MENAFATF mutual evaluation findings reviewed — relevant typology impacts assessed\n" +
    "☐ UN sanctions regime updates (new country or sector designations) incorporated\n" +
    "☐ Heatmap visualisation current with the latest scoring cycle\n" +
    "☐ Elevated-risk exposure areas highlighted in the board reporting pack\n" +
    "☐ Jurisdiction scoring methodology MLRO-approved — last methodology review within 12 months\n\n" +
    "THRESHOLDS: A risk score change of 2 or more tiers (e.g., LOW to HIGH) for any jurisdiction in the institution's portfolio requires immediate customer re-assessment for all affected relationships within 30 days. New FATF grey-list entries require portfolio-wide re-screening within 5 business days.\n\n" +
    "ESCALATION TRIGGERS: Any jurisdiction added to the FATF black-list (or equivalent UN embargo) in which the institution has active customer relationships requires immediate MLRO escalation and a board notification within 24 hours.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 1 (jurisdiction risk in the risk-based approach), FATF Recommendations 10 and 19 (EDD for high-risk countries), Federal Decree-Law No. 10 of 2025 Art.18, Cabinet Decision No.74/2020.",

  "brain-map":
    "BRAIN INTELLIGENCE ARCHITECTURE — COMPLIANCE REPORT\n\n" +
    "Brain intelligence architecture report submitted. All 15 AI faculties reviewed for operational status. Model router circuit breaker assessed. Attestation status for all registered models confirmed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All 15 AI faculties confirmed OPERATIONAL — any degraded faculty flagged with cause\n" +
    "☐ Model router circuit breaker in CLOSED state — OPEN or HALF-OPEN states require immediate investigation\n" +
    "☐ Attestation status for all registered models: CURRENT (green) or DUE (requires attention within 14 days)\n" +
    "☐ No OVERDUE model attestations in production — OVERDUE triggers immediate model suspension\n" +
    "☐ All models in MODEL_REGISTRY have riskTier, approval, and cardRef populated (CI gate validates this)\n" +
    "☐ Prompt hash manifest current — all SYSTEM_PROMPT constants appear in prompt-hash-manifest.json\n" +
    "☐ 1,475 reasoning modes reviewed for version pin currency (CI brain-audit gate pass confirmed)\n" +
    "☐ Faculties with degraded performance metrics identified — re-attestation triggered\n" +
    "☐ OTel spans operational — 7 boundary points reporting to observability backend\n" +
    "☐ Brain architecture audit script (brain-audit.mjs) run and passed\n\n" +
    "CIRCUIT BREAKER: If the model router circuit breaker is in OPEN state, all AI-assisted decisions are falling back to the fail-closed path (HELD_REVIEW). This affects screening, transaction monitoring, and SAR narrative generation. An OPEN circuit breaker lasting more than 30 minutes requires P1 incident declaration.\n\n" +
    "ESCALATION TRIGGERS: Any OVERDUE attestation in a production model, any circuit breaker OPEN state, or any prompt hash manifest mismatch must be treated as a P1 AI governance incident with immediate MLRO and CTO notification.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI system integrity and audit trail), NIST AI RMF GOVERN-1 and MANAGE-1 (model governance), FATF Guidance on AI in AML/CFT.",

  "intelligence-hub":
    "INTELLIGENCE HUB — UNIFIED COMPLIANCE REPORT\n\n" +
    "Intelligence Hub unified compliance report submitted. All 9 hub sections reviewed. Cross-section health signals assessed: false-positive rate, red-team pass rate, endpoint health, and brain drift status.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All 9 hub sections reviewed within the reporting period: Analytics, Brain Intel, Workbench, Telemetry, Red-Team, Security, Governance, Status, API Docs\n" +
    "☐ Cross-section health bar reviewed: FP rate, red-team pass rate, endpoint health, and brain drift\n" +
    "☐ FP rate signal reviewed — confirmed ≤ 3% or breach documented and investigated\n" +
    "☐ Red-team pass rate reviewed — confirmed ≥ 95% or adversarial probe failures investigated\n" +
    "☐ Endpoint health confirmed OPERATIONAL — DEGRADED or DOWN states treated as incidents\n" +
    "☐ Brain drift signal reviewed — drifted modes identified and recalibration plan in place\n" +
    "☐ Any signal in RED state: documented MLRO response required within 48 hours\n" +
    "☐ Security Audit section reviewed — OWASP checklist items assessed\n" +
    "☐ Governance section reviewed — NIST AI RMF and MITRE ATLAS alignment confirmed\n" +
    "☐ API Docs section reviewed — all endpoints confirmed as documented and current\n\n" +
    "CROSS-SECTION INTEGRITY: The Intelligence Hub aggregates signals from all major compliance modules. A RED signal in any section reflects a real compliance or technical issue in the underlying module. Signals must not be dismissed as 'display issues' — each must be investigated at the source.\n\n" +
    "ESCALATION TRIGGERS: Simultaneous RED signals in the Brain drift and Red-team pass rate sections indicate a potential combined AI integrity and adversarial robustness failure — escalate to the MLRO and AI governance team as a P1 incident.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI system governance and unified oversight), NIST AI RMF (integrated AI risk monitoring), FATF Recommendation 1 (risk-based approach across all compliance functions).",

  "intelligence-tools":
    "INTELLIGENCE TOOLS GOVERNANCE — COMPLIANCE REPORT\n\n" +
    "Intelligence tools governance report submitted. Tool access permissions reviewed. Usage audit log inspected for anomalous patterns. API rate limits assessed. Session and export logs reviewed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All tool access permissions reviewed for least-privilege compliance\n" +
    "☐ Users with access confirmed as active, current-role holders — no orphaned access\n" +
    "☐ Usage audit log reviewed: bulk exports, off-hours access, unusual geolocation, repeated rapid queries\n" +
    "☐ Any anomalous usage pattern referred to the security team and MLRO within 24 hours\n" +
    "☐ API rate limit compliance confirmed — no rate limit breaches logged in the period\n" +
    "☐ Tool session logs reviewed for concurrent sessions from different IPs (potential credential sharing)\n" +
    "☐ Tool export volumes reviewed — large data exports require documented business justification\n" +
    "☐ Privilege escalation events reviewed — no self-escalations detected\n" +
    "☐ Third-party API integrations reviewed — no unauthorised API consumers detected\n" +
    "☐ Tool access audit records retained for 10 years\n\n" +
    "THRESHOLDS: Bulk exports exceeding 1,000 records in a single session require documented business justification and MLRO approval. Off-hours access (outside 07:00–22:00 local time) without a logged business reason must be investigated.\n\n" +
    "ESCALATION TRIGGERS: Any bulk export of CDD or screening data without documented justification, any access from a jurisdiction not associated with the user's role, or any credential-sharing indicator must be treated as a potential insider threat and referred to the security team within 4 hours.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (access controls for AI-assisted compliance tools), SOC2 CC6.1 (logical access), FATF Recommendation 18 (internal controls — system access).",

  "batch-screening":
    "BATCH SCREENING — COMPLIANCE REPORT\n\n" +
    "Batch screening compliance report submitted. 100% subject coverage confirmed. Hit rate within expected range. All MATCH_FOUND results queued for individual MLRO review.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Batch job confirmed as 100% complete — no subjects silently skipped\n" +
    "☐ Subject count reconciled against the submitted population\n" +
    "☐ Hit rate reviewed against historical baseline — anomalous deviation investigated\n" +
    "☐ All MATCH_FOUND results individually queued for MLRO review — no bulk clearance permitted\n" +
    "☐ MATCH_FOUND queue review SLA: 24 hours from batch completion\n" +
    "☐ PROCESSING_ERROR records investigated and requeued\n" +
    "☐ Watchlist version confirmed current at time of batch execution\n" +
    "☐ Batch runtime within SLA — timeouts or partial completion treated as a system incident\n" +
    "☐ Output file integrity verified — hash of output file computed and retained\n" +
    "☐ All batch screening results logged to audit chain per Federal Decree-Law No. 10 of 2025 Art.18\n\n" +
    "BATCH INTEGRITY: The batch output file hash must be verified before the MLRO review queue is populated. Any discrepancy between the expected subject count and the actual processed count must be investigated as a potential system failure before any MATCH_FOUND results are reviewed.\n\n" +
    "ESCALATION TRIGGERS: Hit rate deviating more than 2 standard deviations from the 30-day rolling average, or a batch producing zero MATCH_FOUND results against a watchlist where hits are historically expected, must be escalated as potential system failure.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI-assisted screening audit trail), FATF Recommendation 6 (targeted financial sanctions screening completeness), Cabinet Decision No.74/2020.",

  "country-risk":
    "COUNTRY RISK ASSESSMENT — COMPLIANCE REPORT\n\n" +
    "Country risk assessment report submitted. Country risk scores updated. FATF grey-list and black-list changes reviewed. Portfolio exposure to elevated-risk jurisdictions assessed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Country risk scores updated with latest FATF plenary outcomes and MENAFATF assessments\n" +
    "☐ FATF grey-list additions and removals in the period processed: portfolio re-screening initiated\n" +
    "☐ FATF black-list (Non-Cooperative Countries and Territories) status reviewed\n" +
    "☐ UN Security Council geographic embargo status reviewed for all portfolio jurisdictions\n" +
    "☐ CBUAE-issued country risk guidance reviewed and incorporated\n" +
    "☐ Customers and counterparties in newly elevated jurisdictions identified\n" +
    "☐ Risk score change ≥ 2 tiers: customer re-assessment for affected relationships within 30 days\n" +
    "☐ Country risk methodology reviewed for consistency with FATF guidance — MLRO-approved\n" +
    "☐ Country risk scores applied consistently across all modules: screening, TM, CDD\n" +
    "☐ Board reporting pack updated with jurisdiction risk changes in the period\n\n" +
    "THRESHOLDS: A risk score change of ≥ 2 tiers for any jurisdiction in the institution's portfolio requires immediate customer re-assessment for all affected relationships within 30 days. New FATF grey-list entries require portfolio-wide re-screening within 5 business days.\n\n" +
    "ESCALATION TRIGGERS: Any new FATF black-list entry, new UN Security Council geographic embargo, or CBUAE enhanced counter-measures directive for a jurisdiction in the institution's active portfolio requires board notification within 24 hours.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 1 (jurisdiction risk), FATF Recommendations 10 and 19 (EDD for high-risk countries), Federal Decree-Law No. 10 of 2025 Art.18, Cabinet Decision No.74/2020.",

  "country-risk-map":
    "COUNTRY RISK MAP — COMPLIANCE REPORT\n\n" +
    "Country risk map review submitted. Geographic risk visualisation confirmed current with the latest scoring cycle. Jurisdiction scoring methodology reviewed. Elevated-risk exposure areas highlighted in the board reporting pack.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Geographic risk visualisation reflects the latest country risk scoring cycle\n" +
    "☐ All 195 UN member states reflected with current risk tier designation\n" +
    "☐ FATF grey-list and black-list jurisdictions highlighted distinctly\n" +
    "☐ UN Security Council embargoed jurisdictions highlighted\n" +
    "☐ Portfolio geographic exposure overlaid — customer and transaction volumes by jurisdiction\n" +
    "☐ Elevated-risk exposure areas highlighted for board reporting\n" +
    "☐ Jurisdiction scoring methodology MLRO-approved — last methodology review within 12 months\n" +
    "☐ Methodology changes approved by MLRO and documented with effective date\n" +
    "☐ Scoring methodology consistent with FATF guidance — no internally favoured score changes without regulatory basis\n" +
    "☐ Board reporting pack updated with the current country risk map summary\n\n" +
    "METHODOLOGY INTEGRITY: Country risk scores must be based on published, verifiable sources: FATF plenary outcomes, UN Security Council resolutions, CBUAE guidance, and credible country risk indices. Any departure from the approved methodology requires MLRO written approval.\n\n" +
    "ESCALATION TRIGGERS: Any internal jurisdiction risk score change that lowers the risk classification for a jurisdiction that FATF has grey-listed or black-listed requires immediate MLRO review — internal scores must not contradict binding FATF designations.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 1, FATF Recommendations 10 and 19, Federal Decree-Law No. 10 of 2025 Art.18, Federal Decree-Law No. (10) of 2025.",

  "sanctions-evasion":
    "SANCTIONS EVASION DETECTION — COMPLIANCE REPORT\n\n" +
    "Sanctions evasion detection report submitted. Typology matches for layering, structuring, vessel flag-hopping, and front-company patterns reviewed. SAR filing status confirmed for all confirmed evasion indicators.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Evasion typology matches reviewed: layering, structuring, trade mis-invoicing, vessel flag-hopping\n" +
    "☐ Front-company patterns investigated: entities with no apparent business purpose, no employees, no assets\n" +
    "☐ Vessel AIS manipulation indicators reviewed: dark periods, impossible port transitions, flag changes\n" +
    "☐ Complex payment chain analysis completed: number of intermediaries, jurisdictions traversed\n" +
    "☐ All identified evasion indicators investigated with documented rationale\n" +
    "☐ SAR filed for all cases where evasion suspicion threshold is reached\n" +
    "☐ Confirmed evasion attempts reported to the competent authority without delay\n" +
    "☐ Asset freeze instructions issued for all confirmed designated person connections\n" +
    "☐ Evasion typology library updated with new patterns identified in the period\n" +
    "☐ Investigation records retained for 10 years\n\n" +
    "REPORTING URGENCY: Confirmed sanctions evasion attempts must be reported to the competent authority immediately — there is no grace period. Any delay in reporting constitutes a further breach. Concurrent notification to the MLRO, legal counsel, and the board is required.\n\n" +
    "ESCALATION TRIGGERS: Any evasion pattern connected to a UN Security Council designated entity, any indication of state-sponsored sanctions evasion, or any pattern suggesting systematic circumvention (not an isolated incident) requires immediate MLRO, board, and legal counsel escalation.\n\n" +
    "REGULATORY BASIS: FATF Recommendation 6 (targeted financial sanctions and evasion detection), Cabinet Decision No.74/2020, Federal Decree-Law No. (10) of 2025 Art.18, OFAC advisory on sanctions evasion red flags.",

  "supply-chain":
    "SUPPLY CHAIN RISK — COMPLIANCE REPORT\n\n" +
    "Supply chain risk compliance report submitted. Tier-1 and tier-2 supplier screening completed. High-risk supplier relationships reviewed by MLRO. Remediation plans confirmed for critical findings.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All tier-1 (direct) suppliers screened against UN, OFAC, EU, UK sanctions lists\n" +
    "☐ All tier-1 suppliers subject to adverse media check\n" +
    "☐ Tier-2 (indirect) suppliers screened for critical and high-risk commodity categories\n" +
    "☐ Supplier UBO chains documented — no unidentified beneficial owners in tier-1 relationships\n" +
    "☐ HIGH-risk supplier relationships reviewed by MLRO — continued engagement documented\n" +
    "☐ Documented remediation plans active for all CRITICAL and HIGH-risk findings\n" +
    "☐ Suppliers with unresolved HIGH-risk findings suspended from procurement pending MLRO clearance\n" +
    "☐ OECD 5-Step DDG compliance assessed for applicable commodity categories\n" +
    "☐ Responsible sourcing certifications reviewed and current\n" +
    "☐ Annual re-screening schedule confirmed for all active tier-1 suppliers\n\n" +
    "SUSPENSION REQUIREMENT: Suppliers with unresolved HIGH-risk findings (sanctions match, confirmed conflict-mineral exposure, or forced labour indicators) must be suspended from all procurement activity. No payment may be made to a suspended supplier until MLRO clearance is documented.\n\n" +
    "ESCALATION TRIGGERS: Any tier-1 supplier found to be a designated person, confirmed as a front for a sanctioned entity, or found to be sourcing materials from a UN-embargoed jurisdiction requires immediate MLRO and legal counsel escalation.\n\n" +
    "REGULATORY BASIS: UAE Ministerial Decision No.68/2024 (responsible sourcing), OECD 5-Step Due Diligence Guidance, Federal Decree-Law No. 10 of 2025 Art.18, FATF Recommendation 10 (third-party due diligence).",

  "analyst-behavior":
    "USER & ENTITY BEHAVIOUR ANALYTICS (UEBA) — COMPLIANCE REPORT\n\n" +
    "UEBA report submitted. Analyst activity anomalies, privilege escalation alerts, unauthorised data access patterns, and off-hours system activity reviewed for the reporting period. Insider threat indicators assessed.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All analyst activity anomalies reviewed — no HIGH-risk alerts older than 24 hours without investigation\n" +
    "☐ Privilege escalation alerts reviewed: all escalations confirmed as authorised and documented\n" +
    "☐ Unauthorised data access patterns investigated: records accessed outside the analyst's assigned role\n" +
    "☐ Off-hours system activity reviewed — no unexplained high-volume activity outside business hours\n" +
    "☐ Bulk data export events reviewed — exports over 1,000 records require documented justification\n" +
    "☐ Concurrent sessions from multiple IPs investigated — potential credential sharing detected\n" +
    "☐ Failed authentication patterns reviewed — brute force and credential stuffing indicators assessed\n" +
    "☐ HIGH-risk UEBA alerts investigated by the security team within 24 hours\n" +
    "☐ Confirmed insider threat indicators: MLRO and board notified within 4 hours\n" +
    "☐ UEBA event logs retained for 10 years per audit record-keeping obligations\n\n" +
    "INSIDER THREAT PROTOCOL: Confirmed insider threat indicators (exfiltration of compliance data, intentional bypass of screening controls, fabrication of compliance records) require immediate account suspension, MLRO notification, board notification, and — where criminal conduct is suspected — law enforcement referral.\n\n" +
    "ESCALATION TRIGGERS: Any UEBA alert involving a system administrator, MLRO, or board member requires immediate escalation to the board chair and external legal counsel — not to the MLRO (conflict of interest).\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (AI system access controls), SOC2 CC7.4 (security monitoring), FATF Recommendation 18 (internal controls — staff oversight).",

  "intel-status":
    "INTELLIGENCE SOURCE HEALTH — COMPLIANCE REPORT\n\n" +
    "Intelligence source health report submitted. All external data feeds reviewed for operational status, sync timestamp currency, and incident history. Degraded or disconnected sources escalated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All external data feeds confirmed OPERATIONAL — GREEN status for all sources\n" +
    "☐ Last successful sync timestamps reviewed: tier-1 feeds ≤ 15 minutes; tier-2 feeds ≤ 1 hour; tier-3 feeds ≤ 24 hours\n" +
    "☐ Feed downtime in the period: any downtime > 4 hours logged as an operational incident\n" +
    "☐ Degraded feeds (latency > 2x SLA baseline) escalated to the relevant vendor\n" +
    "☐ Any disconnected source: MLRO notification completed within 4 hours of detection\n" +
    "☐ Watchlist version currency confirmed: all production lists current (not stale from a missed update)\n" +
    "☐ API key expiry dates reviewed for all external feed integrations\n" +
    "☐ Feed data quality reviewed: anomalous drop in record counts investigated\n" +
    "☐ Vendor SLA compliance reviewed — SLA breach tickets raised where applicable\n" +
    "☐ Feed health incidents during the period reviewed and remediated\n\n" +
    "INCIDENT THRESHOLD: Feed downtime exceeding 4 hours constitutes an operational incident under the SOC2 CC7.4 incident response policy. An incident record must be created, the root cause investigated, and the MLRO notified of any compliance impact from the downtime period (e.g., missed watchlist updates).\n\n" +
    "ESCALATION TRIGGERS: Any sanctions list feed downtime exceeding 4 hours requires immediate MLRO notification and an assessment of whether any transactions processed during the downtime period require retrospective screening.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (system resilience for AI-assisted compliance), SOC2 CC7.4 (operational incident response), FATF Recommendation 6 (sanctions list screening — operational integrity).",
  // 16 · Supply Chain
  "vessel-check":
    "VESSEL COMPLIANCE CHECK — REPORT\n\n" +
    "Vessel compliance check report submitted. AIS transponder status reviewed. Flag state sanctions exposure assessed. Full port-call history examined. P&I club membership and cargo documentation verified.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ AIS transponder status reviewed: ACTIVE, DARK, or UNKNOWN — dark periods documented\n" +
    "☐ Dark vessel period assessment: any AIS-off period > 6 hours in open water is a high-risk indicator\n" +
    "☐ Vessel flag state sanctions exposure confirmed — flag state not subject to UN or OFAC embargo\n" +
    "☐ Vessel owner and registered operator screened against sanctions lists\n" +
    "☐ Full port-call history examined: no calls at embargoed ports in the prior 12 months\n" +
    "☐ Ship-to-ship transfer events reviewed — offshore transfers are a known evasion indicator\n" +
    "☐ P&I club membership confirmed current — uninsured vessels are an additional risk indicator\n" +
    "☐ Vessel flag changes in the prior 12 months documented — frequent flag changes are a red flag\n" +
    "☐ Cargo manifest verified against the declared vessel and routing\n" +
    "☐ All findings documented with data sources cited (MMSI, IMO number, AIS provider, date)\n\n" +
    "DARK VESSEL PROTOCOL: Any AIS-off period exceeding 6 hours in open water (i.e., not in a port or anchorage where AIS-off is standard) must be treated as a high-risk indicator and reported to the MLRO. Multiple dark periods in a voyage constitute a pattern requiring SAR consideration.\n\n" +
    "ESCALATION TRIGGERS: Vessel with dark periods in sanctioned waters, vessel with flag changes in the past 90 days, or vessel involved in confirmed ship-to-ship transfers in the past 12 months must be immediately escalated to the MLRO before any cargo release or payment authorisation.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 (maritime trade compliance), OFAC Vessel Advisory (May 2020 — sanctions evasion via maritime sector), FATF Typologies (trade-based money laundering), UN Security Council maritime embargo implementation.",

  // 17 · Export Control
  eocn:
    "EXPORT CONTROL — EOCN COMPLIANCE REPORT\n\n" +
    "EOCN trade compliance report submitted. Dual-use goods classification completed. End-user certificate verified. Export licence checked. Denied party screening completed for all counterparties.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ Dual-use goods classification completed: HS code and EOCN/CCN classification confirmed\n" +
    "☐ Goods reviewed against UAE export control list, EU Dual-Use Regulation 2021/821 (if applicable), and US EAR/ITAR (if applicable)\n" +
    "☐ Export licence confirmed: valid, covers the correct goods, destination, and end-user\n" +
    "☐ Licence expiry date confirmed not exceeded\n" +
    "☐ End-user certificate on file, verified, and not expired\n" +
    "☐ End-user identity confirmed via primary source (official government entity confirmation where required)\n" +
    "☐ Denied party screening: all counterparties (shipper, consignee, end-user, freight forwarder) screened against OFAC, BIS Denied Parties List, EU restrictive measures\n" +
    "☐ Destination country confirmed not subject to embargo for the specific goods category\n" +
    "☐ Any shipment without a valid export licence for controlled goods held immediately — no exceptions\n" +
    "☐ Export compliance records retained for 10 years\n\n" +
    "ZERO-EXCEPTION HOLD REQUIREMENT: No shipment of controlled goods may proceed without a valid export licence covering the specific goods, destination country, and end-user. Shipments found to be lacking a required licence must be placed on an immediate hold with all commercial counterparties notified that the shipment is under review.\n\n" +
    "ESCALATION TRIGGERS: Any confirmed export of controlled goods without a valid licence, any end-user found to be a denied party, or any destination found to be embargoed for the specific goods category requires immediate MLRO, legal counsel, and potentially law enforcement notification.\n\n" +
    "REGULATORY BASIS: UAE Federal Export Control Law, EU Dual-Use Regulation 2021/821, US Export Administration Regulations (for applicable entities), UN Security Council arms and proliferation embargo resolutions, Federal Decree-Law No. 10 of 2025 Art.18.",

  // 18 · Regulator Portal
  "inspection-room":
    "REGULATOR INSPECTION ROOM — COMPLIANCE REPORT\n\n" +
    "Regulator inspection room report submitted. All documents requested by the competent authority confirmed uploaded and accessible. Regulator user access confirmed restricted to authorised officials. Full inspection interaction log retained.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All documents requested by the competent authority uploaded and confirmed accessible\n" +
    "☐ Document completeness checked — no missing or partially redacted required documents\n" +
    "☐ Regulator user access confirmed: only authorised officials have access, access list reviewed\n" +
    "☐ Regulator user session log reviewed — no unauthorised access events\n" +
    "☐ All regulator queries responded to within 48 hours — overdue queries escalated to MLRO immediately\n" +
    "☐ Regulator inspection interaction log complete and auditable\n" +
    "☐ Legal counsel engaged for any regulator queries that may give rise to enforcement action\n" +
    "☐ MLRO involved in preparing all responses to substantive regulatory queries\n" +
    "☐ No documents withheld from the regulator without legal professional privilege confirmation from counsel\n" +
    "☐ All inspection records retained for 10 years from the date of the inspection\n\n" +
    "COOPERATION OBLIGATION: Full cooperation with the competent authority during an inspection is a legal obligation. Any attempt to conceal, withhold, or delay the provision of requested documents — without a bona fide legal professional privilege basis confirmed by counsel — constitutes obstruction and may give rise to additional regulatory action.\n\n" +
    "ESCALATION TRIGGERS: Any regulator query left unanswered for more than 48 hours, any attempt by staff to obstruct or limit regulator access, or any regulator query indicating awareness of a compliance failure not previously disclosed to the regulator requires immediate MLRO and board escalation.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.26-27 (regulatory cooperation and inspection rights), CR 134/2025 Art.18 (supervisory response obligations), Federal Decree-Law No. (10) of 2025 Art.26 (record retention for regulator access), FATF Recommendation 27 (supervisory powers).",

  // 19 · Incidents
  "grievances-whistleblowing":
    "GRIEVANCES & WHISTLEBLOWING — COMPLIANCE REPORT\n\n" +
    "Grievance and whistleblowing report submitted. All disclosures reviewed for acknowledgement currency, confidentiality maintenance, investigation owner assignment, and escalation status.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All disclosures acknowledged within 5 business days of receipt\n" +
    "☐ Reporter confidentiality maintained throughout — no information disclosed that could identify the reporter\n" +
    "☐ An investigation owner assigned for each disclosure with a documented investigation timeline\n" +
    "☐ Investigation owner confirmed as independent from any person named in the disclosure\n" +
    "☐ Disclosures alleging criminal conduct assessed for mandatory reporting to the competent authority\n" +
    "☐ Criminal conduct disclosures: legal counsel engaged within 24 hours\n" +
    "☐ Unresolved disclosures beyond 30 days reviewed by the board — written justification for extension\n" +
    "☐ Reporter protection measures active — no retaliation against the reporting person\n" +
    "☐ Retaliation allegations investigated independently of the original disclosure\n" +
    "☐ All disclosure and investigation records retained for 10 years\n" +
    "☐ Whistleblowing channel confirmed operational and communicated to all staff\n\n" +
    "REPORTER PROTECTION: Any retaliation against a whistleblower (demotion, discipline, dismissal, intimidation) is itself a serious compliance breach and, in certain jurisdictions, a criminal offence. Any suspected retaliation must be investigated independently and reported to the board.\n\n" +
    "ESCALATION TRIGGERS: Any disclosure alleging AML/CFT violations, regulatory misconduct, financial crime, or misconduct by a senior officer requires escalation to the board (excluding the subject of the disclosure). Anonymous disclosures must be investigated with the same rigour as named disclosures.\n\n" +
    "REGULATORY BASIS: Federal Decree-Law No. 10 of 2025 Art.18 (governance and internal reporting), UAE Whistleblower Protection provisions (Federal Decree-Law No.4/2016 as applicable), Federal Decree-Law No. (10) of 2025 Art.18 (internal reporting channels), FATF Recommendation 18 (internal controls — reporting channels).",

  // Admin
  "admin-tenants":
    "TENANT ADMINISTRATION — COMPLIANCE REPORT\n\n" +
    "Tenant administration report submitted. All active tenant configurations reviewed. API key rotation status verified. Tenant-level access permissions audited. Multi-tenant isolation controls validated.\n\n" +
    "REVIEW CHECKLIST:\n" +
    "☐ All active tenant configurations reviewed for compliance with the tenant configuration policy\n" +
    "☐ API key rotation status verified: all keys rotated within the policy window (maximum 90 days)\n" +
    "☐ Expired API keys confirmed revoked — no expired keys still active\n" +
    "☐ Compromised credentials confirmed as immediately revoked and re-issued\n" +
    "☐ Tenant-level access permissions reviewed: least-privilege, segregation between tenants\n" +
    "☐ Multi-tenant data isolation verified: no cross-tenant data leakage events detected\n" +
    "☐ Tenant audit logs reviewed: each tenant's audit chain segregated and intact\n" +
    "☐ Dormant tenant accounts (no activity > 90 days) reviewed — suspend or confirm active use\n" +
    "☐ Tenant onboarding documentation current — agreements and compliance obligations signed\n" +
    "☐ Tenant offboarding procedure confirmed: data retention and deletion obligations documented\n\n" +
    "MULTI-TENANT ISOLATION: Each tenant's data — including CDD records, screening results, and audit chain entries — must be completely isolated from all other tenants at the storage and application layer. Any detected cross-tenant data access is a critical security and compliance incident.\n\n" +
    "ESCALATION TRIGGERS: Any cross-tenant data exposure, any API key found to be compromised, or any tenant found to be using the platform in violation of their agreement (e.g., sharing access with an unauthorised third party) must be immediately escalated to the MLRO and the security team, with the affected tenant suspended pending investigation.\n\n" +
    "REGULATORY BASIS: SOC2 CC6.1 (logical access controls and multi-tenant isolation), Federal Decree-Law No. 10 of 2025 Art.18 (system access governance), UAE PDPL (data segregation between customers), FATF Recommendation 18 (group-wide controls — third-party service providers).",
};

interface Body {
  module: string;
  label: string;
  summary: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface ApiResponse {
  ok: boolean;
  taskGid?: string;
  taskUrl?: string;
  error?: string;
  detail?: string;
}

function respond(status: number, body: ApiResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function buildNotes(b: Body, gen: Date): string {
  const moduleLabel = MODULE_LABELS[b.module] ?? b.module.toUpperCase();
  const board = PROJECT_BOARD[b.module] ?? "00 · Master Inbox";
  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · ${moduleLabel.toUpperCase()} REPORT`);
  lines.push(`Generated   : ${gen.toUTCString().replace(" GMT", " UTC")}`);
  lines.push(`Module      : ${moduleLabel}`);
  lines.push(`Board       : ${board}`);
  lines.push(`Subject     : ${b.label}`);
  lines.push("");
  lines.push(`SUMMARY`);
  lines.push(b.summary);
  lines.push("");
  if (b.metadata && Object.keys(b.metadata).length > 0) {
    lines.push(`DETAIL`);
    for (const [k, v] of Object.entries(b.metadata)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`${k.padEnd(18, " ")}: ${val}`);
    }
    lines.push("");
  }
  const pageUrl = b.url ?? `https://hawkeye-sterling.netlify.app/${b.module}`;
  lines.push(`Module URL  : ${pageUrl}`);
  lines.push(`Legal basis : Federal Decree-Law No. 10 of 2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
  return lines.join("\n");
}

async function handleModuleReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return respond(503, {
      ok: false,
      error: "asana not configured",
      detail: "Set ASANA_TOKEN in Netlify env vars for the hawkeye-sterling site.",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" });
  }
  if (!body?.module || !body?.label || !body?.summary) {
    return respond(400, { ok: false, error: "module, label and summary are required" });
  }

  const gen = new Date();
  const moduleLabel = MODULE_LABELS[body.module] ?? body.module.toUpperCase();
  const taskName = `[${moduleLabel.toUpperCase()}] ${body.label} · ${gen.toISOString().slice(0, 10)}`;
  const richSummary = MODULE_SUMMARIES[body.module];
  const notes = buildNotes(richSummary ? { ...body, summary: richSummary } : body, gen);
  const projectGid = projectGidForModule(body.module);

  const TIMEOUT_MS = 10_000;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let asanaRes: Response;
    try {
      asanaRes = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [projectGid],
            workspace: asanaGids.workspace(),
            assignee: asanaGids.assignee(),
          },
        }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = (await asanaRes.json().catch((err: unknown) => {
      console.warn("[hawkeye] module-report Asana response parse failed:", err);
      return null;
    })) as
      | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
      | null;

    if (!asanaRes.ok || !payload?.data?.gid) {
      const msg = payload?.errors?.[0]?.message ?? `HTTP ${asanaRes.status}`;
      const mappedStatus =
        asanaRes.status >= 500 ? 502
        : asanaRes.status === 401 || asanaRes.status === 403 ? 503
        : 422;
      return respond(mappedStatus, { ok: false, error: "asana rejected the task", detail: msg });
    }

    return respond(201, {
      ok: true,
      taskGid: payload.data.gid,
      ...(payload.data.permalink_url ? { taskUrl: payload.data.permalink_url } : {}),
    });
  } catch (err) {
    console.error("[module-report] Asana request failed:", err instanceof Error ? err.message : err);
    return respond(500, {
      ok: false,
      error: "Asana request failed — please retry or contact support.",
    });
  }
}

export const POST = withGuard(handleModuleReport);
