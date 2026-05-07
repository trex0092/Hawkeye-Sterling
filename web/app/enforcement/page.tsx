"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import { IsoDateInput } from "@/components/ui/IsoDateInput";

interface Deadline {
  id: string;
  title: string;
  due: string; // YYYY-MM-DD
  authority: string;
  cadence: "annual" | "quarterly" | "monthly" | "ad-hoc";
  notes?: string;
}

/** "2026-05-31" → "31/05/2026" */
function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const DEADLINES: Deadline[] = [
  {
    id: "moe-annual",
    title: "MoE AML Compliance Annual Report",
    due: "2026-12-31",
    authority: "UAE MoE",
    cadence: "annual",
    notes:
      "DNFBP reporting-entity annual report. Due 31 December each year per MoE Circular 3/2025.",
  },
  {
    id: "fiu-recon",
    title: "FIU STR / SAR Quarterly Reconciliation",
    due: "2026-06-30",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Reconcile filed STRs against FIU-received list; investigate any mismatch within 30 days.",
  },
  {
    id: "lbma-audit",
    title: "LBMA Responsible Gold Guidance — Step-4 Audit",
    due: "2026-09-15",
    authority: "LBMA",
    cadence: "annual",
    notes:
      "Independent Step-4 audit against LBMA RGG v9. Auditor must be from the LBMA accredited list.",
  },
  {
    id: "cdd-review-tier1",
    title: "Tier-1 EDD Refresh Sweep",
    due: "2026-05-31",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Full EDD refresh on every active tier-1 PEP and high-risk customer. Board reviews output.",
  },
  {
    id: "sanctions-list-board",
    title: "Sanctions-List Effectiveness Board Review",
    due: "2026-07-15",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Board confirms false-positive rate ≤ 1.0% target and reviews any material list-refresh delays.",
  },
  {
    id: "training-renewal",
    title: "AML/CFT Staff Training Renewal Cycle",
    due: "2026-06-18",
    authority: "Internal",
    cadence: "annual",
    notes:
      "All AML/CFT team members must have completed refresher training within 12 months. Per FDL 10/2025 Art.16.",
  },
  {
    id: "eocn-declaration",
    title: "EOCN Annual Mineral Supply-Chain Declaration",
    due: "2026-03-31",
    authority: "EOCN",
    cadence: "annual",
    notes:
      "Annual responsible-sourcing declaration submitted to the Emirates Official Cargoes Network. Covers all upstream smelters and refiners per OECD Annex II 5-Step framework. Deadline 31 March.",
  },
  {
    id: "ubo-register",
    title: "UBO Register Annual Verification",
    due: "2026-06-30",
    authority: "UAE MoE / MOEC",
    cadence: "annual",
    notes:
      "Verify and re-file the Beneficial Ownership Register with the relevant authority. Any change in UBO must be reported within 15 business days per Cabinet Decision 58/2020.",
  },
  {
    id: "risk-appetite",
    title: "Risk Appetite Statement Annual Review",
    due: "2026-04-30",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Board reviews and re-approves the AML/CFT Risk Appetite Statement per FDL 10/2025 Art.4. Output feeds the Entity-Wide Risk Assessment update.",
  },
  {
    id: "board-aml-q2",
    title: "Board AML/CFT Quarterly Report — Q2 2026",
    due: "2026-07-31",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents quarterly AML/CFT metrics to the Board Audit Committee per FDL 10/2025 Art.15. Includes STR count, screening volumes, training status, and open corrective actions.",
  },
  {
    id: "goaml-test",
    title: "goAML System Connectivity & Version Test",
    due: "2026-05-15",
    authority: "UAE FIU",
    cadence: "annual",
    notes:
      "Annual end-to-end connectivity test of the goAML Web submission system. Confirm current software version, test report submission in sandbox, and update MLRO credentials. FIU technical bulletin TBN-2025-04.",
  },
  {
    id: "pf-risk-assessment",
    title: "Proliferation Financing Risk Assessment Update",
    due: "2026-07-31",
    authority: "Internal / CBUAE",
    cadence: "annual",
    notes:
      "Standalone PF risk assessment required under FATF R.1 and UAE National PF Risk Assessment 2024. Covers dual-use goods exposure, DPRK/Iran nexus, and effectiveness of targeted financial sanctions controls.",
  },
  {
    id: "tier2-cdd-review",
    title: "Tier-2 High-Risk CDD Periodic Review",
    due: "2026-09-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "CDD refresh for all high-risk (non-PEP) customers not refreshed in 12 months. Minimum: updated ID documents, re-run sanctions screen, refresh source-of-funds narrative. Per FDL 10/2025 Art.11.",
  },
  {
    id: "sanctions-system-test",
    title: "Sanctions Screening System Effectiveness Test",
    due: "2026-05-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Annual test of the automated sanctions screening engine using CBUAE-prescribed test names and entities. Measure false-negative rate; document results. CBUAE Guidance on Sanctions Compliance, para 4.3.",
  },
  {
    id: "cbuae-inspection",
    title: "CBUAE AML/CFT On-Site Inspection Readiness",
    due: "2026-08-31",
    authority: "CBUAE",
    cadence: "annual",
    notes:
      "Annual self-assessment against CBUAE AML/CFT inspection checklist. Remediate all findings rated 'needs improvement' before the window. Ensure board minutes, training records, STR register, and risk appetite statement are current and accessible.",
  },
  {
    id: "fiu-registration",
    title: "FIU goAML Registration Annual Renewal",
    due: "2026-06-15",
    authority: "UAE FIU",
    cadence: "annual",
    notes:
      "Renew the entity's goAML reporting-entity registration. Update MLRO contact details, confirm reporting categories (STR/SAR/CTR), and complete FIU's annual compliance declaration. Failure to renew suspends the ability to file.",
  },
  {
    id: "correspondent-review",
    title: "Correspondent Bank Questionnaire Annual Review",
    due: "2026-07-01",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Send updated CBQ to all correspondent banking partners. Receive and review responses within 30 days. Escalate any material AML/CFT control deficiency to the MLRO and terminate relationships with non-respondents per de-risking policy.",
  },
  {
    id: "dpms-licence",
    title: "DPMS Trade Licence Annual Renewal",
    due: "2026-11-30",
    authority: "UAE MoE / MOEC",
    cadence: "annual",
    notes:
      "Renew the entity's DPMS trade licence with the relevant emirate authority. Confirm AML/CFT compliance declaration, updated UBO information, and paid regulatory fee. Lapsed licence triggers automatic suspension of precious-metal dealing.",
  },
  {
    id: "internal-audit-aml",
    title: "Internal Audit — AML/CFT Controls Review",
    due: "2026-10-31",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Independent internal audit of AML/CFT programme effectiveness covering: CDD file quality, STR triage timelines, sanctions screening coverage, training completion, and board reporting. Output presented to Audit Committee. Corrective-action plan due within 60 days of report.",
  },
  {
    id: "str-quality-board",
    title: "STR Quality Review — Board Presentation",
    due: "2026-07-31",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents Q2 STR quality metrics: filing timeliness, FIU feedback received, false-positive rate, and lessons-learned from any declined or returned reports. Board confirms MLRO resource adequacy. Per FDL 10/2025 Art.15.",
  },
  {
    id: "risk-model-validation",
    title: "Customer Risk Scoring Model Annual Validation",
    due: "2026-09-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Independent validation of the customer risk-scoring model (tier assignment, risk factors, weighting). Confirm model is calibrated against current FATF/CBUAE typologies. Document validation results and any recalibration. Model changes require MLRO and Board approval before deployment.",
  },
  {
    id: "adverse-media-review",
    title: "Adverse Media Monitoring Review",
    due: "2026-06-30",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Review coverage and quality of adverse-media monitoring for all tier-1 and tier-2 customers. Confirm keyword lists are current, source languages cover customer geographies, and alert-handling SLA (48h triage) is being met. Present hit-rate statistics to MLRO.",
  },
  {
    id: "ewra-update",
    title: "Entity-Wide Risk Assessment Annual Update",
    due: "2026-04-30",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Full update of the Entity-Wide Risk Assessment (EWRA) incorporating changes in customer mix, product/service scope, geography, and delivery channels. Residual-risk ratings reviewed against the risk appetite statement. Board approval required before circulation. Per FATF R.1 and UAE National Risk Assessment 2024.",
  },
  {
    id: "pf-targeted-sanctions",
    title: "Proliferation Financing Targeted Sanctions Controls Audit",
    due: "2026-08-15",
    authority: "Internal / CBUAE",
    cadence: "annual",
    notes:
      "Audit of TFS controls specific to proliferation financing: DPRK / Iran / Syria nexus detection, dual-use goods screening, export-control cross-checks. Review automated detection rules and manual override logs. Report to MLRO and Board within 15 days of audit completion.",
  },
  {
    id: "board-aml-q3",
    title: "Board AML/CFT Quarterly Report — Q3 2026",
    due: "2026-10-31",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents Q3 AML/CFT metrics to the Board Audit Committee. Includes STR count YTD, sanctions alert volumes, training completion rate, open audit findings, and corrective-action status. Board approves any material policy amendments tabled.",
  },
  {
    id: "board-aml-q4",
    title: "Board AML/CFT Quarterly Report — Q4 2026",
    due: "2027-01-31",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents Q4 and full-year AML/CFT metrics to the Board Audit Committee. Includes annual STR count, false-positive trend, training completion, closed corrective actions, and EWRA status. Board approves the AML programme plan for the coming year.",
  },
  {
    id: "board-policy-approval",
    title: "Annual AML/CFT Policy Suite Board Approval",
    due: "2026-12-15",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Full AML/CFT policy suite reviewed and re-approved by the Board annually before 15 December. Includes MLRO Charter, Risk Appetite Statement, Sanctions Policy, PEP Policy, CAP, and all sector-specific policies. All changes from the prior year marked and documented. Board minutes reference each policy and version number.",
  },
  {
    id: "mlro-annual-report",
    title: "MLRO Annual Report to Board",
    due: "2026-11-30",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Comprehensive annual report by the MLRO to the Board covering: STR filings YTD, open investigations, resource adequacy, training status, regulator correspondence, control deficiencies, and proposed programme improvements. Per FDL 10/2025 Art.15. Board provides written acknowledgement within 15 days.",
  },
  {
    id: "data-retention-audit",
    title: "Data Retention & Destruction Audit",
    due: "2026-09-15",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Annual audit to confirm: (1) all records required to be retained under FDL 10/2025 Art.24 are stored and accessible; (2) records older than 10 years from end of relationship are securely destroyed per the data destruction schedule; (3) destruction logs are maintained and reviewed by the MLRO. Report findings to the Data Protection Officer and Board Audit Committee.",
  },
  {
    id: "outsourcing-register",
    title: "Outsourcing Register Annual Review",
    due: "2026-11-15",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "MLRO reviews the outsourcing register to confirm: all AML/CFT outsourcing arrangements are documented, third-party providers have been assessed against annual risk criteria, and written agreements are current. Any provider failing the assessment is placed on a remediation or exit plan. Board approval required for any new outsourcing arrangement. Per FDL 10/2025 and CBUAE Outsourcing Guidance.",
  },
  {
    id: "aml-programme-effectiveness",
    title: "AML Programme Effectiveness Review",
    due: "2026-10-15",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Annual assessment of overall AML programme effectiveness including: alert-to-STR conversion rate, CDD quality scores, screening coverage, training completion, and internal-audit open findings. Benchmarked against FATF Immediate Outcomes 3, 4, and 6. MLRO prepares written effectiveness statement for the Board. Gaps must have a documented remediation plan with target dates.",
  },
  {
    id: "fatf-self-assessment",
    title: "FATF Technical Compliance Self-Assessment",
    due: "2026-12-01",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Annual internal self-assessment against FATF 40 Recommendations, scored using the four-level FATF methodology (NC / PC / LC / C). Focus Recommendations: R.10 (CDD), R.11 (record-keeping), R.12 (PEPs), R.15 (new technologies), R.16 (wire transfers), R.24/25 (beneficial ownership). Results reviewed by MLRO and presented to the Board. Gaps fed into the following year's AML programme plan.",
  },
  {
    id: "dpmsr-q2",
    title: "DPMSR Quarterly Filing Reconciliation — Q2 2026",
    due: "2026-07-15",
    authority: "UAE MoE",
    cadence: "quarterly",
    notes:
      "Reconcile all DPMSR-eligible transactions from Q2 (April–June 2026) against filings submitted to MoE. Confirm no qualifying transaction was missed. Any gap must be remediated with a late filing and documented MLRO explanation. Per MoE Circular 2/2024 and FDL 10/2025 Art.17.",
  },
  {
    id: "dpmsr-q3",
    title: "DPMSR Quarterly Filing Reconciliation — Q3 2026",
    due: "2026-10-15",
    authority: "UAE MoE",
    cadence: "quarterly",
    notes:
      "Reconcile all DPMSR-eligible transactions from Q3 (July–September 2026) against filings submitted to MoE. Confirm no qualifying transaction was missed. Any gap must be remediated with a late filing and documented MLRO explanation. Per MoE Circular 2/2024.",
  },
  {
    id: "mlro-succession-review",
    title: "MLRO Succession & Continuity Plan Review",
    due: "2026-08-31",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Board reviews the MLRO Succession Plan and confirms the designated Deputy MLRO is appropriately qualified and authorised. Plan covers: notification timelines to CBUAE / MoE, handover procedures, access continuity, and interim reporting lines. Reviewed and approved by Board Audit Committee. Any vacancy in the MLRO role triggers an immediate Board notification to regulators within 30 days per FDL 10/2025 Art.15(5).",
  },
  {
    id: "correspondent-q3",
    title: "Correspondent Bank Quarterly Monitoring Review",
    due: "2026-10-01",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Quarterly review of transaction volumes and patterns across all correspondent bank channels. Flag material deviations from baseline, any new high-risk payment corridors, and outstanding CBQ responses. MLRO signs off on the review. Results feed the annual correspondent bank questionnaire renewal cycle.",
  },
  {
    id: "board-aml-q1-2027",
    title: "Board AML/CFT Quarterly Report — Q1 2027",
    due: "2027-04-30",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents Q1 2027 AML/CFT metrics to the Board Audit Committee. Covers STR filings, sanctions alerts, CDD completion rate, training status, and corrective-action progress. First board meeting of 2027 AML programme cycle.",
  },
  {
    id: "va-risk-assessment",
    title: "Virtual Assets Risk Assessment Update",
    due: "2026-08-31",
    authority: "Internal / VARA",
    cadence: "annual",
    notes:
      "Annual update of the Virtual Assets risk assessment covering: new protocol/token exposure, Travel Rule compliance gaps, VASP counterparty risk changes, and on-chain analytics tool adequacy. Benchmarked against FATF R.15 and VARA Regulations 2023. Board approval required before deployment of any new VA product or service line.",
  },
  {
    id: "dpmsr-q1",
    title: "DPMSR Q1 Filing Reconciliation",
    due: "2026-04-30",
    authority: "UAE MoE",
    cadence: "quarterly",
    notes:
      "Reconcile all DPMSR-eligible transactions from Q1 (January–March 2026) against MoE filings. Confirm no qualifying transaction was missed. Late filings must be submitted with MLRO-signed explanatory memo. Per MoE Circular 2/2024.",
  },
  {
    id: "dpmsr-q4",
    title: "DPMSR Q4 Filing Reconciliation",
    due: "2027-01-15",
    authority: "UAE MoE",
    cadence: "quarterly",
    notes:
      "Reconcile all DPMSR-eligible transactions from Q4 (October–December 2026) against MoE filings. Full-year summary report attached. MLRO countersigns year-end DPMSR register. Per MoE Circular 2/2024.",
  },
  {
    id: "pep-refresh-h1",
    title: "PEP Portfolio Semi-Annual EDD Refresh",
    due: "2026-06-30",
    authority: "Internal",
    cadence: "ad-hoc",
    notes:
      "Full EDD refresh on all active PEP-classified customers (Tier 1 and 2). Includes: re-run sanctions screen, updated source-of-wealth narrative, adverse-media review for the prior 6 months, and relationship profitability vs risk assessment. MLRO sign-off required for each file. Files not refreshed within 30 days of due date trigger automatic escalation.",
  },
  {
    id: "pep-refresh-h2",
    title: "PEP Portfolio Semi-Annual EDD Refresh — H2",
    due: "2026-12-31",
    authority: "Internal",
    cadence: "ad-hoc",
    notes:
      "Second semi-annual EDD refresh on all active PEP-classified customers. H2 refresh additionally includes annual relationship review meeting notes and confirmation of continued senior-management approval per FDL 10/2025 Art.17.",
  },
  {
    id: "oecd-step4-audit",
    title: "OECD Step-4 Supply-Chain Audit Commissioning",
    due: "2026-06-01",
    authority: "LBMA / Internal",
    cadence: "annual",
    notes:
      "Commission the independent LBMA-accredited Step-4 audit for delivery by 15 September 2026. Scope must cover: due diligence systems, supply-chain mapping, grievance mechanism, and corrective actions from prior year. Auditor must be on the LBMA accredited auditor list. Audit contract signed and scope agreed by this date.",
  },
  {
    id: "fatf-grey-list-review",
    title: "FATF Grey/Black-List Customer Exposure Review",
    due: "2026-05-31",
    authority: "Internal",
    cadence: "ad-hoc",
    notes:
      "Following each FATF plenary (February, June, October), review customer and counterparty base for exposure to newly listed or delisted jurisdictions. Update risk-scoring model for affected customers within 30 days. Escalate any new high-risk exposure to MLRO. Results documented in the EWRA update.",
  },
  {
    id: "fatf-plenary-oct",
    title: "FATF Plenary — October 2026 List Update Review",
    due: "2026-11-30",
    authority: "Internal",
    cadence: "ad-hoc",
    notes:
      "Review FATF October plenary outcomes. Update customer risk scores for any jurisdiction changes within 30 days. Notify Board of any material new exposure within 5 business days of list publication.",
  },
  {
    id: "goaml-sar-reconcile-q1",
    title: "goAML SAR/STR Quarterly Reconciliation — Q1 2026",
    due: "2026-04-30",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Reconcile all STRs/SARs filed via goAML in Q1 against the MLRO's internal case register. Investigate any discrepancy — missing or duplicate filings — within 10 business days. Confirm FIU acknowledgement receipts are on file for each submission. Per CR 134/2025 Art.18.",
  },
  {
    id: "goaml-sar-reconcile-q3",
    title: "goAML SAR/STR Quarterly Reconciliation — Q3 2026",
    due: "2026-10-31",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Reconcile all STRs/SARs filed via goAML in Q3 against the MLRO's internal case register. Investigate discrepancies within 10 business days. Confirm all FIU acknowledgement receipts are filed. Prepare Q3 STR quality metrics for Q3 Board report.",
  },
  {
    id: "cdd-standard-refresh",
    title: "Standard-Risk CDD Annual Refresh Sweep",
    due: "2026-11-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "CDD refresh for all standard-risk customers whose files have not been updated in 24 months. Minimum: re-run sanctions screen, confirm contact details, review transaction profile. Files found materially changed trigger a full re-KYC within 30 days. MLRO reviews summary report of sweep outcomes.",
  },
  {
    id: "sanctions-list-q1-review",
    title: "Sanctions Screening Configuration Q1 Review",
    due: "2026-04-15",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Quarterly review of sanctions screening configuration: confirm all 7 list adapters (OFAC SDN, UN Consolidated, EU FSF, UK OFSI, UAE EOCN, UAE LTL, OFAC Cons) are active and refreshing on schedule. Review false-positive rate against 1.0% target. Adjust fuzzy-match threshold if required. MLRO approves any threshold changes.",
  },
  {
    id: "sanctions-list-q4-review",
    title: "Sanctions Screening Configuration Q4 Review",
    due: "2026-10-15",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Q4 sanctions configuration review including year-end calibration. Prepare summary of list-refresh SLA performance for the year. Flag any periods where any list was stale > 24h. Results included in MLRO Annual Report and FATF self-assessment.",
  },
  {
    id: "training-assessment",
    title: "AML/CFT Staff Training Assessment & Certification",
    due: "2026-09-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "All staff with AML/CFT responsibilities must complete the annual assessment with a passing score of ≥ 80%. Training register updated within 5 business days of completion. Non-completions escalated to line manager and MLRO. Staff who fail twice in 12 months are restricted from AML-sensitive system access. Board members complete AML awareness e-learning separately.",
  },
  {
    id: "new-product-approval",
    title: "New Product / Service AML Risk Sign-Off — Annual Review",
    due: "2026-07-31",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Annual review of all new products, services, or delivery channels launched in the prior 12 months. Confirm each received a pre-launch AML/CFT risk assessment per FDL 10/2025 Art.6. Any product launched without documented risk assessment triggers a retrospective assessment and board disclosure.",
  },
  {
    id: "de-risking-review",
    title: "Customer De-risking & Exit Register Annual Review",
    due: "2026-10-31",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Annual review of all customer exits and de-risking decisions made in the prior 12 months. Confirm each exit was documented with MLRO rationale, that no tipping-off occurred, and that STR was filed where required. Review de-risking decisions for consistency and potential discriminatory patterns. Report to Board Audit Committee.",
  },
  {
    id: "insider-threat-audit",
    title: "Insider Threat & Internal Controls Annual Audit",
    due: "2026-09-30",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Annual internal audit of insider-threat controls: system access logs, four-eyes compliance, manual override records, and whistleblower report register. Identify any employee with unusual access patterns or unreviewed overrides. Corrective actions due within 60 days. Report to Audit Committee with MLRO co-signature.",
  },
  {
    id: "pbf-risk-update",
    title: "Proliferation Finance Controls Bi-Annual Review",
    due: "2026-06-30",
    authority: "Internal / CBUAE",
    cadence: "ad-hoc",
    notes:
      "Mid-year review of proliferation financing controls following FATF plenary updates. Confirm DPRK, Iran, Syria, Belarus nexus detection rules are current. Cross-check dual-use goods screening parameters against latest export-control commodity lists. MLRO certifies controls are adequate. Results presented to Board.",
  },
  {
    id: "pdpl-annual-audit",
    title: "PDPL Data Protection Annual Audit",
    due: "2026-12-31",
    authority: "UAE MoJ / Internal",
    cadence: "annual",
    notes:
      "Annual audit of compliance with Federal Decree-Law No. 45/2021 on Personal Data Protection (PDPL). Scope: lawful basis mapping for all processing activities, data-subject rights request register (access, correction, erasure, portability), consent management records, cross-border transfer controls, and privacy-impact assessments for any new processing introduced in the year. DPO certifies compliance. Material gaps reported to Board within 30 days.",
  },
  {
    id: "env-crime-controls-review",
    title: "Environmental-Crime Predicate Controls Review",
    due: "2026-09-30",
    authority: "Internal / FATF",
    cadence: "annual",
    notes:
      "Annual review of controls for the FATF 2021 environmental-crime predicate offences: illegal mining, illegal logging, IUU fishing, waste trafficking, and wildlife trafficking. Confirm adverse-keyword classifiers cover all sub-categories, red-flag rules include CAHRA/supply-chain provenance checks, and transaction-monitoring thresholds for environmental-predicate nexus are calibrated. MLRO reviews ESG classifier coverage and certifies adequacy. Results documented in EWRA.",
  },
  {
    id: "board-aml-q1-2026",
    title: "Board AML/CFT Quarterly Report — Q1 2026",
    due: "2026-04-30",
    authority: "Board / FDL 10/2025",
    cadence: "quarterly",
    notes:
      "Q1 2026 quarterly AML/CFT report to Board. Mandatory contents per FDL 10/2025 and CR 134/2025: STR/SAR filing statistics, screening volumes and false-positive rate, CDD queue status, sanctions list effectiveness metrics, training completion rate, open corrective actions, and MLRO attestation. Board must formally acknowledge receipt. Signed minutes retained for 10 years.",
  },
  {
    id: "eu-ai-act-review",
    title: "EU AI Act High-Risk System Compliance Review",
    due: "2026-08-02",
    authority: "EU AI Act / Internal",
    cadence: "annual",
    notes:
      "Annual review of all AI systems deployed in AML/CFT workflows classified as high-risk under the EU AI Act (Annex III). Scope: conformity assessment documentation, technical specifications, fundamental-rights impact assessment, post-market monitoring logs, and human-oversight controls. Any AI system lacking a current conformity assessment must be suspended. Board approves final report before deadline.",
  },
  {
    id: "ai-model-card-sbom",
    title: "AI Model Card & SBOM Annual Publication",
    due: "2026-09-30",
    authority: "ISO/IEC 42001 / Internal",
    cadence: "annual",
    notes:
      "Annual publication of model cards and software bills of materials (SBOM) for all AI models used in screening, adverse-media classification, and risk scoring. Model cards must document training data provenance, bias-testing results, performance metrics, and known limitations. SBOMs must enumerate all open-source dependencies with version and licence. Published to internal governance portal; summary disclosed to regulators on request.",
  },
  {
    id: "vasp-travel-rule-audit",
    title: "VASP / Crypto Travel Rule Compliance Audit",
    due: "2026-06-30",
    authority: "FATF R.15 / CBUAE",
    cadence: "annual",
    notes:
      "Annual audit of Travel Rule (FATF R.16) compliance for all virtual asset transfers above USD 1,000. Scope: originator/beneficiary data completeness rate, VASP counterparty due-diligence register, sunrise-issue handling procedures, and Travel Rule messaging protocol (IVMS 101) accuracy. Confirm CBUAE VARA rulebook requirements are met. MLRO certifies <2 % data-completeness failure rate. Gaps must be remediated within 90 days.",
  },
  {
    id: "carbon-vcm-controls",
    title: "Carbon-Credit / VCM Integrity Controls Review",
    due: "2026-07-31",
    authority: "ICVCM / Internal",
    cadence: "annual",
    notes:
      "Annual review of controls for voluntary carbon market (VCM) instruments: carbon credits, renewable-energy certificates, and Article 6 Kyoto/Paris transfers. Confirm registry reconciliation against ICVCM Core Carbon Principles, screen for double-counting anomalies (A6 transfers issued to multiple registries), and verify that counterparties are not on adverse-media or sanctions lists for greenwashing or carbon fraud. MLRO reviews findings; material risks escalated to Board.",
  },
  {
    id: "deepfake-defence-test",
    title: "Deepfake / Synthetic-ID Defence Test",
    due: "2026-08-31",
    authority: "Internal / CBUAE",
    cadence: "annual",
    notes:
      "Annual red-team exercise testing resilience of the KYC pipeline against deepfake video, voice-clone liveness bypass, and AI-generated document forgery. Scope: liveness-detection vendor evaluation, document-authenticity classifier performance, and manual-review escalation triggers. At least 50 synthetic-ID attack samples per modality. Pass threshold: <5 % bypass rate. Results reported to MLRO and Head of Technology; vendor SLAs updated where performance is inadequate.",
  },
  {
    id: "goaml-sar-reconcile-q2",
    title: "goAML SAR/STR Reconciliation — Q2 2026",
    due: "2026-07-31",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Q2 2026 reconciliation of Suspicious Activity Reports (SAR) and Suspicious Transaction Reports (STR) submitted via goAML. Confirm all internal SARs/STRs generated between 1 April and 30 June 2026 are reflected in the goAML portal with correct schema (goAML XML v4.0+), acknowledgement receipts archived, and no pending submissions older than 15 business days. MLRO signs reconciliation certificate. Discrepancies reported to UAE FIU within 5 business days.",
  },
  {
    id: "goaml-sar-reconcile-q4",
    title: "goAML SAR/STR Reconciliation — Q4 2026",
    due: "2027-01-31",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Q4 2026 reconciliation of Suspicious Activity Reports (SAR) and Suspicious Transaction Reports (STR) submitted via goAML. Confirm all internal SARs/STRs generated between 1 October and 31 December 2026 are reflected in the goAML portal with correct schema, acknowledgement receipts archived, and no pending submissions older than 15 business days. MLRO signs reconciliation certificate. Annual goAML performance summary also compiled for Board year-end report.",
  },
  {
    id: "wire-transfer-travel-rule-test",
    title: "Wire Transfer & Travel Rule Monthly Test",
    due: "2026-05-31",
    authority: "FATF R.16 / CBUAE",
    cadence: "monthly",
    notes:
      "Monthly end-to-end test of wire transfer originator/beneficiary data capture and Travel Rule messaging (FATF R.16). Test suite: 20 synthetic cross-border transfers above USD 1,000, 10 below threshold, and 5 with deliberately incomplete originator data. Confirm SWIFT MT103 / ISO 20022 pacs.008 fields are populated, incomplete transfers are quarantined, and downstream beneficiary institution acknowledges receipt within SLA. Pass threshold: 100 % data-completeness on above-threshold transfers. Results logged in compliance monitoring register.",
  },
  {
    id: "fatf-plenary-feb-2026",
    title: "FATF Plenary — February 2026 List Update Review",
    due: "2026-03-31",
    authority: "Internal / FATF",
    cadence: "ad-hoc",
    notes:
      "Post-plenary review of any changes to the FATF grey list (Jurisdictions under Increased Monitoring) and black list (High-Risk Jurisdictions subject to a Call for Action) announced at the February 2026 FATF plenary session. Scope: update jurisdiction-risk ratings in the EWRA, recalibrate enhanced due-diligence triggers for newly listed countries, and confirm any de-listed jurisdictions are updated before over-screening creates operational drag. MLRO communicates changes to business within 10 business days of plenary publication.",
  },
];

