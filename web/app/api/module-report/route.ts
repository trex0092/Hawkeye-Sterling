import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { asanaGids } from "@/lib/server/asanaConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function projectGidForModule(module: string): string {
  switch (module) {
    case "screening":
    case "batch":
    case "adverse-media-lookback":
    case "adverse-media":
    case "adverse-media-live":
      return asanaGids.screening();
    case "analytics":
      return asanaGids.mlroDaily();
    case "audit-trail":
      return asanaGids.auditLog();
    case "sar-qa":
      return asanaGids.fourEyes();
    case "str-cases":
    case "cases":
    case "goaml-submission":
    case "goaml":
    case "sar-narrative":
      return asanaGids.sar();
    case "benford":
      return asanaGids.ffr();
    case "gleif":
    case "domain-intel":
    case "crypto-risk":
    case "vendor-dd":
    case "client-portal":
    case "ubo-declaration":
    case "cdd-review":
    case "entity-graph":
    case "onboarding":
    case "pep-profile":
    case "ownership":
      return asanaGids.kyc();
    case "transaction-monitor":
      return asanaGids.tm();
    case "policies":
    case "regulatory":
    case "playbook":
    case "data-quality":
    case "corrections":
    case "access-control":
    case "maker-checker":
    case "approvals":
    case "profile":
    case "cnmr":
    case "dpmsr":
    case "moe-survey":
    case "oecd-ddg":
    case "responsible-sourcing":
    case "tfs-alerts":
    case "typology-library":
      return asanaGids.complianceOps();
    case "shipments":
      return asanaGids.shipments();
    case "employees":
      return asanaGids.employees();
    case "training":
      return asanaGids.training();
    case "ewra":
    case "oversight":
    case "enforcement":
    case "responsible-ai":
    case "eval-kpi":
    case "analytics-dashboard":
    case "kri-dashboard":
    case "incident-runbook":
    case "reg-change":
      return asanaGids.governance();
    case "ongoing-monitor":
      return asanaGids.routines();
    case "mlro-advisor":
    case "workbench":
    case "investigation":
    case "weaponized-brain":
    case "intel":
    case "osint":
    case "heatmap":
    case "telemetry":
    case "red-team":
    case "security-audit":
    case "brain-map":
    case "intelligence-hub":
    case "intelligence-tools":
    case "batch-screening":
    case "country-risk":
    case "country-risk-map":
    case "sanctions-evasion":
    case "supply-chain":
      return asanaGids.mlro();
    case "vessel-check":
    case "rmi":
      return asanaGids.supplyChain();
    case "eocn":
      return asanaGids.exportCtrl();
    case "inspection-room":
      return asanaGids.regulator();
    case "grievances-whistleblowing":
      return asanaGids.incidents();
    case "analyst-behavior":
      return asanaGids.governance();
    case "intel-status":
      return asanaGids.mlro();
    default:
      return asanaGids.master();
  }
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
  "data-quality":           "Data Quality",
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
  "data-quality":           "09 · Compliance Ops — Daily & Weekly Tasks",
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
};