function daysUntil(iso: string): number {
  return Math.round(
    (Date.parse(iso) - Date.now()) / (24 * 60 * 60 * 1_000),
  );
}

// User-saved overlays (deletes + custom additions) persist to localStorage so
// the operator's working calendar survives reload. The seeded DEADLINES
// constant stays the regulator-published baseline; user changes are layered
// on top and never mutate the seed.
const STORAGE_KEY = "hawkeye.enforcement.overlay.v1";

interface Overlay {
  deletedIds: string[];
  custom: Deadline[];
}

const EMPTY_OVERLAY: Overlay = { deletedIds: [], custom: [] };

function loadOverlay(): Overlay {
  if (typeof window === "undefined") return EMPTY_OVERLAY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_OVERLAY;
    const parsed = JSON.parse(raw) as Partial<Overlay>;
    return {
      deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch (err) {
    console.warn("[hawkeye] enforcement overlay parse failed — using empty:", err);
    return EMPTY_OVERLAY;
  }
}

function saveOverlay(o: Overlay): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (err) {
    console.error("[hawkeye] enforcement overlay persist failed — edits will be lost on reload:", err);
  }
}

export default function EnforcementPage() {
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<Deadline, "id">>({
    title: "", due: "", authority: "", cadence: "ad-hoc", notes: "",
  });

  // Hydrate from localStorage on mount only — avoids SSR mismatch.
  useEffect(() => {
    setOverlay(loadOverlay());
  }, []);

  const sorted = useMemo(() => {
    const live = [...DEADLINES, ...overlay.custom].filter(
      (d) => !overlay.deletedIds.includes(d.id),
    );
    return live.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  }, [overlay]);

  const startEdit = (d: Deadline) => {
    setEditingId(d.id);
    setEditDraft({ title: d.title, due: d.due, authority: d.authority, cadence: d.cadence, notes: d.notes ?? "" });
  };

  const saveEdit = (id: string) => {
    setOverlay((prev) => {
      const isCustom = prev.custom.some((d) => d.id === id);
      let next: Overlay;
      if (isCustom) {
        next = { ...prev, custom: prev.custom.map((d) => d.id === id ? { id, ...editDraft } : d) };
      } else {
        next = {
          ...prev,
          deletedIds: prev.deletedIds.includes(id) ? prev.deletedIds : [...prev.deletedIds, id],
          custom: [...prev.custom, { id, ...editDraft }],
        };
      }
      saveOverlay(next);
      return next;
    });
    setEditingId(null);
  };

  const onDelete = (id: string) => {
    setOverlay((prev) => {
      // If it's a custom entry, drop it from `custom`. Otherwise add to
      // `deletedIds` so the seed is hidden without mutating the constant.
      const isCustom = prev.custom.some((d) => d.id === id);
      const next: Overlay = isCustom
        ? { ...prev, custom: prev.custom.filter((d) => d.id !== id) }
        : prev.deletedIds.includes(id)
          ? prev
          : { ...prev, deletedIds: [...prev.deletedIds, id] };
      saveOverlay(next);
      return next;
    });
  };

  const onAdd = (entry: Deadline) => {
    setOverlay((prev) => {
      const next: Overlay = { ...prev, custom: [...prev.custom, entry] };
      saveOverlay(next);
      return next;
    });
  };

  const onResetDeletes = () => {
    setOverlay((prev) => {
      const next: Overlay = { ...prev, deletedIds: [] };
      saveOverlay(next);
      return next;
    });
  };

  return (
    <ModuleLayout asanaModule="enforcement" asanaLabel="Enforcement">
        <ModuleHero
          moduleNumber={25}
          eyebrow="Module 18 · Regulatory calendar"
          title="Enforcement"
          titleEm="tracker."
          intro={
            <>
              <strong>Every regulator-mandated deadline in one place.</strong>{" "}
              MoE annual reports, FIU quarterly reconciliations, LBMA Step-4
              audits, internal EDD sweeps — sorted by due date, colour-coded
              by urgency. Overdue items require MLRO escalation under FDL 10/2025 Art.15.
            </>
          }
          kpis={[
            {
              value: String(sorted.filter((d) => daysUntil(d.due) < 0).length),
              label: "overdue",
              tone: sorted.some((d) => daysUntil(d.due) < 0) ? "red" : undefined,
            },
            {
              value: String(sorted.filter((d) => daysUntil(d.due) >= 0 && daysUntil(d.due) <= 30).length),
              label: "due in 30 days",
              tone: sorted.some((d) => daysUntil(d.due) >= 0 && daysUntil(d.due) <= 30) ? "amber" : undefined,
            },
            { value: String(sorted.length), label: "total deadlines" },
          ]}
        />

        <div className="mt-4 flex justify-end">
          <AddDeadlineForm onAdd={onAdd} />
        </div>

        {overlay.deletedIds.length > 0 && (
          <div className="mt-4 flex items-center justify-between bg-amber-dim border border-amber/30 rounded-lg px-3 py-2">
            <div className="font-mono text-10 text-amber">
              {overlay.deletedIds.length} deadline
              {overlay.deletedIds.length === 1 ? "" : "s"} hidden from the
              regulator-seeded list
            </div>
            <button
              type="button"
              onClick={onResetDeletes}
              className="font-mono text-10 uppercase tracking-wide-3 px-2 py-1 rounded border border-amber/40 text-amber hover:bg-amber/10 transition-colors"
            >
              Restore all
            </button>
          </div>
        )}

        <div className="mt-6 space-y-2">
          {sorted.map((d) => {
            const days = daysUntil(d.due);
            const tone =
              days < 0
                ? "bg-red-dim text-red"
                : days <= 14
                  ? "bg-amber-dim text-amber"
                  : days <= 60
                    ? "bg-blue-dim text-blue"
                    : "bg-green-dim text-green";
            const label =
              days < 0
                ? `${Math.abs(days)}d overdue`
                : days === 0
                  ? "today"
                  : `in ${days}d`;
            const isCustom = overlay.custom.some((c) => c.id === d.id);
            return (
              <div
                key={d.id}
                className="bg-bg-panel border border-hair-2 rounded-lg p-4 relative"
              >
                {editingId === d.id ? (
                  <div className="space-y-2 pr-7">
                    <input
                      className="w-full text-12 px-2 py-1.5 rounded border border-brand bg-bg-0 text-ink-0"
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      placeholder="Title"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                        value={editDraft.authority}
                        onChange={(e) => setEditDraft({ ...editDraft, authority: e.target.value })}
                        placeholder="Authority"
                      />
                      <IsoDateInput
                        className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                        value={editDraft.due}
                        onChange={(iso) => setEditDraft({ ...editDraft, due: iso })}
                      />
                      <select
                        className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                        value={editDraft.cadence}
                        onChange={(e) => setEditDraft({ ...editDraft, cadence: e.target.value as Deadline["cadence"] })}
                      >
                        <option value="annual">annual</option>
                        <option value="quarterly">quarterly</option>
                        <option value="monthly">monthly</option>
                        <option value="ad-hoc">ad-hoc</option>
                      </select>
                    </div>
                    <input
                      className="w-full text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                      value={editDraft.notes ?? ""}
                      onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                      placeholder="Notes (optional)"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveEdit(d.id)}
                        className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">✓</button>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="text-11 font-medium px-3 py-1 rounded text-red">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3 mb-1 pr-7">
                      <h3 className="text-13 font-semibold text-ink-0 m-0">
                        {d.title}
                        {isCustom && (
                          <span className="ml-2 align-middle font-mono text-10 px-1.5 py-0.5 rounded bg-brand-dim text-brand border border-brand-line">
                            custom
                          </span>
                        )}
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 font-semibold uppercase whitespace-nowrap ${tone}`}>
                        {label}
                      </span>
                    </div>
                    <div className="font-mono text-10 text-ink-3 mb-2">
                      {d.authority} · due {fmtDate(d.due)} · {d.cadence}
                    </div>
                    {d.notes && (
                      <p className="text-11 text-ink-2 m-0 leading-relaxed">{d.notes}</p>
                    )}
                  </>
                )}
                <div className="absolute top-2 right-2 z-10">
                  <RowActions
                    label={d.title}
                    onEdit={() => startEdit(d)}
                    onDelete={() => onDelete(d.id)}
                    confirmDelete={false}
                  />
                </div>
              </div>
            );
          })}
        </div>

    </ModuleLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Add-deadline form. Renders at the very bottom of the page so operators
// can drop in ad-hoc supervisor circulars, board commitments, or one-off
// audit items that aren't on the regulator-seeded baseline.
// ─────────────────────────────────────────────────────────────────────
function AddDeadlineForm({ onAdd }: { onAdd: (d: Deadline) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [authority, setAuthority] = useState("");
  const [due, setDue] = useState("");
  const [cadence, setCadence] = useState<Deadline["cadence"]>("ad-hoc");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setAuthority("");
    setDue("");
    setCadence("ad-hoc");
    setNotes("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Title is required");
    if (!authority.trim()) return setError("Authority is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError("Due date must be YYYY-MM-DD");
    if (Number.isNaN(Date.parse(due))) return setError("Due date is not a valid calendar date");
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: Deadline = {
      id,
      title: title.trim(),
      due,
      authority: authority.trim(),
      cadence,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    onAdd(entry);
    reset();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-11 uppercase tracking-wide-3 px-4 py-2 rounded-lg border border-brand-line bg-brand-dim text-brand hover:bg-brand hover:text-white transition-colors"
      >
        + Add a deadline
      </button>
    );
  }

  const inputCls =
    "w-full bg-bg-1 border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 focus:border-brand focus:outline-none";
  const labelCls = "block font-mono text-10 uppercase tracking-wide-3 text-ink-3 mb-1";

  return (
    <form
      onSubmit={submit}
      className="bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-3 w-80"
    >
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-12 font-semibold text-ink-0 m-0">
          Add a deadline
        </h4>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="font-mono text-10 text-ink-3 hover:text-ink-0"
        >
          cancel
        </button>
      </div>

      <div>
        <label className={labelCls}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Internal CDD sample audit — Q3"
          className={inputCls}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Authority</label>
          <input
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
            placeholder="e.g. Internal / MoE / FIU / EOCN / LBMA"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Due date</label>
          <IsoDateInput
            value={due}
            onChange={setDue}
            className={inputCls}
            required
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Cadence</label>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as Deadline["cadence"])}
          className={inputCls}
        >
          <option value="ad-hoc">ad-hoc</option>
          <option value="monthly">monthly</option>
          <option value="quarterly">quarterly</option>
          <option value="annual">annual</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Citation, scope, owner, anything that helps the next reviewer."
          className={`${inputCls} min-h-[72px] leading-relaxed`}
        />
      </div>

      {error && (
        <div className="font-mono text-10 text-red bg-red-dim border border-red/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          className="font-mono text-11 uppercase tracking-wide-3 px-4 py-1.5 rounded border border-brand bg-brand text-white hover:bg-brand-dark transition-colors"
        >
          Add deadline
        </button>
      </div>
    </form>
  );
}