// Per-module compliance report summaries — used in Asana task notes.
// Server-side override ensures every task carries an audit-ready description
// regardless of what the client sends in the summary field.
const MODULE_SUMMARIES: Record<string, string> = {
  // 01 · Screening
  screening:
    "Sanctions and adverse media screening completed. Review match disposition, confidence scores, and MLRO override rationale. Verify all UN/OFAC/EU/UK list hits were investigated and either cleared with documented reasoning or escalated to EDD. Confirm no high-risk subjects were onboarded without MLRO sign-off. Regulatory basis: FDL 10/2025 Art.18, FATF R.6.",
  batch:
    "Batch screening run submitted for MLRO review. Confirm batch job ID, total subject count, hit rate, and all unreviewed MATCH_FOUND dispositions. Every positive match requires individual MLRO disposition before subject onboarding or transaction approval may proceed. Regulatory basis: FDL 10/2025 Art.18, FATF R.6.",
  "adverse-media-lookback":
    "Adverse media lookback screening completed. Review all flagged articles, source reliability scores, and NLP classification verdicts. Verify 22-language coverage was applied. Any subject scored HIGH or CRITICAL must be escalated to CDD review within 48 hours. Regulatory basis: FATF R.12 — enhanced due diligence for PEP and high-risk customers.",
  "adverse-media":
    "Adverse media screening report submitted. Confirm article grouping, deduplication accuracy, and sentiment classification for each flagged subject. Any unresolved HIGH-risk adverse media finding blocks onboarding until MLRO disposition is recorded. Regulatory basis: FATF R.12, FDL 10/2025 Art.18.",
  "adverse-media-live":
    "Live adverse media feed alert review. Assess real-time alert queue for unacknowledged alerts older than 24 hours and confirm escalation status. Any CRITICAL-rated alert not actioned within 48 hours requires MLRO notification. Feed downtime exceeding 4 hours must be logged as an operational incident. Regulatory basis: FDL 10/2025 Art.18.",
  // 02 · MLRO Daily Digest
  analytics:
    "MLRO Daily Digest analytics reviewed. Confirm false-positive rate is within threshold (≤ 3%), bias ratio within policy limit (≤ 1.15), daily case volume trending within normal range, and escalation rate not materially elevated. Any KPI breach since last review requires documented root-cause analysis. Regulatory basis: FDL 10/2025 Art.18 AI performance monitoring, FATF R.1 risk-based approach.",
  rmi:
    "Risk and Management Information report reviewed. Confirm KRI trend analysis completed, all open action items have assigned owners and target dates, and portfolio risk distribution reviewed by MLRO. Any KRI breaching RED threshold must be escalated to the board within 5 business days. Regulatory basis: FDL 10/2025, FATF R.1.",
  oversight:
    "Compliance oversight review completed. Confirm open investigations, pending four-eyes approvals, and overdue STR filings reviewed by MLRO. Any material compliance failure identified within the reporting period must be notified to senior management and documented. MLRO certification required before period close.",
  // 03 · Audit Log
  "audit-trail":
    "Audit trail integrity review completed. Confirm HMAC-SHA256 chain continuity with no sequence gaps, all AI decisions and screening results logged, and 10-year retention compliance verified. Any chain integrity failure constitutes a critical incident requiring immediate board notification and regulator disclosure. Regulatory basis: FDL 10/2025 Art.18 — append-only AI decision audit trail, SOC2 CC7.4.",
  // 04 · Four-Eyes Approvals
  "cdd-review":
    "CDD four-eyes review submitted. Verify maker and checker are different individuals (TOCTOU protection enforced by system). Confirm EDD documentation complete for PEP, high-risk, and complex-structure subjects. Any CDD review approved by the same person who initiated it is invalid and must be re-submitted. Regulatory basis: FDL 10/2025 Art.18, FATF R.10 CDD.",
  "ubo-declaration":
    "UBO declaration review submitted. Confirm beneficial ownership chain verified to the ≥ 25% threshold, all UBO identities screened against sanctions and PEP lists, corporate structure diagram attached, and nominee arrangements documented. Unresolved UBO chains block account opening. Regulatory basis: FATF R.10 UBO, Cabinet Decision 74/2020.",
  // 05 · STR/SAR
  "str-cases":
    "STR/SAR case submitted for MLRO review. Confirm case narrative reviewed, all supporting evidence attached, and filing deadline not exceeded. Cases open for more than 30 days without disposition require senior MLRO escalation. Duplicate or amended filings must reference the original case reference. Regulatory basis: FDL 10/2025, Cabinet Decision 10/2019 STR filing obligations.",
  "sar-qa":
    "SAR quality assurance review completed. Verify narrative accuracy and factual consistency with case evidence, all regulatory citations validated against the approved source list (no hallucinated citations), and goAML XML schema compliance confirmed. Four-eyes gate must be cleared by a second qualified MLRO before submission. Regulatory basis: Cabinet Decision 10/2019 Art.15.",
  cases:
    "Case management review completed. Confirm all open cases have an assigned MLRO, a documented evidence trail, and a target resolution date. Cases open beyond 45 days without material update require senior MLRO review and written justification. Closed cases must retain all documentation for 10 years. Regulatory basis: FDL 10/2025 Art.26-27.",
  enforcement:
    "Enforcement action compliance report submitted. Confirm regulatory notice received and formally logged, legal counsel engaged where applicable, response deadline tracked and owner assigned, and board notified. Any enforcement correspondence not responded to within the prescribed deadline triggers regulatory escalation. All records retained for 10 years. Regulatory basis: FDL 10/2025 Art.26-27, CR 134/2025 Art.18.",
  "goaml-submission":
    "goAML STR submission review. Verify XML payload validates against the goAML 5.x schema, all mandatory fields populated with correct Rentity IDs, and submission timestamp recorded. Acknowledgement receipt from the competent authority must be retained with the filing. Any rejected submission must be corrected and resubmitted within 24 hours. Regulatory basis: Cabinet Decision 10/2019, CBUAE reporting requirements.",
  goaml:
    "goAML XML export reviewed. Confirm export schema validated, all STR/CTR/PMR fields complete, and PII transmission limited to goAML mandatory fields only. Export file must be encrypted in transit and the recipient system identity verified. Regulatory basis: Cabinet Decision 10/2019 Art.15, FDL 10/2025 Art.18.",
  "sar-narrative":
    "AI-generated SAR narrative submitted for MLRO review. Verify all regulatory citations are drawn exclusively from the approved source list, the narrative is factually supported by documented case evidence, and the hallucination gate passed with no flagged citations. Human MLRO sign-off is mandatory before filing — AI output alone is insufficient. Regulatory basis: FDL 10/2025 Art.18 human oversight requirement.",
  // 06 · FFR
  benford:
    "Benford's Law analysis report completed. Review digit-distribution deviation scores, flagged transaction clusters, and statistical significance (Z-score). Any Z-score > 2.5 for leading-digit distribution requires escalation to an FFR investigation. Document the analysis methodology and data set used for audit purposes. Regulatory basis: FDL 10/2025 FFR detection, FATF Typologies on financial fraud.",
  // 07 · CDD/KYC
  gleif:
    "GLEIF/LEI verification report submitted. Confirm LEI status (ISSUED / LAPSED / RETIRED), legal entity name exact-match verified, registered address confirmed, and ultimate parent entity identified. Lapsed LEIs must block onboarding until renewed. RETIRED LEIs require successor entity investigation. Regulatory basis: FDL 10/2025 Art.18 entity identity verification.",
  "entity-graph":
    "Entity graph and UBO intelligence report submitted. Review all network connections, beneficial ownership chain depth, circular ownership flags, and high-risk jurisdiction exposure. Any entity with more than 3 shell company hops requires escalation to EDD. Document the graph methodology and data sources used. Regulatory basis: FATF R.10 UBO, FDL 10/2025.",
  "domain-intel":
    "Domain intelligence report submitted. Confirm domain age, registrar identity, MX record configuration, SSL certificate validity, and threat intelligence flags reviewed. Newly-registered domains (< 12 months) or privacy-shielded registrations automatically trigger enhanced due diligence. Any domain flagged in threat feeds blocks counterparty approval. Regulatory basis: FATF R.10 EDD.",
  "crypto-risk":
    "Crypto risk assessment report submitted. Review blockchain address risk score, mixer/tumbler exposure percentage, darknet market association flags, VASP counterparty risk tier, and cluster analysis results. Any address scoring HIGH or CRITICAL must be escalated to MLRO before transaction processing. Regulatory basis: FATF R.15 Virtual Assets, FDL 10/2025.",
  "vendor-dd":
    "Vendor due diligence report submitted. Confirm sanctions screening completed, adverse media check clear, AML/CFT contractual clauses verified, and UBO ownership chain documented. Vendors scoring ≥ 70 require MLRO written approval before engagement. Annual re-screening required for all active vendors. Regulatory basis: FDL 10/2025 Art.18, FATF R.10.",
  "client-portal":
    "Client portal activity review completed. Review all client-submitted documentation for completeness, pending verification items older than 7 days, and portal access audit log for anomalous activity. Any unverified mandatory document blocks account progression. Portal access by non-verified users must be investigated. Regulatory basis: FDL 10/2025 Art.18 CDD.",
  intel:
    "OSINT intelligence report submitted. Confirm open-source intelligence findings reviewed, source reliability assessed and documented, and findings cross-referenced with internal screening and CDD results. OSINT evidence must be timestamped and source-attributed for audit purposes. Regulatory basis: FATF R.10 enhanced due diligence, FDL 10/2025.",
  osint:
    "OSINT intelligence report submitted. Confirm open-source intelligence findings reviewed, source reliability assessed and documented, and findings cross-referenced with internal screening and CDD results. OSINT evidence must be timestamped and source-attributed for audit purposes. Regulatory basis: FATF R.10 enhanced due diligence, FDL 10/2025.",
  onboarding:
    "Onboarding wizard report submitted. Confirm all mandatory CDD steps completed, risk classification correctly assigned, and MLRO written approval obtained for HIGH and CRITICAL risk subjects. Incomplete onboarding records older than 30 days must be escalated. No account activation may proceed without a complete onboarding sign-off. Regulatory basis: FDL 10/2025 Art.18, FATF R.10.",
  "pep-profile":
    "PEP profile review submitted. Confirm PEP status verified via primary source, source of wealth and source of funds documented, enhanced due diligence completed, and senior management approval obtained per policy. PEP relationships must be reviewed annually. Any adverse media finding against a PEP triggers immediate re-assessment. Regulatory basis: FATF R.12 PEP due diligence, FDL 10/2025.",
  ownership:
    "Ownership structure report submitted. Confirm beneficial ownership chain fully documented to the ≥ 25% threshold, all entities within the chain screened against sanctions and adverse media, and complex or layered structures flagged for EDD. Circular ownership patterns require legal counsel review. Regulatory basis: FATF R.10 UBO, Cabinet Decision 74/2020.",
  // 08 · TM
  "transaction-monitor":
    "Transaction monitoring alert review submitted. Confirm all HIGH and CRITICAL alerts have been investigated with documented rationale, typology match evidence recorded, and SAR filed where suspicion is confirmed. Unreviewed alerts older than 72 hours breach internal SLA and require MLRO escalation. Regulatory basis: FATF R.20 STR reporting, FDL 10/2025.",
  // 09 · Compliance Ops
  policies:
    "Compliance policy review submitted. Confirm current policy version bears MLRO approval signature, all FDL 10/2025 and FATF provisions are reflected, next mandatory review date is scheduled, and all staff have been notified of the current version. Policies not reviewed within 12 months are non-compliant and must be immediately escalated to the MLRO.",
  regulatory:
    "Regulatory obligation tracking report submitted. Confirm all open regulatory requirements have assigned owners, confirmed deadlines, and current completion status. Any obligation overdue or at risk of breach must be escalated to the board within 2 business days. New obligations identified during the period must be triaged within 5 business days.",
  playbook:
    "Compliance playbook review submitted. Confirm all playbook steps are current with applicable regulations, the last tested or simulated date is recorded, and responsible officers are named and available. Playbooks not tested within 6 months must be reviewed and re-certified by the MLRO before they remain active.",
  "data-quality":
    "Data quality report submitted. Review completeness scores, missing mandatory fields, duplicate record counts, and anomalous data patterns. A data quality score below 85% triggers a remediation workflow that must be resolved within 10 business days. Repeated breaches require root-cause analysis and MLRO sign-off. Regulatory basis: FDL 10/2025 Art.18 data accuracy.",
  corrections:
    "Data correction audit report submitted. Review the correction log entries for this period including approver identity, reason codes, and before/after values. All corrections to screening results, risk scores, or case data require four-eyes sign-off. Corrections made without approval are a compliance breach requiring immediate MLRO notification.",
  "access-control":
    "Access control audit report submitted. Review user permission assignments, role changes in the period, and privileged access events. Any access rights not recertified within 90 days must be suspended pending review. Dormant accounts (no login > 60 days) must be deactivated. Regulatory basis: SOC2 CC6.1 logical access controls, FDL 10/2025 Art.18.",
  "maker-checker":
    "Maker-checker workflow report submitted. Confirm all pending items have an assigned independent checker, no regulated actions were approved by a single person, and the queue age is within the defined SLA window. Any single-person approval on a regulated action is a four-eyes breach requiring immediate remediation. Regulatory basis: FDL 10/2025 Art.18 human oversight.",
  approvals:
    "Approval workflow report submitted. Confirm all pending approvals are within the defined SLA windows, escalation rules were triggered for any overdue items, and a complete audit trail exists for each approved and rejected action. Approvals processed outside the system without an audit trail are non-compliant.",
  profile:
    "User profile and permissions review submitted. Confirm role assignments are accurate and least-privilege, MFA is enabled for all active users, and inactive accounts (no login > 90 days) are flagged for deactivation. Any privilege escalation in the period must be documented with business justification. Regulatory basis: SOC2 CC6.1.",
  cnmr:
    "CNMR (Cash and Non-Monetary Report) review submitted. Confirm all cash transactions meeting or exceeding the reporting threshold are included, non-monetary transfer details are fully documented, and the filing has been submitted to the competent authority within the regulatory deadline. Late filings carry regulatory penalty and must be disclosed. Regulatory basis: FDL 10/2025 Art.18, CBUAE reporting requirements.",
  dpmsr:
    "DPMSR (Designated Persons Monitoring and Sanctions Report) filing queue review submitted. Confirm all designated person alerts have been reviewed and actioned, filing thresholds have been met, and submissions have been acknowledged by the competent authority. Outstanding DPMSR filings older than the regulatory deadline must be escalated to the MLRO immediately.",
  "moe-survey":
    "Ministry of Economy AML/CFT Survey report submitted. Confirm all survey sections are fully completed, data has been validated against internal records, and the submission has been reviewed and endorsed by the MLRO before the regulatory deadline. Late or incomplete submissions carry regulatory penalty and must be reported to the board.",
  "oecd-ddg":
    "OECD 5-Step Due Diligence Guidance report submitted. Confirm all five steps completed (strong management systems, identify and assess risk in supply chain, design and implement strategy to respond, third-party audit, report annually), adverse impact assessments documented, and senior management review obtained. Regulatory basis: OECD DDG, UAE Ministerial Decision 68/2024.",
  "responsible-sourcing":
    "Responsible sourcing compliance report submitted. Confirm mineral and commodity origin verified through certified chain-of-custody documentation, conflict-zone exposure assessed against OECD risk flags, and supplier attestations current. Any supply chain with unresolved conflict-zone exposure must be suspended pending MLRO and legal review. Regulatory basis: UAE Ministerial Decision 68/2024.",
  "tfs-alerts":
    "Targeted Financial Sanctions (TFS) alert review submitted. Confirm all TFS alerts have been screened within 24 hours, every MATCH_FOUND alert has been escalated to the MLRO, and asset freeze instructions issued where required. Failure to act on a confirmed TFS match within the prescribed timeframe is a criminal offence. Regulatory basis: Cabinet Decision 74/2020, UN Security Council Resolutions.",
  "typology-library":
    "Typology library review submitted. Confirm all active typology modes are current with the latest FATF, MENAFATF, and internal updates, mode performance metrics have been reviewed for drift or degradation, and any low-performing modes are flagged for recalibration. Typologies not reviewed within 12 months must be suspended from production scoring. Regulatory basis: FATF Typologies Reports, FDL 10/2025.",
  // 10 · Shipments
  shipments:
    "Shipment compliance report submitted. Confirm cargo manifest reviewed for dual-use and controlled goods, sanctioned port and vessel checks completed, EOCN classification verified, and bill of lading cross-checked against declared counterparty. Any shipment with unresolved sanctions or export control flags must be held pending MLRO clearance. Regulatory basis: Federal export control decree, FDL 10/2025.",
  // 11 · Employees
  employees:
    "Employee compliance report submitted. Review AML/CFT training completion rates, background screening status for all new hires and annual re-screens, and confirmation that declarations of interests have been filed by all regulated staff. Employees overdue for training must be suspended from regulated activities pending completion. Regulatory basis: FDL 10/2025 Art.18 staff obligations.",
  // 12 · Training
  training:
    "AML/CFT training completion report submitted. Review pass rates, outstanding completions by department, and current training content version against regulatory requirements. Employees who fail the assessment twice require a supervisor-led refresher and MLRO notification. Training records must be retained for 10 years. Regulatory basis: FDL 10/2025 Art.18 staff training obligations.",
  // 13 · Governance
  ewra:
    "Enterprise-Wide Risk Assessment (EWRA) report submitted. Review risk category scores, inherent versus residual risk gaps, control effectiveness ratings, and all open action items with owners and deadlines. The EWRA must be updated following any material business change and reviewed at least annually by the board. Regulatory basis: FATF R.1 risk-based approach, FDL 10/2025 Art.18.",
  "responsible-ai":
    "Responsible AI governance report submitted. Confirm all model registry attestations are current, bias ratio is within the approved threshold (≤ 1.15 per MLRO policy — tighter than FATF floor of 1.5), drift monitor status is GREEN, and human oversight documentation complete for all AI-assisted decisions in the period. Regulatory basis: FDL 10/2025 Art.18 AI governance, NIST AI RMF.",
  "eval-kpi":
    "AI evaluation KPI report submitted. Review F1 score, precision and recall trends, false positive rate, and fairness metrics across all active models in the reporting period. Any KPI breach requires the affected model to be suspended from production scoring pending re-evaluation and MLRO sign-off. Regulatory basis: FDL 10/2025 Art.18, NIST AI RMF MEASURE-2.7.",
  "analytics-dashboard":
    "Analytics dashboard compliance report submitted. Confirm MLRO digest metrics reviewed, risk forecast trends assessed, and all anomaly alerts investigated. The dashboard must be reviewed by the MLRO at least weekly. Any metric outside the approved operating range requires documented response within 48 hours. Regulatory basis: FDL 10/2025 Art.18 performance monitoring.",
  "kri-dashboard":
    "Key Risk Indicator (KRI) dashboard report submitted. Confirm all RED-status KRIs have documented action plans with owners and resolution deadlines, KRI thresholds are approved by the MLRO, and the board reporting pack has been updated to reflect current KRI status. Any KRI in breach for more than 5 business days requires board escalation. Regulatory basis: FATF R.1 risk-based approach, FDL 10/2025.",
  "incident-runbook":
    "Incident response runbook review submitted. Confirm the runbook was last tested or table-top exercised within 6 months, all responsible officers are named and contacts are current, and escalation paths to MLRO, legal, and the regulator are documented. Any runbook not tested within 6 months must be re-certified by the MLRO before remaining active. Regulatory basis: SOC2 CC7.4, FDL 10/2025.",
  "reg-change":
    "Regulatory change management report submitted. Confirm all new regulatory obligations have been triaged, impact assessments completed, and implementation owners assigned with target dates. Any regulatory change unassigned for more than 14 days must be escalated to the MLRO. Material changes affecting core compliance processes require board notification.",
  // 14 · Routines
  "ongoing-monitor":
    "Ongoing monitoring report submitted. Confirm periodic re-screening completed for all active customers within their scheduled cadence (HIGH risk: quarterly, MEDIUM: bi-annual, LOW: annual), risk reclassifications reviewed by MLRO, and EDD triggered for any customer whose risk profile has materially elevated. Regulatory basis: FATF R.10 ongoing monitoring, FDL 10/2025 Art.18.",
  // 15 · MLRO Workbench
  "mlro-advisor":
    "MLRO Advisor session report submitted. Confirm AI-generated regulatory guidance has been reviewed by a qualified MLRO, all regulatory citations have been validated against the approved source list (no hallucinations accepted), and the MLRO's acknowledgement and any overriding assessment is recorded. AI-generated advice alone is never sufficient — human MLRO review is mandatory. Regulatory basis: FDL 10/2025 Art.18.",
  investigation:
    "Investigation report submitted. Confirm all evidence collected and documented, the applicable typology pattern identified and recorded, an internal suspicion report filed, and a SAR determination made by the MLRO. Investigations open beyond 60 days without material progress require senior MLRO review and written justification. Regulatory basis: FATF R.20, FDL 10/2025.",
  heatmap:
    "Geographic risk heatmap report submitted. Review high-risk jurisdiction exposure, country risk score changes since last review, and transaction volume by jurisdiction. Any newly added FATF grey-list or black-list jurisdiction requires immediate portfolio re-screening and enhanced monitoring. Regulatory basis: FATF R.1 jurisdiction risk, FDL 10/2025.",
  "brain-map":
    "Brain intelligence architecture report submitted. Confirm all 15 faculties are operational, model router circuit breaker is in CLOSED state, and attestation status for all registered models is CURRENT or DUE (not OVERDUE). Review any faculty with degraded performance metrics and trigger re-attestation where required. Regulatory basis: FDL 10/2025 Art.18 AI system integrity, NIST AI RMF.",
  "intelligence-hub":
    "Intelligence Hub unified compliance report submitted. Review cross-section health signals: false-positive rate, red-team pass rate, endpoint health, and brain drift status. All 9 hub sections must have been reviewed within the reporting period. Any signal in RED state requires documented MLRO response. Regulatory basis: FDL 10/2025 Art.18.",
  "intelligence-tools":
    "Intelligence tools governance report submitted. Confirm tool access permissions are reviewed and least-privilege, the usage audit log has been inspected for anomalous patterns, and API rate limits are within policy thresholds. Any anomalous usage pattern — bulk exports, off-hours access, or privilege escalation — requires immediate security team notification. Regulatory basis: FDL 10/2025 Art.18, SOC2 CC6.1.",
  "batch-screening":
    "Batch screening compliance report submitted. Confirm batch job completed with 100% subject coverage, hit rate is within the expected statistical range, and all MATCH_FOUND results are queued for individual MLRO review. No batch result may be bulk-cleared without per-record MLRO disposition. Regulatory basis: FDL 10/2025 Art.18 sanctions screening, FATF R.6.",
  "country-risk":
    "Country risk assessment report submitted. Review updated country risk scores, any FATF grey-list or black-list changes in the period, and the portfolio's exposure to elevated-risk jurisdictions. A risk score change of 2 or more tiers for any jurisdiction requires immediate customer re-assessment for affected relationships. Regulatory basis: FATF R.1, FDL 10/2025.",
  "country-risk-map":
    "Country risk map review submitted. Confirm geographic risk visualisation is current with the latest scoring cycle, jurisdiction scoring methodology is MLRO-approved, and all elevated-risk exposure areas are highlighted in the board reporting pack. Methodology changes must be approved by the MLRO and documented.",
  "sanctions-evasion":
    "Sanctions evasion detection report submitted. Review typology matches for layering, structuring, and vessel flag-hopping patterns. Confirm all evasion indicators have been investigated with documented rationale and a SAR filed where applicable. Confirmed evasion attempts must be reported to the competent authority without delay. Regulatory basis: FATF R.6, Cabinet Decision 74/2020.",
  "supply-chain":
    "Supply chain risk compliance report submitted. Confirm all tier-1 and tier-2 suppliers have been screened against sanctions and adverse media, high-risk supplier relationships reviewed by MLRO, and documented remediation plans are in place for all critical findings. Suppliers with unresolved HIGH-risk findings must be suspended pending MLRO clearance. Regulatory basis: UAE Ministerial Decision 68/2024, OECD DDG.",
  "analyst-behavior":
    "User and Entity Behaviour Analytics (UEBA) report submitted. Review analyst activity anomalies, privilege escalation alerts, unauthorised data access patterns, and off-hours system activity in the reporting period. Any alert scored HIGH must be investigated by the security team within 24 hours. Confirmed insider threat indicators require immediate MLRO and board notification. Regulatory basis: FDL 10/2025 Art.18, SOC2 CC7.4.",
  "intel-status":
    "Intelligence source health report submitted. Confirm all external data feeds are operational, last successful sync timestamps are within the defined SLA for each source, and any degraded or disconnected source has been escalated to the relevant vendor. Feed downtime exceeding 4 hours constitutes an operational incident requiring MLRO notification. Regulatory basis: FDL 10/2025 Art.18 system resilience.",
  // 16 · Supply Chain
  "vessel-check":
    "Vessel compliance check report submitted. Confirm AIS transponder status reviewed, flag state sanctions exposure assessed, full port-call history examined, and P&I club membership verified. Any dark vessel period (AIS off > 6 hours in open water) is a high-risk indicator requiring immediate reporting. Regulatory basis: FDL 10/2025 maritime provisions, OFAC vessel guidance.",
  // 17 · Export Control
  eocn:
    "EOCN trade compliance report submitted. Confirm dual-use goods classification completed, end-user certificate verified and on file, applicable export licence checked and valid, and denied party screening completed for all counterparties. Any shipment without a valid export licence for controlled goods must be held immediately. Regulatory basis: Federal export control decree, EU Dual-Use Regulation 2021/821.",
  // 18 · Regulator Portal
  "inspection-room":
    "Regulator inspection room report submitted. Confirm all documents requested by the competent authority are uploaded and accessible, regulator user access is granted only to authorised officials, and the full inspection interaction log is retained. Any regulator query left unanswered beyond 48 hours requires immediate MLRO escalation. All inspection records retained for 10 years. Regulatory basis: FDL 10/2025 Art.26-27, CR 134/2025.",
  // 19 · Incidents
  "grievances-whistleblowing":
    "Grievance and whistleblowing report submitted. Confirm all disclosures acknowledged within 5 business days, reporter confidentiality maintained throughout, and an investigation owner assigned with a documented timeline. Disclosures alleging criminal conduct must be reported to the competent authority. Unresolved disclosures beyond 30 days require board notification. Regulatory basis: FDL 10/2025 Art.18, UAE Whistleblower Protection provisions.",
  // Admin
  "admin-tenants":
    "Tenant administration report submitted. Confirm all active tenant configurations reviewed, API key rotation status verified, tenant-level access permissions audited, and any tenant with expired or compromised credentials suspended pending renewal. Multi-tenant isolation controls must be validated. Regulatory basis: SOC2 CC6.1, FDL 10/2025 Art.18 system access.",
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
  lines.push(`Legal basis : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
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
