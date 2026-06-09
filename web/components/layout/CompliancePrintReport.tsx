"use client";

import { usePathname } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────
// CompliancePrintReport
//
// Renders a full, regulator-grade compliance report body for the current
// module. Invisible on screen (class `compliance-print-report` → display:none)
// and revealed only when the operator prints / exports to PDF (the
// `@media print` rule in globals.css flips it to display:block).
//
// One entry per route in REPORTS. Each report carries an executive summary,
// the governing regulatory framework, the institution's compliance
// requirements, the automated monitoring controls the module provides, the
// reporting obligations it discharges, and the key risk indicators it
// surfaces. Content is UAE AML/CFT-specific (FDL 20/2018, FDL 10/2025,
// Cabinet Decision 10/2019, FATF, CBUAE) and runs 250–500 words per module.
// ─────────────────────────────────────────────────────────────────────────

interface ReportData {
  title: string;
  summary: string[];
  regulatory: string[];
  requirements: string[];
  controls: string[];
  reporting: string[];
  risks: string[];
}

const REPORTS: Record<string, ReportData> = {
  // ════════════════════════ ONBOARDING & CDD ════════════════════════
  "/governance/grievances-whistleblowing": {
    title: "Grievances & Whistleblowing",
    summary: [
      "The Grievances & Whistleblowing module operationalises the institution's protected-disclosure regime, providing a confidential, retaliation-proof channel through which employees, customers, and third parties can report suspected money laundering, terrorist financing, sanctions evasion, or internal misconduct. Each report is logged to the immutable audit chain at the point of receipt, assigned a unique case reference, and routed to the Money Laundering Reporting Officer (MLRO) for triage independent of any line management that might be implicated.",
      "By separating intake from investigation and enforcing anonymity by default, the module discharges the institution's obligation to maintain effective internal controls and to protect persons who report suspicions in good faith. It forms the human-intelligence complement to the platform's automated screening and monitoring faculties.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.15 — protection of persons reporting suspicions in good faith",
      "UAE Cabinet Decision No.10/2019 Art.20 — internal policies, controls and procedures",
      "FATF Recommendation 18 — internal controls and whistleblower protection",
      "CBUAE AML/CFT Standards — confidential reporting and non-retaliation",
      "SOC2 CC2.2 — internal communication of compliance concerns",
    ],
    requirements: [
      "Maintain at least one confidential and, where elected, anonymous reporting channel",
      "Guarantee non-retaliation against any good-faith reporter",
      "Triage every disclosure to the MLRO independently of implicated management",
      "Record receipt, assessment, and disposition of each report in the audit chain",
      "Preserve all grievance records for the statutory retention period",
      "Escalate disclosures indicating reportable suspicion to STR/SAR workflow",
    ],
    controls: [
      "Immutable HMAC-SHA256 audit entry written on report receipt",
      "Anonymity-by-default intake with optional identified reporting",
      "Independent MLRO routing that bypasses implicated line managers",
      "Status lifecycle tracking from receipt through closure",
      "Linkage to case management for substantiated allegations",
    ],
    reporting: [
      "Internal escalation to the MLRO and, where warranted, the Board",
      "Onward STR/SAR filing to the UAE FIU where suspicion is established",
      "Periodic whistleblowing-activity summaries for governance oversight",
    ],
    risks: [
      "Reports of structuring, smurfing, or unexplained third-party funding",
      "Internal collusion or override of AML controls",
      "Tip-off risk where a subject may be alerted to an investigation",
      "Retaliation indicators against a known or suspected reporter",
    ],
  },
  "/pkyc": {
    title: "Perpetual KYC Monitor",
    summary: [
      "Perpetual KYC (pKYC) replaces periodic, calendar-driven customer reviews with continuous, event-driven re-assessment of the customer base. The module ingests changes in screening status, transactional behaviour, beneficial ownership, and external risk signals, recalculating each customer's risk rating in near-real time and triggering enhanced due diligence the moment a threshold is breached rather than at the next scheduled review.",
      "This addresses a core supervisory expectation that customer due diligence be kept current throughout the relationship, not merely captured at onboarding. By collapsing the latency between a risk-relevant event and the institution's response, pKYC materially reduces the window during which a compromised relationship can be exploited.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.16 — ongoing monitoring of the business relationship",
      "UAE Cabinet Decision No.10/2019 Art.7 — keeping CDD information up to date",
      "FATF Recommendation 10 — ongoing due diligence and scrutiny of transactions",
      "CBUAE AML/CFT Standards — risk-based, continuous customer review",
      "FATF Recommendation 1 — risk-based application of resources",
    ],
    requirements: [
      "Apply CDD measures on a continuing basis throughout the relationship",
      "Refresh customer information when a material risk event occurs",
      "Recalculate risk rating dynamically rather than on a fixed cycle",
      "Trigger EDD automatically on threshold breach or adverse event",
      "Document the rationale for each re-rating in the audit trail",
      "Reconcile pKYC outcomes with the periodic CDD review register",
    ],
    controls: [
      "Event-driven risk recomputation on screening, transaction, or ownership change",
      "Automated EDD escalation on rating uplift",
      "Continuous adverse-media and sanctions re-screening linkage",
      "Audit-chain entry for every rating change with rationale",
      "Configurable risk thresholds aligned to the institution's RBA",
    ],
    reporting: [
      "Risk-rating migration reports to compliance management",
      "Escalation of newly high-risk relationships for senior sign-off",
      "STR/SAR referral where re-assessment surfaces reportable suspicion",
    ],
    risks: [
      "Sudden change in transaction volume, velocity, or counterparties",
      "Newly surfaced sanctions, PEP, or adverse-media match",
      "Undisclosed change in beneficial ownership or control",
      "Migration of a low-risk customer into a high-risk band",
    ],
  },
  "/operations/onboard": {
    title: "Onboarding Wizard",
    summary: [
      "The Onboarding Wizard enforces a structured, gated new-customer flow that collects identity, beneficial-ownership, source-of-funds, and purpose-of-relationship data before any account is activated. Each step is validated against the institution's risk-based CDD policy, and the customer cannot progress until the mandatory evidence for their assessed risk tier has been captured and screened.",
      "By front-loading verification and screening at account opening, the module ensures the institution satisfies its obligation to identify and verify every customer — and to apply enhanced measures to higher-risk relationships — before funds move. The flow writes a complete onboarding audit record that can be reproduced for a regulator on demand.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.18 — customer due diligence obligations",
      "UAE Cabinet Decision No.10/2019 Art.4–6 — identification and verification",
      "FATF Recommendation 10 — CDD and prohibition on anonymous accounts",
      "FATF Recommendation 12 — politically exposed persons at onboarding",
      "CBUAE AML/CFT Standards — risk-based onboarding and verification",
    ],
    requirements: [
      "Identify and verify the customer before establishing the relationship",
      "Identify beneficial owners and verify control structures",
      "Establish and record the purpose and intended nature of the relationship",
      "Apply EDD to PEPs, high-risk jurisdictions, and high-risk products",
      "Screen all parties against sanctions and watchlists pre-activation",
      "Prohibit account activation where CDD is incomplete",
    ],
    controls: [
      "Gated workflow blocking activation until risk-tier evidence is complete",
      "Inline sanctions / PEP / adverse-media screening at intake",
      "Automated risk-tiering driving the required evidence set",
      "AI risk narrative generated and retained for each application",
      "Full onboarding audit record written to the audit chain",
    ],
    reporting: [
      "Escalation of high-risk onboardings for senior approval",
      "STR/SAR referral where onboarding surfaces suspicion",
      "Onboarding-quality metrics to compliance governance",
    ],
    risks: [
      "Refusal or inability to provide beneficial-ownership detail",
      "Use of nominees, shells, or opaque layering structures",
      "Mismatch between stated purpose and customer profile",
      "Sanctions or PEP hit on any party to the relationship",
    ],
  },
  "/client-portal": {
    title: "Client Portal",
    summary: [
      "The Client Portal provides a controlled, self-service interface through which corporate and individual customers submit KYC documentation, declare beneficial ownership, and respond to information requests. Every submission is screened and risk-assessed on receipt, and the AI risk-assessment faculty produces a structured rationale that an analyst reviews before acceptance.",
      "The portal reduces manual data handling while preserving the integrity of the CDD record: submissions are validated, screened, and logged automatically, and no customer-supplied assertion is treated as verified until it has passed the institution's controls. This supports both efficient onboarding and a defensible, reproducible evidence trail.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.18 — customer due diligence",
      "UAE Cabinet Decision No.10/2019 Art.4 — verification from reliable sources",
      "UAE FDL No.10/2025 — governance of AI-assisted risk assessment",
      "FATF Recommendation 10 — identification and verification",
      "CBUAE AML/CFT Standards — reliable and independent data sources",
    ],
    requirements: [
      "Verify customer-supplied data against reliable, independent sources",
      "Screen every submitted party before acceptance",
      "Retain submitted documents for the statutory period",
      "Subject AI-generated risk assessments to human review",
      "Record the provenance and verification status of each document",
      "Re-request information where submissions are incomplete or stale",
    ],
    controls: [
      "Automated screening of all submissions on receipt",
      "AI risk assessment with mandatory human-in-the-loop review",
      "Document provenance and verification-status tracking",
      "Audit-chain logging of every submission and decision",
      "PII redaction before any LLM-assisted processing",
    ],
    reporting: [
      "Escalation of high-risk submissions to compliance",
      "STR/SAR referral where a submission surfaces suspicion",
      "Submission-quality and turnaround metrics to governance",
    ],
    risks: [
      "Forged, altered, or inconsistent identity documents",
      "Beneficial-ownership declarations that conflict with registry data",
      "Submissions from high-risk or sanctioned jurisdictions",
      "Behavioural anomalies in portal usage suggesting account takeover",
    ],
  },
  "/ubo-declaration": {
    title: "UBO Declaration",
    summary: [
      "The UBO Declaration module captures, verifies, and maintains the ultimate beneficial ownership of corporate customers, resolving ownership and control down to natural persons in line with the UAE beneficial-ownership regime. Declared structures are tested against ownership and control thresholds, screened, and risk-scored, with discrepancies against external registry data flagged for investigation.",
      "Accurate beneficial-ownership information is foundational to effective sanctions screening and AML risk assessment: an institution cannot meaningfully screen or risk-rate a relationship whose true owners it has not identified. The module enforces this identification and keeps it current as ownership changes.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.58/2020 — regulation of beneficial-owner procedures",
      "UAE FDL No.20/2018 Art.18 — identification of beneficial owners",
      "UAE Cabinet Decision No.10/2019 Art.6 — beneficial-ownership verification",
      "FATF Recommendation 24 — transparency of legal persons",
      "FATF Recommendation 25 — transparency of legal arrangements",
    ],
    requirements: [
      "Identify all beneficial owners down to natural persons",
      "Apply the 25% ownership / control threshold and the senior-managing-official fallback",
      "Verify declared ownership against independent registry data",
      "Screen every identified beneficial owner",
      "Maintain a current beneficial-ownership register",
      "Investigate and resolve registry discrepancies",
    ],
    controls: [
      "Threshold testing against ownership and control percentages",
      "Registry reconciliation with discrepancy flagging",
      "Automatic screening of all identified beneficial owners",
      "Layering / shell-structure risk scoring",
      "Audit-chain record of each declaration and change",
    ],
    reporting: [
      "Beneficial-ownership discrepancy reporting to the registrar where required",
      "STR/SAR referral where ownership opacity indicates suspicion",
      "Escalation of complex or high-risk structures to compliance",
    ],
    risks: [
      "Opaque multi-jurisdictional layering designed to obscure control",
      "Nominee shareholders or directors fronting a hidden principal",
      "Refusal to disclose or repeated incomplete declarations",
      "Beneficial owner with sanctions, PEP, or adverse-media exposure",
    ],
  },
  "/pep-profile": {
    title: "PEP Profiles",
    summary: [
      "The PEP Profiles module manages the identification, classification, and enhanced ongoing scrutiny of politically exposed persons, their family members, and close associates. Each profile records the PEP tier, the source-of-wealth and source-of-funds assessment, a network map of associated parties, and the specific enhanced due diligence measures applied to the relationship.",
      "Because PEP status elevates corruption and laundering risk irrespective of any specific transaction, the module enforces senior-management approval for establishing or continuing such relationships and ensures the enhanced monitoring obligations persist for as long as the elevated risk endures.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.18 — enhanced measures for higher-risk customers",
      "UAE Cabinet Decision No.10/2019 Art.15 — politically exposed persons",
      "FATF Recommendation 12 — domestic and foreign PEPs and their associates",
      "FATF Recommendation 22 — PEP obligations for DNFBPs",
      "CBUAE AML/CFT Standards — source of wealth and senior approval",
    ],
    requirements: [
      "Apply risk-based procedures to determine PEP status",
      "Obtain senior-management approval to establish or continue the relationship",
      "Establish source of wealth and source of funds",
      "Conduct enhanced ongoing monitoring of the relationship",
      "Extend measures to family members and close associates",
      "Maintain PEP status and tiering on a current basis",
    ],
    controls: [
      "PEP tiering and family/associate network mapping",
      "Source-of-wealth and source-of-funds assessment record",
      "Enforced senior-approval gate for relationship continuation",
      "Enhanced ongoing-monitoring linkage to transaction surveillance",
      "Audit-chain logging of approvals and EDD measures",
    ],
    reporting: [
      "Senior-management and Board reporting on PEP exposure",
      "STR/SAR referral where PEP activity indicates suspicion",
      "Periodic PEP-portfolio review reporting",
    ],
    risks: [
      "Unexplained wealth inconsistent with the PEP's known income",
      "Use of intermediaries or associates to obscure the PEP's role",
      "High-value transactions with no clear economic rationale",
      "Connections to high-corruption-risk jurisdictions",
    ],
  },
  "/esg-risk": {
    title: "ESG Risk",
    summary: [
      "The ESG Risk module overlays environmental, social, and governance risk onto the institution's financial-crime assessment, recognising that ESG failings — environmental crime, forced labour, bribery, and sanctions-linked governance breaches — are frequently predicate offences for money laundering. It scores customers and counterparties on ESG factors and maps that exposure to AML and regulatory risk.",
      "This integrated view ensures that financial-crime controls are informed by the broader risk picture and that exposures such as supply-chain forced labour or environmental-crime proceeds are surfaced rather than siloed in a separate, non-AML workstream.",
    ],
    regulatory: [
      "FATF guidance on environmental crime as a money-laundering predicate",
      "UAE FDL No.20/2018 — proceeds of predicate offences",
      "OECD Due Diligence Guidance — responsible business conduct",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing obligations",
      "CBUAE AML/CFT Standards — risk-based customer assessment",
    ],
    requirements: [
      "Incorporate ESG-linked predicate-offence risk into customer assessment",
      "Identify exposure to environmental crime and forced labour",
      "Map ESG governance failings to financial-crime risk",
      "Apply enhanced scrutiny where ESG risk is elevated",
      "Document the ESG dimension of the risk-based approach",
    ],
    controls: [
      "ESG scoring with an explicit money-laundering risk overlay",
      "Regulatory-exposure mapping per customer",
      "Escalation where ESG risk crosses defined thresholds",
      "Audit-chain record of ESG assessments",
    ],
    reporting: [
      "ESG-risk exposure reporting to compliance and risk committees",
      "STR/SAR referral where ESG findings indicate predicate-offence proceeds",
      "Integration of ESG findings into the enterprise risk assessment",
    ],
    risks: [
      "Counterparties linked to environmental or wildlife crime",
      "Supply chains exposed to forced or child labour",
      "Governance failures indicating bribery or corruption",
      "Greenwashing masking illicit proceeds",
    ],
  },
  "/vendor-dd": {
    title: "Supplier Due Diligence",
    summary: [
      "The Supplier Due Diligence module extends financial-crime controls to the institution's third-party and supplier relationships, screening vendors, assessing their AML/sanctions exposure, and documenting the due-diligence basis on which each is engaged. It recognises that suppliers can introduce sanctions, bribery, and laundering risk into the institution through procurement and outsourcing channels.",
      "By applying a risk-based diligence standard to suppliers — proportionate to the criticality and risk of each engagement — the module protects the institution from inadvertently transacting with sanctioned, conflicted, or high-risk third parties and creates an auditable record of supplier risk decisions.",
    ],
    regulatory: [
      "FATF Recommendation 1 — risk-based approach across relationships",
      "UAE FDL No.20/2018 — sanctions and predicate-offence exposure",
      "CBUAE AML/CFT Standards — third-party and outsourcing risk",
      "UAE Cabinet Decision No.10/2019 — reliance on third parties",
      "OECD Guidelines — anti-bribery in business relationships",
    ],
    requirements: [
      "Screen suppliers against sanctions and watchlists before engagement",
      "Apply risk-based diligence proportionate to engagement risk",
      "Identify beneficial ownership of material suppliers",
      "Document the diligence basis for each supplier decision",
      "Re-screen suppliers on a defined cadence",
    ],
    controls: [
      "Automated supplier screening and AI risk assessment",
      "Risk-tiered diligence requirements per supplier",
      "Periodic re-screening of the supplier register",
      "Audit-chain record of supplier risk decisions",
    ],
    reporting: [
      "Escalation of high-risk supplier engagements to compliance",
      "Reporting of sanctions hits on suppliers",
      "Supplier-risk metrics to procurement governance",
    ],
    risks: [
      "Supplier with sanctions or adverse-media exposure",
      "Opaque supplier ownership or undisclosed conflicts of interest",
      "Suppliers in high-risk jurisdictions",
      "Indicators of bribery or kickback arrangements",
    ],
  },
  "/cdd-review": {
    title: "CDD Review",
    summary: [
      "The CDD Review module governs periodic re-KYC, ensuring that customer due diligence is refreshed at intervals appropriate to each customer's risk rating and that the adequacy of existing CDD is tested against current standards. It maintains the review register, schedules reviews by risk band, and records the outcome and rationale of each review.",
      "Periodic review is a regulatory backstop to event-driven monitoring: even where no specific trigger has fired, the institution must confirm that its understanding of the customer remains accurate and that the CDD on file remains sufficient. The module enforces this cadence and evidences its completion.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.7 — keeping CDD current",
      "UAE FDL No.20/2018 Art.16 — ongoing monitoring",
      "FATF Recommendation 10 — ongoing due diligence",
      "CBUAE AML/CFT Standards — periodic review by risk rating",
      "FATF Recommendation 1 — risk-based allocation of review effort",
    ],
    requirements: [
      "Schedule periodic reviews by customer risk band",
      "Test the adequacy and currency of existing CDD",
      "Refresh identification and beneficial-ownership data as needed",
      "Record the outcome and rationale of each review",
      "Escalate inadequate CDD for remediation",
      "Maintain a complete and auditable review register",
    ],
    controls: [
      "Risk-banded review scheduling and overdue tracking",
      "AI adequacy check against current CDD standards",
      "Automated re-screening at review",
      "Audit-chain record of each review decision",
    ],
    reporting: [
      "Overdue-review reporting to compliance management",
      "Escalation of relationships failing review",
      "Review-completion metrics to governance",
    ],
    risks: [
      "Stale or incomplete CDD on long-standing relationships",
      "Material change in customer profile since last review",
      "Overdue reviews accumulating in high-risk bands",
      "Newly surfaced screening matches at review",
    ],
  },
  "/data-quality": {
    title: "Data Quality",
    summary: [
      "The Data Quality module measures and remediates the completeness, accuracy, and timeliness of the CDD data that underpins every downstream control. Because screening, monitoring, and risk-rating are only as reliable as their inputs, the module quantifies data gaps per customer and generates AI-assisted remediation plans to close them.",
      "Robust data governance is an explicit supervisory expectation: incomplete or inaccurate customer data degrades sanctions screening and transaction monitoring and can itself constitute a control failure. This module makes data quality measurable and its remediation auditable.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.4 — reliable, accurate CDD data",
      "UAE FDL No.20/2018 Art.18 — completeness of customer information",
      "FATF Recommendation 10 — adequacy of identification data",
      "CBUAE AML/CFT Standards — data integrity and record adequacy",
      "SOC2 CC7.x — data-processing integrity",
    ],
    requirements: [
      "Measure CDD completeness and accuracy per customer",
      "Identify and prioritise data gaps by risk impact",
      "Remediate deficient records within defined timeframes",
      "Validate data against reliable, independent sources",
      "Evidence remediation in the audit trail",
    ],
    controls: [
      "Per-customer completeness and accuracy scoring",
      "AI-generated, prioritised remediation plans",
      "Source-validation checks on key data fields",
      "Audit-chain record of remediation actions",
    ],
    reporting: [
      "Data-quality scorecards to compliance and data governance",
      "Escalation of systemic data deficiencies",
      "Remediation-progress reporting",
    ],
    risks: [
      "Missing beneficial-ownership or identification fields",
      "Inconsistent data across systems of record",
      "Stale data on active high-risk relationships",
      "Screening degraded by poor-quality name and identifier data",
    ],
  },
  "/ownership": {
    title: "Ownership Explorer",
    summary: [
      "The Ownership Explorer visualises and analyses corporate ownership and control structures, walking multi-layer chains to identify ultimate beneficial owners and to detect shell-company, jurisdiction-layering, and circular-ownership risk. It turns opaque corporate structures into navigable graphs that an analyst can interrogate and that the platform can risk-score.",
      "Complex ownership is a recognised laundering and sanctions-evasion technique. By making the full structure visible and flagging the hallmarks of deliberate obfuscation, the module supports both accurate beneficial-ownership identification and the detection of structures engineered to defeat screening.",
    ],
    regulatory: [
      "FATF Recommendation 24 — transparency of legal persons",
      "FATF Recommendation 25 — transparency of legal arrangements",
      "UAE Cabinet Decision No.58/2020 — beneficial-ownership procedures",
      "UAE FDL No.20/2018 Art.18 — beneficial-ownership identification",
      "CBUAE AML/CFT Standards — control-structure analysis",
    ],
    requirements: [
      "Resolve ownership and control to natural persons",
      "Detect shell, nominee, and circular-ownership structures",
      "Assess jurisdiction-layering and secrecy-haven exposure",
      "Reconcile structure against declared beneficial ownership",
      "Document control analysis for the CDD record",
    ],
    controls: [
      "Multi-layer ownership-chain traversal",
      "Shell and layering risk scoring",
      "Jurisdiction-risk overlay on each entity in the chain",
      "Audit-chain record of structure analyses",
    ],
    reporting: [
      "Escalation of high-opacity structures to compliance",
      "STR/SAR referral where structure indicates evasion",
      "Structure-risk reporting to governance",
    ],
    risks: [
      "Deep layering across multiple secrecy jurisdictions",
      "Circular or self-referential ownership",
      "Shell entities with no apparent economic substance",
      "Divergence between declared and actual control",
    ],
  },
  "/employees": {
    title: "Employees",
    summary: [
      "The Employees module maintains the staff registry that underpins fit-and-proper, screening, and training obligations. It tracks employee identity documents, screening status, role-based access, and document expiry, and runs AI-assisted risk scans to surface internal financial-crime risk such as undisclosed conflicts or sanctions exposure among staff.",
      "Internal actors present a distinct AML threat — collusion, control override, and insider facilitation — and supervisors expect institutions to screen and monitor employees commensurate with their roles. This module operationalises that expectation and keeps the underlying records current.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20–21 — staff screening and training",
      "FATF Recommendation 18 — employee screening and internal controls",
      "UAE FDL No.20/2018 — internal control obligations",
      "CBUAE AML/CFT Standards — fit-and-proper and staff vetting",
      "SOC2 CC1.4 — competence and accountability of personnel",
    ],
    requirements: [
      "Screen employees on hire and on a defined cadence",
      "Maintain current identity and authorisation documents",
      "Apply role-based access aligned to least privilege",
      "Track and remediate expiring credentials",
      "Evidence employee screening and vetting decisions",
    ],
    controls: [
      "Employee screening and AI internal-risk scan",
      "Document-expiry tracking and alerting",
      "Role-based access mapping",
      "Audit-chain record of vetting decisions",
    ],
    reporting: [
      "Escalation of adverse employee-screening findings",
      "Reporting of access and credential exceptions",
      "Staff-screening completion metrics to governance",
    ],
    risks: [
      "Employee sanctions, PEP, or adverse-media exposure",
      "Undisclosed conflicts of interest",
      "Excessive or stale access privileges",
      "Indicators of insider collusion or control override",
    ],
  },
  "/training": {
    title: "Training",
    summary: [
      "The Training module tracks the institution's mandatory AML/CFT training programme, recording course completion, competency, and deadlines for every employee and escalating overdue or failed training. Effective, role-appropriate, and regularly refreshed training is a baseline regulatory obligation and a frequent supervisory examination point.",
      "By evidencing who was trained, on what, and when — and by flagging gaps before they become findings — the module converts the training obligation from an unverifiable assertion into an auditable control with a defensible record.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.21 — ongoing employee training",
      "UAE FDL No.20/2018 — staff awareness obligations",
      "FATF Recommendation 18 — ongoing training programmes",
      "CBUAE AML/CFT Standards — role-appropriate, refreshed training",
    ],
    requirements: [
      "Deliver role-appropriate AML/CFT training to all relevant staff",
      "Refresh training on a defined periodic cadence",
      "Record completion and competency per employee",
      "Escalate overdue or failed training",
      "Retain training records for the statutory period",
    ],
    controls: [
      "Per-employee completion and deadline tracking",
      "Overdue-training escalation",
      "Competency and assessment recording",
      "Audit-chain record of completion evidence",
    ],
    reporting: [
      "Training-completion reporting to compliance and the Board",
      "Escalation of persistent training gaps",
      "Examination-ready training evidence packs",
    ],
    risks: [
      "Overdue mandatory training in customer-facing roles",
      "Low completion or competency in high-risk functions",
      "Stale curricula not reflecting current typologies",
      "Gaps concentrated in specific business units",
    ],
  },
  "/approvals": {
    title: "Approvals",
    summary: [
      "The Approvals module is the institution's entity-approval tracker, governing the sign-off lifecycle for new relationships, high-risk customers, and destination countries. It records approval status, risk score, and the authorising party, enforcing that higher-risk decisions receive the appropriate level of senior or four-eyes authorisation before activation.",
      "Documented, authority-appropriate approval is central to a defensible control environment: it ensures risk acceptance is made knowingly, by an empowered approver, and is reproducible for audit. The module centralises and evidences these decisions.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.15 — senior approval for high-risk relationships",
      "UAE FDL No.20/2018 Art.18 — enhanced measures and approval",
      "FATF Recommendation 12 — senior approval for PEP relationships",
      "CBUAE AML/CFT Standards — governance of risk acceptance",
      "SOC2 CC5.x — authorisation controls",
    ],
    requirements: [
      "Route high-risk approvals to appropriately senior authorisers",
      "Apply four-eyes authorisation where required",
      "Record the approver, rationale, and risk score for each decision",
      "Prevent activation absent required approval",
      "Maintain an auditable approval history",
    ],
    controls: [
      "Risk-scored approval routing",
      "Four-eyes enforcement on qualifying decisions",
      "Approval-status lifecycle tracking",
      "Audit-chain record of every approval",
    ],
    reporting: [
      "Approval-exception reporting to compliance",
      "Reporting of high-risk approvals to the Board",
      "Approval-cycle metrics to governance",
    ],
    risks: [
      "Approval granted below the required authority level",
      "Activation preceding completed approval",
      "Concentration of high-risk approvals to a single approver",
      "Destination countries under sanctions or elevated risk",
    ],
  },

  // ════════════════════════ RISK & AML OPS ════════════════════════
  "/screening": {
    title: "Customer Screening",
    summary: [
      "Customer Screening is the institution's primary control against transacting with sanctioned, politically exposed, or adverse-media-linked parties. It screens customers and connected parties against consolidated sanctions lists, PEP databases, and multi-language adverse-media sources, scoring matches and routing them for analyst disposition.",
      "Sanctions screening is a strict-liability area: the institution must not make funds or services available, directly or indirectly, to a listed party. The module enforces pre-transaction screening, name-matching tuned to balance recall and precision, and a fully evidenced disposition trail for every alert.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.18 — screening within CDD",
      "UAE Cabinet Decision No.10/2019 — targeted financial sanctions obligations",
      "FATF Recommendation 6 — targeted financial sanctions (terrorism)",
      "FATF Recommendation 7 — proliferation-financing sanctions",
      "CBUAE Guidance on Targeted Financial Sanctions",
      "FATF Recommendation 10 — screening within due diligence",
    ],
    requirements: [
      "Screen all customers and connected parties before transacting",
      "Maintain current consolidated sanctions and watchlist data",
      "Tune matching to balance false positives against missed hits",
      "Disposition every alert with a documented rationale",
      "Re-screen on list updates and relationship changes",
      "Freeze and report confirmed sanctions matches without delay",
    ],
    controls: [
      "Sanctions, PEP, and adverse-media screening engine",
      "Match scoring and analyst disposition workflow",
      "Automatic re-screening on list refresh",
      "Multi-language adverse-media coverage",
      "Audit-chain record of every screening decision",
    ],
    reporting: [
      "Immediate escalation and freezing of confirmed matches",
      "TFS reporting to the competent UAE authority",
      "STR/SAR referral where screening indicates suspicion",
    ],
    risks: [
      "Confirmed sanctions or terrorism-list match",
      "Name variations or transliteration used to evade matching",
      "Adverse media indicating predicate-offence involvement",
      "PEP exposure requiring enhanced measures",
    ],
  },
  "/transaction-monitor": {
    title: "Transaction Monitor",
    summary: [
      "The Transaction Monitor applies real-time and retrospective rules to detect patterns indicative of money laundering, terrorist financing, and sanctions evasion — structuring, rapid movement, unexplained third-party funding, and deviation from expected behaviour. Alerts are scored, prioritised, and routed to investigators with the supporting transaction context.",
      "Ongoing transaction monitoring is a core FATF obligation: institutions must scrutinise transactions throughout a relationship to ensure they are consistent with their knowledge of the customer. The module operationalises this at scale while preserving an auditable basis for each alert and disposition.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.16 — ongoing monitoring of transactions",
      "UAE Cabinet Decision No.10/2019 Art.7 — scrutiny of transactions",
      "FATF Recommendation 10 — ongoing due diligence",
      "FATF Recommendation 20 — reporting of suspicious transactions",
      "CBUAE AML/CFT Standards — risk-based monitoring",
    ],
    requirements: [
      "Monitor transactions against the customer's expected profile",
      "Detect structuring, layering, and rapid-movement patterns",
      "Score and prioritise alerts by risk",
      "Investigate and disposition alerts within defined timeframes",
      "Refer reportable activity to STR/SAR workflow",
      "Tune rules to maintain effectiveness and control false positives",
    ],
    controls: [
      "Real-time and retrospective rule engine",
      "Behavioural-deviation and peer-group analytics",
      "Alert scoring and investigator routing",
      "Audit-chain record of alerts and dispositions",
    ],
    reporting: [
      "STR/SAR filing to the UAE FIU for reportable activity",
      "Escalation of high-risk alerts to the MLRO",
      "Monitoring-effectiveness metrics to governance",
    ],
    risks: [
      "Structuring below reporting thresholds",
      "Rapid in-and-out movement with no economic purpose",
      "Transactions inconsistent with the customer profile",
      "Funding from or to high-risk jurisdictions",
    ],
  },
  "/ongoing-monitor": {
    title: "Ongoing Monitor",
    summary: [
      "The Ongoing Monitor maintains continuous surveillance of existing subjects, re-screening them against updated sanctions, PEP, and adverse-media data and detecting status changes that warrant re-assessment. It ensures that a relationship cleared at onboarding does not silently drift into non-compliance as external risk data changes.",
      "Sanctions and risk status are not static; a customer clean today may be listed tomorrow. The module closes that gap by re-evaluating the subject population on list updates and defined cadences, and by escalating newly surfaced risk for action.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.16 — ongoing monitoring",
      "UAE Cabinet Decision No.10/2019 Art.7 — keeping information current",
      "FATF Recommendation 10 — ongoing due diligence",
      "FATF Recommendation 6 — continuous sanctions obligations",
      "CBUAE AML/CFT Standards — continuous re-screening",
    ],
    requirements: [
      "Re-screen subjects on sanctions and watchlist updates",
      "Detect and act on status changes between reviews",
      "Escalate newly surfaced matches without delay",
      "Maintain a complete re-screening audit trail",
      "Align monitoring cadence to subject risk",
    ],
    controls: [
      "Automated re-screening on list refresh",
      "Status-change detection and alerting",
      "Risk-based monitoring cadence",
      "Audit-chain record of re-screening outcomes",
    ],
    reporting: [
      "Immediate escalation of newly listed subjects",
      "STR/SAR referral where re-screening surfaces suspicion",
      "Re-screening-coverage metrics to governance",
    ],
    risks: [
      "Existing customer newly added to a sanctions list",
      "Emergent adverse media on a cleared subject",
      "Change in PEP status mid-relationship",
      "Gaps in re-screening coverage",
    ],
  },
  "/cases": {
    title: "Case Management",
    summary: [
      "Case Management is the investigative backbone of the platform, consolidating alerts, screening hits, and grievances into structured cases with a documented investigation, disposition, and audit trail. It enforces a consistent investigative lifecycle and preserves the evidentiary record that underpins any onward STR/SAR filing.",
      "A defensible case file — showing what was investigated, what was found, and why a decision was reached — is essential both to effective filing and to demonstrating to a supervisor that alerts are being worked to a consistent standard. The module standardises and evidences that process.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.15 — assessment of suspicions",
      "UAE Cabinet Decision No.10/2019 Art.17 — internal suspicious-activity process",
      "FATF Recommendation 20 — suspicious-transaction reporting",
      "CBUAE AML/CFT Standards — investigation and record-keeping",
      "SOC2 CC7.3 — incident investigation and resolution",
    ],
    requirements: [
      "Consolidate related alerts and signals into a single case",
      "Document the investigation steps and findings",
      "Reach and record a reasoned disposition",
      "Refer reportable cases to STR/SAR workflow",
      "Preserve the full case record for the statutory period",
    ],
    controls: [
      "Case lifecycle and status tracking",
      "Linkage of alerts, screening hits, and grievances",
      "Disposition workflow with documented rationale",
      "Audit-chain record of all case actions",
    ],
    reporting: [
      "STR/SAR filing for cases meeting the suspicion threshold",
      "Escalation of complex cases to the MLRO",
      "Case-throughput and ageing metrics to governance",
    ],
    risks: [
      "Aged or unworked high-risk cases",
      "Inconsistent disposition standards across investigators",
      "Cases closed without adequate documented rationale",
      "Linked activity spanning multiple unjoined cases",
    ],
  },
  "/ewra": {
    title: "EWRA / BWRA",
    summary: [
      "The Enterprise-Wide / Business-Wide Risk Assessment module produces and maintains the institution's foundational money-laundering and terrorist-financing risk assessment, aggregating customer, product, channel, and geographic risk into a documented, board-approved view that drives the entire risk-based programme.",
      "FATF requires institutions to identify, assess, and understand their ML/TF risks and to apply resources proportionately. The EWRA is the document that evidences this understanding; the module keeps it current, defensible, and linked to the controls it justifies, and generates a board-ready report.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 — risk-based approach foundation",
      "UAE Cabinet Decision No.10/2019 Art.3 — business risk assessment",
      "FATF Recommendation 1 — assessing and mitigating risk",
      "CBUAE AML/CFT Standards — enterprise risk assessment",
      "FATF Methodology — institutional risk understanding",
    ],
    requirements: [
      "Assess customer, product, channel, and geographic risk",
      "Document methodology and risk-appetite linkage",
      "Obtain board approval of the assessment",
      "Drive control calibration from the assessment outcomes",
      "Review and refresh on material change and periodically",
    ],
    controls: [
      "Multi-factor risk aggregation",
      "AI-assisted board-report generation",
      "Risk-appetite and control-linkage mapping",
      "Audit-chain record of assessment versions",
    ],
    reporting: [
      "Board approval and review of the EWRA",
      "Supervisory submission where required",
      "Linkage reporting to control calibration",
    ],
    risks: [
      "Assessment not refreshed after material business change",
      "Controls misaligned with assessed risk",
      "Underweighting of emerging typologies",
      "Lack of documented board approval",
    ],
  },
  "/sar-qa": {
    title: "STR/SAR Filing Suite",
    summary: [
      "The STR/SAR Filing Suite governs the quality assurance and submission of suspicious transaction and activity reports, enforcing a four-eyes review of narrative quality and completeness before goAML XML export to the UAE Financial Intelligence Unit. It is the controlled gateway through which the institution discharges its single most important AML obligation.",
      "A defective or delayed STR is both a compliance failure and a lost intelligence opportunity. The suite ensures each report meets quality standards, passes the egress tipping-off gate, and is filed promptly, with the entire review and submission chain recorded immutably.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.15 — obligation to report suspicion",
      "UAE Cabinet Decision No.10/2019 Art.17 — STR procedures",
      "FATF Recommendation 20 — prompt suspicious-transaction reporting",
      "FATF Recommendation 21 — tipping-off prohibition",
      "CBUAE Notice 2021/8 — goAML filing requirements",
    ],
    requirements: [
      "Report suspicion to the FIU promptly and without tipping off",
      "Apply four-eyes quality review before filing",
      "Ensure narrative completeness and evidentiary support",
      "Export in valid goAML XML format",
      "Preserve the full filing record and acknowledgements",
    ],
    controls: [
      "Four-eyes QA workflow with TOCTOU-safe sign-off",
      "Egress tipping-off gate on narrative content",
      "goAML XML validation and export",
      "Audit-chain record of review and submission",
    ],
    reporting: [
      "STR/SAR submission to the UAE FIU via goAML",
      "Internal escalation of filing decisions to the MLRO",
      "Filing-volume and quality metrics to governance",
    ],
    risks: [
      "Delayed filing past the regulatory window",
      "Narrative deficiencies undermining FIU usability",
      "Inadvertent tipping-off in disclosed content",
      "Four-eyes review bypassed under time pressure",
    ],
  },
  "/goaml-export": {
    title: "goAML Export",
    summary: [
      "The goAML Export module produces validated goAML XML for submission to the UAE Financial Intelligence Unit, mapping the institution's report data to the FIU schema and validating structure and mandatory fields before egress. It ensures that STRs, SARs, and other mandated reports reach the FIU in an accepted, machine-readable form.",
      "Correct goAML formatting and registration are prerequisites to discharging the reporting obligation: a report the FIU cannot ingest is, in effect, not filed. The module enforces schema validity, applies the egress tipping-off gate, and records each submission for audit.",
    ],
    regulatory: [
      "CBUAE Notice 2021/8 — goAML registration and filing",
      "UAE FDL No.20/2018 Art.15 — reporting to the FIU",
      "UAE Cabinet Decision No.10/2019 Art.17 — reporting procedures",
      "FATF Recommendation 20 — suspicious-transaction reporting",
      "FATF Recommendation 21 — tipping-off prohibition",
    ],
    requirements: [
      "Map report data to the current goAML schema",
      "Validate structure and mandatory fields before submission",
      "Apply the egress tipping-off gate to narrative content",
      "Use registered goAML Rentity identifiers",
      "Retain submissions and FIU acknowledgements",
    ],
    controls: [
      "goAML XML schema validation",
      "Egress tipping-off gate enforcement",
      "Mandatory-field completeness checks",
      "Audit-chain record of each export",
    ],
    reporting: [
      "Submission of validated reports to the UAE FIU",
      "Tracking of FIU acknowledgements and rejections",
      "Export-success metrics to governance",
    ],
    risks: [
      "Schema-invalid submissions rejected by the FIU",
      "Placeholder or incorrect Rentity identifiers",
      "Tipping-off content reaching an external system",
      "Missing mandatory fields delaying acceptance",
    ],
  },
  "/supply-chain": {
    title: "Supply Chain & Responsible Sourcing",
    summary: [
      "This module governs financial-crime and responsible-sourcing risk across the institution's supply chains, integrating geographic risk, CSDDD and UFLPA exposure, the OECD five-step due-diligence framework, and RMI/RMAP conformance. It is central to trade-based money-laundering (TBML) detection and to responsible-sourcing compliance under UAE Ministerial Decree 68/2024.",
      "Supply chains are a major vector for laundering, sanctions evasion, and predicate offences such as forced labour and environmental crime. The module applies structured due diligence to surface these exposures and to evidence the institution's responsible-sourcing obligations.",
    ],
    regulatory: [
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "OECD Due Diligence Guidance — five-step framework",
      "FATF guidance on trade-based money laundering",
      "UFLPA / CSDDD — forced-labour and supply-chain diligence",
      "RMI RMAP Standard — responsible minerals sourcing",
    ],
    requirements: [
      "Apply the OECD five-step due-diligence framework",
      "Assess geographic and counterparty supply-chain risk",
      "Screen for forced-labour and UFLPA exposure",
      "Verify RMI/RMAP conformance where minerals are involved",
      "Document supply-chain due-diligence decisions",
    ],
    controls: [
      "OECD five-step workflow enforcement",
      "Geographic and TBML risk scoring",
      "RMI/RMAP conformance linkage",
      "Audit-chain record of due-diligence steps",
    ],
    reporting: [
      "Responsible-sourcing reporting per Decree 68/2024",
      "STR/SAR referral where TBML indicators arise",
      "Supply-chain risk reporting to governance",
    ],
    risks: [
      "Over/under-invoicing and phantom shipments (TBML)",
      "Forced-labour exposure in the supply chain",
      "Non-conformant smelters in the minerals chain",
      "High-risk transit and transshipment jurisdictions",
    ],
  },
  "/rmi": {
    title: "RMI / RMAP",
    summary: [
      "The RMI / RMAP module tracks Responsible Minerals Initiative conformance and RMAP smelter-audit status across the institution's minerals supply chains. It identifies which smelters and refiners are conformant, surfaces those that are not, and links that status to the broader responsible-sourcing and AML risk assessment.",
      "For institutions exposed to gold and other minerals, sourcing from non-conformant or unaudited smelters carries acute laundering, sanctions, and reputational risk. The module makes conformance status explicit and auditable and feeds it into sourcing decisions.",
    ],
    regulatory: [
      "RMI RMAP Standard — smelter and refiner audit programme",
      "OECD Due Diligence Guidance — minerals supply chains",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "LBMA Responsible Gold Guidance — refiner conformance",
      "FATF guidance on gold-related money laundering",
    ],
    requirements: [
      "Verify RMAP conformance of smelters and refiners",
      "Identify and escalate non-conformant sources",
      "Integrate conformance into sourcing risk decisions",
      "Maintain a current conformance register",
      "Document conformance evidence for audit",
    ],
    controls: [
      "RMAP conformance status tracking",
      "Non-conformant-source alerting",
      "Linkage to responsible-sourcing workflow",
      "Audit-chain record of conformance checks",
    ],
    reporting: [
      "Conformance-status reporting to sourcing governance",
      "Escalation of non-conformant sourcing",
      "Responsible-minerals reporting per Decree 68/2024",
    ],
    risks: [
      "Sourcing from non-conformant or unaudited smelters",
      "Conflict-affected and high-risk-area minerals",
      "Lapsed or withdrawn RMAP status",
      "Gaps in chain-of-custody documentation",
    ],
  },
  "/responsible-sourcing": {
    title: "Responsible Sourcing",
    summary: [
      "The Responsible Sourcing module operationalises the OECD five-step due-diligence framework and UAE Ministerial Decree 68/2024, structuring the institution's identification and mitigation of supply-chain risks in minerals and other sensitive commodities. It guides the analyst through management-system establishment, risk identification, mitigation, third-party audit, and public reporting.",
      "Responsible sourcing is both a standalone regulatory obligation and an AML control: the same diligence that identifies human-rights and conflict risk also surfaces the laundering and sanctions exposure embedded in opaque commodity chains.",
    ],
    regulatory: [
      "UAE Ministerial Decree No.68/2024 — responsible sourcing obligations",
      "OECD Due Diligence Guidance — five-step framework",
      "LBMA Responsible Gold Guidance",
      "RMI RMAP Standard",
      "FATF guidance on commodity-linked laundering",
    ],
    requirements: [
      "Establish a responsible-sourcing management system",
      "Identify and assess supply-chain risks",
      "Design and implement risk-mitigation strategies",
      "Obtain independent third-party audit where required",
      "Publicly report on supply-chain due diligence",
    ],
    controls: [
      "OECD five-step workflow enforcement",
      "Risk identification and mitigation tracking",
      "Third-party audit linkage",
      "Audit-chain record of each step",
    ],
    reporting: [
      "Annual responsible-sourcing reporting per Decree 68/2024",
      "Escalation of unmitigated high-risk sourcing",
      "Due-diligence summaries to governance",
    ],
    risks: [
      "Minerals from conflict-affected and high-risk areas",
      "Inadequate or absent third-party audit",
      "Unmitigated identified supply-chain risks",
      "Incomplete public due-diligence reporting",
    ],
  },
  "/oecd-ddg": {
    title: "OECD Due Diligence Guidance",
    summary: [
      "This module implements the OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas as a structured, five-step workflow. It standardises how the institution establishes controls, identifies and assesses risk, mitigates that risk, supports independent audit, and reports — providing a defensible, internationally recognised diligence backbone.",
      "Aligning to the OECD framework gives the institution a recognised benchmark against which supervisors and counterparties can assess its supply-chain controls, and ensures consistency across minerals, gold, and broader commodity-sourcing diligence.",
    ],
    regulatory: [
      "OECD Due Diligence Guidance — five-step framework",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "LBMA Responsible Gold Guidance",
      "RMI RMAP Standard",
      "FATF guidance on high-risk-area sourcing",
    ],
    requirements: [
      "Establish strong company management systems (Step 1)",
      "Identify and assess supply-chain risk (Step 2)",
      "Design and implement a risk-management strategy (Step 3)",
      "Support independent third-party audit (Step 4)",
      "Report annually on supply-chain due diligence (Step 5)",
    ],
    controls: [
      "Five-step workflow enforcement and progress tracking",
      "Risk-assessment and mitigation recording",
      "Audit and reporting linkage",
      "Audit-chain record of framework completion",
    ],
    reporting: [
      "Annual five-step due-diligence report",
      "Escalation of unresolved Step 3 risks",
      "Framework-completion metrics to governance",
    ],
    risks: [
      "Incomplete management systems undermining diligence",
      "Unassessed or unmitigated supply-chain risk",
      "Absence of third-party audit support",
      "Non-publication of the annual report",
    ],
  },
  "/rmap": {
    title: "RMAP Database",
    summary: [
      "The RMAP Database maintains the institution's reference list of Responsible Minerals Assurance Process conformant smelters and refiners, providing the authoritative source against which sourcing decisions and supply-chain mapping are validated. It is the data foundation that the RMI/RMAP and responsible-sourcing workflows depend upon.",
      "An accurate, current conformant-facility list is essential to responsible-minerals diligence; sourcing validated against a stale list can inadvertently legitimise a de-listed facility. The module keeps this reference data current and auditable.",
    ],
    regulatory: [
      "RMI RMAP Standard — conformant-facility programme",
      "OECD Due Diligence Guidance — minerals supply chains",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "LBMA Responsible Gold Guidance",
    ],
    requirements: [
      "Maintain a current conformant-facility reference list",
      "Validate sourcing against conformant status",
      "Flag de-listed or lapsed facilities",
      "Evidence the conformance basis for sourcing decisions",
    ],
    controls: [
      "Conformant-facility reference data management",
      "Status-change and de-listing alerts",
      "Linkage to sourcing-validation workflows",
      "Audit-chain record of reference-data updates",
    ],
    reporting: [
      "Conformance-data currency reporting to governance",
      "Escalation of sourcing against de-listed facilities",
    ],
    risks: [
      "Sourcing validated against stale conformance data",
      "Reliance on a de-listed facility",
      "Gaps in facility coverage",
      "Mismatched facility identifiers",
    ],
  },
  "/lbma": {
    title: "LBMA Gold",
    summary: [
      "The LBMA Gold module manages compliance with the London Bullion Market Association Responsible Gold Guidance, tracking refiner conformance and supply-chain declarations for gold sourcing. It is a specialised responsible-sourcing control for an asset class with elevated laundering, smuggling, and sanctions-evasion risk.",
      "Gold's fungibility and value density make it a favoured laundering vehicle. By enforcing LBMA-aligned declarations and refiner conformance, the module reduces the risk that the institution handles illicitly sourced or sanctions-tainted bullion.",
    ],
    regulatory: [
      "LBMA Responsible Gold Guidance — refiner conformance",
      "OECD Due Diligence Guidance — gold supply chains",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "FATF guidance on gold and precious-metals laundering",
      "RMI RMAP Standard — gold refiners",
    ],
    requirements: [
      "Verify LBMA Good Delivery / RGG refiner conformance",
      "Obtain and validate supply-chain declarations",
      "Assess gold-sourcing geographic risk",
      "Document the responsible-gold diligence basis",
      "Re-validate conformance periodically",
    ],
    controls: [
      "Refiner-conformance verification",
      "Supply-chain declaration capture and validation",
      "Geographic-risk overlay on gold sourcing",
      "Audit-chain record of gold diligence",
    ],
    reporting: [
      "Responsible-gold reporting to governance",
      "Escalation of non-conformant gold sourcing",
      "STR/SAR referral where smuggling indicators arise",
    ],
    risks: [
      "Gold from artisanal or conflict-affected sources",
      "Non-LBMA-conformant refiners",
      "Smuggling and undeclared-origin indicators",
      "Round-tripping and trade-based laundering in bullion",
    ],
  },
  "/reg-change": {
    title: "Regulatory Change Management",
    summary: [
      "The Regulatory Change Management module tracks new and amended regulations, maps each change to affected controls, and maintains an AI-assisted implementation calendar so that the institution adapts its programme before obligations take effect. It converts the stream of regulatory updates into a managed, auditable change pipeline.",
      "Supervisors expect institutions to keep pace with evolving requirements; an unimplemented regulatory change is a latent compliance gap. The module ensures changes are identified, assessed for impact, assigned, and implemented on schedule.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — keeping policies current",
      "FATF Recommendation 1 — responsiveness to evolving risk",
      "CBUAE AML/CFT Standards — regulatory-change governance",
      "UAE FDL No.10/2025 — AI-governance obligations tracking",
      "SOC2 CC3.x — responding to change",
    ],
    requirements: [
      "Identify new and amended applicable regulations",
      "Assess the impact of each change on controls and policy",
      "Assign ownership and implementation deadlines",
      "Implement changes before effective dates",
      "Evidence completion of each regulatory change",
    ],
    controls: [
      "Regulatory-change register and impact mapping",
      "AI-assisted implementation calendar",
      "Deadline tracking and escalation",
      "Audit-chain record of change implementation",
    ],
    reporting: [
      "Regulatory-change status reporting to governance",
      "Escalation of at-risk implementation deadlines",
      "Implementation-completion evidence packs",
    ],
    risks: [
      "Regulatory change not implemented by its effective date",
      "Impact assessment missing affected controls",
      "Unassigned or unowned changes",
      "Backlog of pending implementations",
    ],
  },
  "/shipments": {
    title: "Shipments",
    summary: [
      "The Shipments module tracks bullion and commodity chain-of-custody and applies AI-assisted trade-based money-laundering screening to shipment data. It correlates documentation, routing, and valuation to detect the over/under-invoicing, phantom-shipment, and mis-description patterns characteristic of TBML.",
      "Trade is among the most opaque laundering channels, and physical bullion movements carry heightened smuggling and sanctions risk. The module brings structured scrutiny to shipment data and preserves a chain-of-custody record for each consignment.",
    ],
    regulatory: [
      "FATF guidance on trade-based money laundering",
      "UAE FDL No.20/2018 — proceeds and predicate offences",
      "UAE Ministerial Decree No.68/2024 — responsible sourcing",
      "FATF Recommendation 16 — wire-transfer / trade data",
      "CBUAE AML/CFT Standards — trade-finance risk",
    ],
    requirements: [
      "Maintain chain-of-custody for each shipment",
      "Screen shipment data for TBML indicators",
      "Validate documentation, routing, and valuation consistency",
      "Escalate anomalous shipments for investigation",
      "Retain shipment records for the statutory period",
    ],
    controls: [
      "Chain-of-custody tracking",
      "AI TBML anomaly screening",
      "Documentation-consistency checks",
      "Audit-chain record of shipment reviews",
    ],
    reporting: [
      "STR/SAR referral where TBML is indicated",
      "Escalation of high-risk shipments",
      "Shipment-risk metrics to governance",
    ],
    risks: [
      "Over- or under-invoicing relative to market value",
      "Phantom or duplicated shipments",
      "Routing through high-risk transshipment hubs",
      "Mis-description of goods or quantities",
    ],
  },
  "/eocn": {
    title: "EOCN",
    summary: [
      "The EOCN module manages compliance with the UAE Executive Office for Control & Non-Proliferation regime, covering targeted financial sanctions, NAS/ARS registration, and maintenance of the local control list. It is the institution's interface to the UAE's domestic sanctions architecture and its obligations to freeze and report without delay.",
      "UAE TFS obligations are time-critical and strict: designated parties' funds must be frozen and the action reported within mandated windows. The module operationalises registration, list maintenance, and the freeze-and-report workflow.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.74/2020 — targeted financial sanctions",
      "EOCN guidance on TFS implementation",
      "UAE FDL No.20/2018 — sanctions compliance",
      "FATF Recommendation 6 — terrorism-related TFS",
      "FATF Recommendation 7 — proliferation-financing TFS",
    ],
    requirements: [
      "Register and maintain NAS/ARS subscriptions",
      "Maintain the current UAE local control list",
      "Freeze designated-party assets without delay",
      "Report freezing actions within mandated timeframes",
      "Screen continuously against the control list",
    ],
    controls: [
      "NAS/ARS registration tracking",
      "Control-list maintenance and screening",
      "Freeze-and-report workflow enforcement",
      "Audit-chain record of sanctions actions",
    ],
    reporting: [
      "Freezing reports to the competent UAE authority",
      "CNMR/PNMR filing as required",
      "Sanctions-action metrics to governance",
    ],
    risks: [
      "Failure to freeze within the mandated window",
      "Lapsed NAS/ARS registration",
      "Screening against a stale control list",
      "Designated party transacting undetected",
    ],
  },
  "/tfs-alerts": {
    title: "Sanctions Alerts & Name Match",
    summary: [
      "This module manages EOCN subscription alerts and the name-matching that drives Consolidated and Positive Name Match Report filing. It ingests sanctions-list updates, runs name-match screening, monitors the designated Gmail alert channel, and orchestrates the compliance tasks that follow, including Asana task creation for tracked remediation.",
      "Timely processing of sanctions alerts is the operational heart of TFS compliance. The module ensures that list updates and name matches are detected, triaged, and filed within mandated timeframes, with every step recorded.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.74/2020 — targeted financial sanctions",
      "EOCN guidance — CNMR and PNMR filing",
      "FATF Recommendation 6 — terrorism-related TFS",
      "FATF Recommendation 7 — proliferation-financing TFS",
      "CBUAE Guidance on Targeted Financial Sanctions",
    ],
    requirements: [
      "Ingest and act on EOCN subscription alerts promptly",
      "Run name-match screening on list updates",
      "File CNMR/PNMR within mandated timeframes",
      "Track remediation tasks to closure",
      "Evidence alert processing end-to-end",
    ],
    controls: [
      "EOCN alert ingestion and Gmail monitoring",
      "Name-match screening engine",
      "CNMR/PNMR filing orchestration",
      "Audit-chain record of alert handling",
    ],
    reporting: [
      "CNMR/PNMR filing to EOCN",
      "Escalation of positive matches",
      "Alert-processing-time metrics to governance",
    ],
    risks: [
      "Unprocessed sanctions alerts past the filing window",
      "Missed positive name match",
      "Name variants defeating matching",
      "Broken alert-channel monitoring",
    ],
  },
  "/cnmr": {
    title: "CNMR",
    summary: [
      "The CNMR module manages Consolidated Name Match Report filing to the EOCN, consolidating screening outcomes against designated lists into the required periodic report. It evidences that the institution has screened its base against current designations and reported the results as mandated.",
      "The CNMR is a core UAE TFS deliverable: it demonstrates systematic screening of the customer base against designations. The module assembles, validates, and files the report and retains the submission record.",
    ],
    regulatory: [
      "EOCN guidance — Consolidated Name Match Report",
      "UAE Cabinet Decision No.74/2020 — TFS reporting",
      "FATF Recommendation 6 — terrorism-related TFS",
      "CBUAE Guidance on Targeted Financial Sanctions",
    ],
    requirements: [
      "Screen the customer base against current designations",
      "Consolidate match results into the CNMR format",
      "File the CNMR within the mandated period",
      "Retain the submission and acknowledgement",
      "Evidence screening completeness",
    ],
    controls: [
      "Consolidated screening-result assembly",
      "CNMR format validation",
      "Filing-deadline tracking",
      "Audit-chain record of submissions",
    ],
    reporting: [
      "CNMR submission to EOCN",
      "Escalation of matches requiring freezing",
      "Filing-status reporting to governance",
    ],
    risks: [
      "Late or missed CNMR filing",
      "Incomplete base screening",
      "Unreported positive matches",
      "Format errors causing rejection",
    ],
  },
  "/pnmr": {
    title: "PNMR Queue",
    summary: [
      "The PNMR Queue manages Positive Name Match Reports to the EOCN, handling the time-critical workflow that follows a positive match against a designated party. It queues confirmed matches, drives the freeze-and-report action, and tracks each report to filed status within the mandated window.",
      "A positive match triggers the institution's most urgent obligations: freeze without delay and report immediately. The module ensures these matches are not lost in a general alert backlog and that each is actioned and evidenced.",
    ],
    regulatory: [
      "EOCN guidance — Positive Name Match Report",
      "UAE Cabinet Decision No.74/2020 — freezing obligations",
      "FATF Recommendation 6 — terrorism-related TFS",
      "FATF Recommendation 7 — proliferation-financing TFS",
    ],
    requirements: [
      "Queue and prioritise confirmed positive matches",
      "Freeze assets without delay on a positive match",
      "File the PNMR within the mandated window",
      "Evidence the freeze-and-report chain",
      "Retain submissions and acknowledgements",
    ],
    controls: [
      "Positive-match queue and prioritisation",
      "Freeze-and-report workflow enforcement",
      "Filing-deadline tracking",
      "Audit-chain record of each PNMR",
    ],
    reporting: [
      "PNMR submission to EOCN",
      "Immediate escalation to the MLRO",
      "Freeze-action reporting to governance",
    ],
    risks: [
      "Delay between match and freeze",
      "Missed PNMR filing deadline",
      "Positive match dismissed in error",
      "Asset movement before freezing",
    ],
  },
  "/dpmsr": {
    title: "DPMSR",
    summary: [
      "The DPMSR module manages Dealers in Precious Metals and Stones cash-reporting obligations, capturing and reporting qualifying cash transactions at or above the AED 55,000 threshold under Cabinet Resolution 134/2025 Art.3. It is the specialised reporting control for the DPMS sector's elevated cash-laundering risk.",
      "Cash-intensive precious-metals dealing is a recognised laundering channel; mandatory reporting of large cash dealings is a key mitigant. The module identifies qualifying transactions, assembles the report, and files it within the mandated timeframe.",
    ],
    regulatory: [
      "UAE Cabinet Resolution No.134/2025 Art.3 — DPMS cash reporting",
      "UAE FDL No.20/2018 — DNFBP obligations",
      "FATF Recommendation 22 — DNFBP customer due diligence",
      "FATF Recommendation 23 — DNFBP reporting",
      "CBUAE / MOE AML/CFT Standards for DPMS",
    ],
    requirements: [
      "Identify cash transactions at or above AED 55,000",
      "Capture required transaction and party detail",
      "File the DPMS cash report within the mandated period",
      "Apply CDD to qualifying transactions",
      "Retain reports for the statutory period",
    ],
    controls: [
      "Threshold-based cash-transaction detection",
      "DPMSR assembly and validation",
      "Filing-deadline tracking",
      "Audit-chain record of submissions",
    ],
    reporting: [
      "DPMSR submission to the competent authority",
      "STR/SAR referral where suspicion arises",
      "Cash-reporting metrics to governance",
    ],
    risks: [
      "Structuring cash below the AED 55,000 threshold",
      "Unreported qualifying cash transactions",
      "Incomplete party identification",
      "Late filing past the mandated window",
    ],
  },
  "/moe-survey": {
    title: "MoE AML/CFT Survey",
    summary: [
      "The MoE Survey module manages the mandatory Ministry of Economy AML/CFT survey (reference MOET/AML/001/2026) applicable to all DNFBPs, structuring data collection, validation, and timely submission. It ensures the institution discharges this supervisory return completely and on schedule.",
      "Mandatory supervisory surveys are a compliance obligation in their own right; non-response or late response is a reportable failing. The module assembles the required data, validates completeness, and tracks submission to closure.",
    ],
    regulatory: [
      "UAE Ministry of Economy survey MOET/AML/001/2026",
      "UAE FDL No.20/2018 — DNFBP supervisory obligations",
      "UAE Cabinet Decision No.10/2019 — supervisory cooperation",
      "FATF Recommendation 28 — DNFBP supervision",
    ],
    requirements: [
      "Complete all mandatory survey fields accurately",
      "Validate data before submission",
      "Submit within the mandated deadline",
      "Retain the submission record",
      "Reconcile survey data with internal records",
    ],
    controls: [
      "Survey data collection and validation",
      "Completeness checks against mandatory fields",
      "Deadline tracking and escalation",
      "Audit-chain record of submission",
    ],
    reporting: [
      "Survey submission to the Ministry of Economy",
      "Escalation of at-risk deadlines",
      "Submission-status reporting to governance",
    ],
    risks: [
      "Late or non-submission of the survey",
      "Incomplete or inaccurate responses",
      "Inconsistency with internal records",
      "Missed mandatory fields",
    ],
  },
  "/enforcement": {
    title: "Enforcement Tracker",
    summary: [
      "The Enforcement Tracker manages regulatory deadlines, enforcement actions, and remediation commitments, ensuring that obligations arising from supervisory engagement, examinations, and enforcement are tracked to completion with documented evidence. It is the institution's control against missed regulatory deadlines and unremediated findings.",
      "Failure to meet an enforcement or remediation deadline compounds the original issue and signals weak governance. The module centralises these obligations, tracks them against deadlines, and evidences remediation.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 — supervisory and enforcement framework",
      "UAE Cabinet Decision No.10/2019 — remediation obligations",
      "FATF Recommendation 35 — sanctions for non-compliance",
      "CBUAE AML/CFT Standards — remediation tracking",
      "SOC2 CC4.x — monitoring and remediation",
    ],
    requirements: [
      "Track all regulatory deadlines and commitments",
      "Assign ownership for each remediation action",
      "Evidence completion against each deadline",
      "Escalate at-risk or overdue items",
      "Maintain an auditable enforcement record",
    ],
    controls: [
      "Deadline and action tracking",
      "Ownership assignment and escalation",
      "Remediation-evidence capture",
      "Audit-chain record of enforcement actions",
    ],
    reporting: [
      "Enforcement-status reporting to the Board",
      "Escalation of overdue commitments",
      "Remediation-evidence packs for supervisors",
    ],
    risks: [
      "Missed regulatory or remediation deadline",
      "Unassigned or unowned commitments",
      "Remediation closed without adequate evidence",
      "Recurring findings indicating systemic weakness",
    ],
  },
  "/oversight": {
    title: "Board & Management Oversight",
    summary: [
      "The Oversight module governs board and senior-management sign-off and the recording of minutes, evidencing the active governance that supervisors expect of an AML/CFT programme. It captures decisions, approvals, and the deliberation behind them, demonstrating that the Board owns and directs the compliance framework.",
      "Effective AML governance is not merely operational; it requires demonstrable board-level oversight. The module preserves the decision record — approvals, risk acceptances, and minutes — that proves this oversight occurred.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — governance and oversight",
      "UAE FDL No.20/2018 — senior-management responsibility",
      "FATF Recommendation 1 — senior-management accountability",
      "CBUAE AML/CFT Standards — board oversight",
      "SOC2 CC1.2 — board independence and oversight",
    ],
    requirements: [
      "Record board and senior-management decisions",
      "Evidence sign-off on key compliance matters",
      "Maintain minutes of governance deliberations",
      "Track decisions to implementation",
      "Preserve the governance record for audit",
    ],
    controls: [
      "Decision and sign-off recording",
      "Minutes capture and retention",
      "Decision-to-action tracking",
      "Audit-chain record of governance actions",
    ],
    reporting: [
      "Governance-decision reporting to supervisors",
      "Escalation of unactioned board decisions",
      "Oversight-evidence packs for examinations",
    ],
    risks: [
      "Absent or inadequate board sign-off",
      "Decisions not minuted or evidenced",
      "Governance decisions not implemented",
      "Insufficient senior engagement with AML risk",
    ],
  },
  "/fp-optimizer": {
    title: "False Positive Optimizer",
    summary: [
      "The False Positive Optimizer analyses alert and screening outcomes to identify systematic false-positive patterns and to recommend threshold and rule adjustments that reduce noise without degrading detection. It improves the efficiency and effectiveness of the monitoring estate while preserving an auditable basis for any tuning change.",
      "Excessive false positives waste investigative capacity and can mask genuine risk; supervisors expect tuning to be evidence-based and governed. The module makes optimisation data-driven and ensures every threshold change is justified and recorded.",
    ],
    regulatory: [
      "FATF Recommendation 1 — effective, risk-based resource use",
      "UAE Cabinet Decision No.10/2019 Art.7 — effective monitoring",
      "CBUAE AML/CFT Standards — monitoring effectiveness",
      "UAE FDL No.10/2025 — governance of AI-assisted tuning",
      "FATF Methodology — monitoring effectiveness",
    ],
    requirements: [
      "Analyse false-positive patterns objectively",
      "Justify each proposed threshold or rule change",
      "Preserve detection effectiveness through tuning",
      "Govern and approve tuning changes",
      "Evidence the basis for each change",
    ],
    controls: [
      "False-positive pattern analytics",
      "Threshold-tuning recommendation with rationale",
      "Effectiveness-preservation checks",
      "Audit-chain record of tuning decisions",
    ],
    reporting: [
      "Tuning-recommendation reporting to compliance",
      "Escalation of changes affecting detection",
      "Effectiveness metrics to governance",
    ],
    risks: [
      "Tuning that suppresses genuine alerts",
      "Ungoverned threshold changes",
      "Tuning rationale not documented",
      "Drift in detection effectiveness",
    ],
  },
  "/tm-rules": {
    title: "TM Rule Management",
    summary: [
      "The TM Rule Management module governs the lifecycle of transaction-monitoring rules — proposal, testing, approval, deployment, and retirement — ensuring that every rule change is risk-justified, tested, governed, and auditable. It is the change-control discipline behind the monitoring estate.",
      "Monitoring rules must evolve with typologies and risk, but uncontrolled rule changes can silently create detection gaps. The module enforces a governed change process and preserves the rationale and approval for each rule version.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.7 — effective monitoring",
      "FATF Recommendation 10 — ongoing monitoring",
      "FATF Recommendation 1 — risk-based calibration",
      "CBUAE AML/CFT Standards — monitoring governance",
      "SOC2 CC8.1 — change management",
    ],
    requirements: [
      "Risk-justify each rule proposal",
      "Test rules before deployment",
      "Govern and approve rule changes",
      "Track rule versions and retirements",
      "Evidence the basis for each change",
    ],
    controls: [
      "Rule lifecycle and version tracking",
      "Pre-deployment testing workflow",
      "Approval gating on rule changes",
      "Audit-chain record of rule versions",
    ],
    reporting: [
      "Rule-change reporting to compliance governance",
      "Escalation of changes affecting coverage",
      "Rule-estate effectiveness metrics",
    ],
    risks: [
      "Rule change creating an undetected coverage gap",
      "Untested rule deployed to production",
      "Ungoverned or unapproved changes",
      "Stale rules not reflecting current typologies",
    ],
  },
  "/audit-findings": {
    title: "Audit Findings",
    summary: [
      "The Audit Findings module tracks internal and external audit findings through to remediation, recording severity, ownership, target dates, and evidence of closure. It ensures that identified control weaknesses are not merely noted but resolved within governed timeframes.",
      "Open audit findings are a direct indicator of control health and a frequent supervisory focus. The module centralises findings, drives them to closure, and preserves the remediation evidence that demonstrates effective follow-through.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — independent audit",
      "UAE FDL No.20/2018 — internal control adequacy",
      "FATF Recommendation 18 — independent audit function",
      "CBUAE AML/CFT Standards — audit and remediation",
      "SOC2 CC4.2 — evaluation and remediation of deficiencies",
    ],
    requirements: [
      "Record findings with severity and ownership",
      "Assign and track remediation target dates",
      "Evidence closure of each finding",
      "Escalate overdue or systemic findings",
      "Maintain an auditable findings register",
    ],
    controls: [
      "Findings register with severity tracking",
      "Remediation ownership and deadline tracking",
      "Closure-evidence capture",
      "Audit-chain record of findings lifecycle",
    ],
    reporting: [
      "Findings-status reporting to the Board",
      "Escalation of overdue high-severity findings",
      "Remediation-evidence packs for auditors",
    ],
    risks: [
      "Overdue high-severity findings",
      "Findings closed without adequate evidence",
      "Recurring findings indicating root-cause failure",
      "Unassigned remediation actions",
    ],
  },
  "/bra": {
    title: "Business Risk Assessment",
    summary: [
      "The Business Risk Assessment module supports the assessment of money-laundering and terrorist-financing risk at the business-line and product level, complementing the enterprise-wide assessment with granular, unit-level risk understanding. It feeds control calibration and resource allocation across the institution.",
      "FATF requires risk to be understood at a level granular enough to calibrate controls; an enterprise average can mask acute line-level risk. The module captures this granularity and links it to the controls each business line requires.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.3 — business risk assessment",
      "UAE FDL No.20/2018 — risk-based approach",
      "FATF Recommendation 1 — assessing and mitigating risk",
      "CBUAE AML/CFT Standards — business-line risk",
      "FATF Methodology — risk understanding",
    ],
    requirements: [
      "Assess risk at business-line and product level",
      "Document methodology and risk drivers",
      "Link assessment to control calibration",
      "Refresh on material change and periodically",
      "Reconcile with the enterprise-wide assessment",
    ],
    controls: [
      "Business-line risk scoring",
      "Product-risk factor mapping",
      "Control-linkage tracking",
      "Audit-chain record of assessment versions",
    ],
    reporting: [
      "Business-risk reporting to governance",
      "Escalation of elevated line-level risk",
      "Reconciliation with the EWRA",
    ],
    risks: [
      "Acute line-level risk masked by enterprise averages",
      "Controls misaligned with product risk",
      "Assessment not refreshed after change",
      "Emerging product risk underweighted",
    ],
  },
  "/dormant-accounts": {
    title: "Dormant Accounts",
    summary: [
      "The Dormant Accounts module monitors inactive accounts for the distinctive risks they present — sudden reactivation, use as laundering conduits, and unauthorised access — applying heightened scrutiny to dormancy transitions. Dormant accounts are an attractive vehicle for illicit activity precisely because they attract less routine attention.",
      "Reactivation of a long-dormant account, or unexpected activity within one, is a recognised red flag. The module enforces monitoring of the dormant population and escalates anomalous transitions for review.",
    ],
    regulatory: [
      "CBUAE dormant-account regulations",
      "UAE FDL No.20/2018 Art.16 — ongoing monitoring",
      "FATF Recommendation 10 — ongoing due diligence",
      "CBUAE AML/CFT Standards — dormant-account controls",
    ],
    requirements: [
      "Identify and flag dormant accounts",
      "Apply heightened scrutiny to reactivation",
      "Monitor dormant accounts for anomalous activity",
      "Re-verify CDD on reactivation",
      "Evidence dormant-account monitoring",
    ],
    controls: [
      "Dormancy detection and flagging",
      "Reactivation-trigger monitoring",
      "Enhanced scrutiny on dormant activity",
      "Audit-chain record of dormancy events",
    ],
    reporting: [
      "Escalation of anomalous reactivations",
      "STR/SAR referral where suspicion arises",
      "Dormant-portfolio metrics to governance",
    ],
    risks: [
      "Sudden reactivation of a long-dormant account",
      "Unexpected activity in a dormant account",
      "Use of dormant accounts as laundering conduits",
      "Unauthorised access or takeover",
    ],
  },
  "/outsourcing-register": {
    title: "Outsourcing Register",
    summary: [
      "The Outsourcing Register maintains the institution's record of outsourced functions and third-party service providers, capturing the risk assessment, due diligence, and oversight arrangements for each. It governs the residual responsibility the institution retains even when functions are delegated.",
      "Outsourcing does not transfer accountability: the institution remains responsible for outsourced AML-relevant activity. The module evidences that each arrangement is assessed, governed, and monitored, and that critical functions retain adequate oversight.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 — reliance and outsourcing",
      "UAE FDL No.20/2018 — retained responsibility",
      "FATF Recommendation 17 — reliance on third parties",
      "CBUAE outsourcing regulations",
      "SOC2 CC9.2 — vendor and business-partner management",
    ],
    requirements: [
      "Register all material outsourcing arrangements",
      "Assess and document the risk of each arrangement",
      "Define oversight and audit rights",
      "Monitor provider performance and compliance",
      "Evidence retained institutional responsibility",
    ],
    controls: [
      "Outsourcing register and risk classification",
      "Oversight-arrangement tracking",
      "Provider-compliance monitoring",
      "Audit-chain record of outsourcing decisions",
    ],
    reporting: [
      "Outsourcing-risk reporting to governance",
      "Escalation of provider-compliance gaps",
      "Critical-function oversight reporting",
    ],
    risks: [
      "Critical functions outsourced without adequate oversight",
      "Provider non-compliance with AML obligations",
      "Concentration risk in a single provider",
      "Loss of audit rights or visibility",
    ],
  },
  "/coi-register": {
    title: "Conflicts of Interest Register",
    summary: [
      "The Conflicts of Interest Register captures, assesses, and manages actual and potential conflicts across the institution, ensuring that conflicts which could compromise AML decision-making are identified and mitigated. Undisclosed conflicts can undermine the independence of compliance and approval decisions.",
      "A conflicted approver or investigator is a control weakness; supervisors expect conflicts to be surfaced and managed. The module maintains the register, tracks mitigation, and evidences that conflicts are not silently influencing risk decisions.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — governance integrity",
      "UAE FDL No.20/2018 — internal control independence",
      "FATF Recommendation 18 — internal controls",
      "CBUAE AML/CFT Standards — conflict management",
      "SOC2 CC1.x — integrity and ethical values",
    ],
    requirements: [
      "Capture actual and potential conflicts",
      "Assess the impact of each conflict on AML decisions",
      "Define and track mitigation measures",
      "Exclude conflicted parties from affected decisions",
      "Maintain an auditable conflicts register",
    ],
    controls: [
      "Conflict capture and assessment",
      "Mitigation tracking",
      "Decision-exclusion enforcement",
      "Audit-chain record of conflict management",
    ],
    reporting: [
      "Conflicts reporting to governance",
      "Escalation of unmitigated conflicts",
      "Conflict-register review reporting",
    ],
    risks: [
      "Undisclosed conflict affecting an approval",
      "Conflicted investigator on a related case",
      "Unmitigated material conflicts",
      "Conflicts concentrated in key decision roles",
    ],
  },
  "/voluntary-disclosure": {
    title: "Voluntary Disclosure",
    summary: [
      "The Voluntary Disclosure module manages proactive disclosures to regulators of identified compliance breaches, structuring the assessment, approval, and submission of voluntary disclosures and tracking any resulting remediation. Proactive disclosure can mitigate enforcement consequences and demonstrates a cooperative compliance posture.",
      "When a breach is identified, the decision to disclose voluntarily — and the manner of doing so — carries significant regulatory consequence. The module ensures these decisions are governed, evidenced, and followed through to remediation.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 — cooperation with supervisors",
      "UAE Cabinet Decision No.10/2019 — supervisory engagement",
      "FATF Recommendation 35 — proportionate sanctions",
      "CBUAE AML/CFT Standards — self-reporting",
    ],
    requirements: [
      "Assess identified breaches for disclosure",
      "Govern and approve the disclosure decision",
      "Submit disclosures completely and promptly",
      "Track resulting remediation to closure",
      "Evidence the disclosure and its basis",
    ],
    controls: [
      "Breach-assessment workflow",
      "Disclosure-approval gating",
      "Remediation tracking",
      "Audit-chain record of disclosures",
    ],
    reporting: [
      "Voluntary disclosure to the competent authority",
      "Board reporting of disclosure decisions",
      "Remediation-progress reporting",
    ],
    risks: [
      "Failure to disclose a material breach",
      "Incomplete or delayed disclosure",
      "Disclosure made without proper governance",
      "Unremediated root cause after disclosure",
    ],
  },
  "/operator": {
    title: "Operator Console",
    summary: [
      "The Operator Console provides the immutable audit-trail and operational-control surface for compliance operators, exposing the append-only decision record and the levers needed to administer the platform within governed bounds. It is the operational window onto the institution's evidentiary backbone.",
      "An immutable, queryable audit trail is the foundation of regulatory defensibility. The console gives operators governed visibility into that trail and the platform's operational state without permitting any action that would compromise audit integrity.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 Art.18 — AI decision audit trail",
      "UAE FDL No.20/2018 — record-keeping obligations",
      "FATF Recommendation 11 — record retention",
      "CBUAE AML/CFT Standards — auditability",
      "SOC2 CC7.x — operational monitoring",
    ],
    requirements: [
      "Preserve an append-only, tamper-evident audit trail",
      "Provide governed operator access to records",
      "Prevent any action compromising audit integrity",
      "Log all operator actions",
      "Support reproducible audit retrieval",
    ],
    controls: [
      "Append-only HMAC-SHA256 audit chain",
      "Role-based operator access",
      "Operator-action logging",
      "Tamper-evidence verification",
    ],
    reporting: [
      "Audit-trail evidence packs for supervisors",
      "Operator-action reporting to governance",
      "Integrity-verification reporting",
    ],
    risks: [
      "Attempts to alter or delete audit records",
      "Excessive operator privilege",
      "Unlogged administrative actions",
      "Audit-retrieval gaps",
    ],
  },
  "/eval-kpi": {
    title: "Evaluation KPIs",
    summary: [
      "The Evaluation KPIs module surfaces the metrics that measure the effectiveness of the AML/CFT and AI-governance programme — detection rates, false-positive ratios, filing timeliness, model performance, and control coverage. It converts the FATF expectation of demonstrable effectiveness into tracked, reportable indicators.",
      "Supervisors increasingly assess effectiveness, not just technical compliance. The module quantifies how well controls actually perform and trends those indicators so that degradation is detected and addressed proactively.",
    ],
    regulatory: [
      "FATF Methodology — effectiveness assessment",
      "FATF Recommendation 1 — risk-based effectiveness",
      "UAE FDL No.10/2025 — AI performance governance",
      "CBUAE AML/CFT Standards — programme effectiveness",
      "SOC2 CC4.1 — performance monitoring",
    ],
    requirements: [
      "Define KPIs aligned to programme objectives",
      "Measure detection, filing, and model performance",
      "Trend indicators to detect degradation",
      "Act on adverse KPI movements",
      "Evidence KPI review and response",
    ],
    controls: [
      "KPI computation and trending",
      "Threshold-based alerting on degradation",
      "Effectiveness dashboarding",
      "Audit-chain record of KPI reviews",
    ],
    reporting: [
      "KPI reporting to the Board and supervisors",
      "Escalation of adverse trends",
      "Effectiveness evidence for examinations",
    ],
    risks: [
      "Declining detection effectiveness",
      "Rising false-positive burden",
      "Filing-timeliness deterioration",
      "Model-performance drift",
    ],
  },

  // ════════════════════════ GOVERNANCE & AUDIT ════════════════════════
  "/mlro-advisor": {
    title: "MLRO Advisor",
    summary: [
      "The MLRO Advisor provides AI-assisted decision support to the Money Laundering Reporting Officer, synthesising case data, regulatory references, and typology knowledge to inform — but never to replace — the MLRO's judgement. Every recommendation is governed under the institution's responsible-AI controls, with human oversight mandatory for any decision of consequence.",
      "The MLRO holds personal regulatory responsibility for reporting decisions; AI can accelerate analysis but cannot assume that accountability. The module enforces human-in-the-loop oversight, records the AI's contribution to each decision, and keeps the MLRO firmly in control.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.15 — MLRO reporting responsibility",
      "UAE FDL No.10/2025 — AI governance and human oversight",
      "UAE Cabinet Decision No.10/2019 Art.16 — MLRO appointment",
      "FATF Recommendation 20 — suspicious-transaction reporting",
      "UNESCO AI Ethics Recommendation — human oversight",
    ],
    requirements: [
      "Retain human MLRO accountability for all decisions",
      "Subject AI recommendations to human review",
      "Record the AI contribution to each decision",
      "Apply PII redaction before model processing",
      "Govern AI use under the responsible-AI framework",
    ],
    controls: [
      "Human-in-the-loop decision enforcement",
      "PII redaction in the LLM pipeline",
      "Hallucination gating on AI output",
      "Audit-chain record of AI-assisted decisions",
    ],
    reporting: [
      "AI-assisted-decision reporting to governance",
      "Escalation of high-consequence recommendations",
      "Responsible-AI compliance reporting",
    ],
    risks: [
      "Over-reliance on AI displacing MLRO judgement",
      "Hallucinated or unsupported recommendations",
      "PII leakage to the model",
      "Unrecorded AI influence on decisions",
    ],
  },
  "/responsible-ai": {
    title: "Responsible AI",
    summary: [
      "The Responsible AI module operationalises UNESCO AI-ethics principles and UAE FDL 10/2025 obligations, monitoring fairness, bias, human oversight, and transparency across the platform's AI faculties. It enforces a bias-ratio threshold tighter than the FATF floor and surfaces ethics, fairness, and audit evidence for governance and regulators.",
      "AI in compliance must itself be governed: a biased or opaque model can produce discriminatory or indefensible outcomes. The module measures these risks continuously and provides the controls and evidence that demonstrate responsible, lawful AI use.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — AI governance and accountability",
      "UNESCO Recommendation on the Ethics of AI",
      "FATF Recommendation 10 — non-discrimination",
      "NIST AI Risk Management Framework",
      "CBUAE AML/CFT Standards — fair treatment",
    ],
    requirements: [
      "Monitor model bias against defined thresholds",
      "Ensure human oversight of consequential AI decisions",
      "Maintain transparency and explainability",
      "Document fairness and ethics assessments",
      "Remediate bias breaches promptly",
    ],
    controls: [
      "Bias-ratio monitoring (threshold 1.15)",
      "Human-oversight enforcement",
      "Fairness and ethics scorecards",
      "Audit-chain record of AI governance",
    ],
    reporting: [
      "Bias and fairness reporting to governance",
      "Escalation of threshold breaches",
      "Responsible-AI evidence for supervisors",
    ],
    risks: [
      "Bias ratio exceeding the institutional threshold",
      "Insufficient human oversight of AI decisions",
      "Opaque or unexplainable model behaviour",
      "Unremediated fairness breaches",
    ],
  },
  "/governance/inspection-room": {
    title: "Inspection Room",
    summary: [
      "The Inspection Room assembles a regulator-ready evidence pack on demand, consolidating audit-chain records, policies, screening and filing evidence, and governance artefacts into a coherent, navigable submission. It is the institution's rapid-response capability for supervisory examinations and information requests.",
      "When a supervisor calls, the ability to produce complete, reconcilable evidence quickly is itself a measure of control maturity. The module pre-stages and assembles that evidence so the institution can respond comprehensively and without scramble.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 — supervisory cooperation",
      "UAE FDL No.10/2025 Art.18 — AI audit-trail disclosure",
      "FATF Recommendation 11 — record availability",
      "FATF Recommendation 27 — supervisory powers",
      "CBUAE AML/CFT Standards — examination readiness",
    ],
    requirements: [
      "Assemble complete, reconcilable evidence on demand",
      "Provide audit-chain, policy, and filing evidence",
      "Ensure evidence integrity and traceability",
      "Support timely supervisory responses",
      "Preserve the composition of each evidence pack",
    ],
    controls: [
      "On-demand evidence-pack assembly",
      "Audit-chain integration",
      "Evidence-integrity verification",
      "Audit-chain record of pack generation",
    ],
    reporting: [
      "Evidence-pack delivery to supervisors",
      "Examination-response tracking",
      "Readiness reporting to governance",
    ],
    risks: [
      "Incomplete or unreconcilable evidence",
      "Delayed examination responses",
      "Evidence-integrity gaps",
      "Missing artefacts for a control area",
    ],
  },
  "/regulatory": {
    title: "Regulatory Library",
    summary: [
      "The Regulatory Library is a searchable repository of UAE and FATF regulatory instruments, giving compliance staff authoritative, current access to the obligations that govern their work. It underpins consistent interpretation and supports the regulatory references embedded throughout the platform.",
      "A current, authoritative regulatory reference is foundational: controls and decisions must trace to actual obligations. The module maintains this reference base and makes it readily searchable for staff and for the platform's AI faculties.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 — primary AML/CFT law",
      "UAE FDL No.10/2025 — AI governance",
      "UAE Cabinet Decision No.10/2019 — implementing regulations",
      "FATF Recommendations and Methodology",
      "CBUAE AML/CFT Standards",
    ],
    requirements: [
      "Maintain current, authoritative regulatory texts",
      "Provide searchable access for staff",
      "Track amendments and supersessions",
      "Link obligations to platform controls",
      "Evidence the currency of the library",
    ],
    controls: [
      "Searchable regulatory repository",
      "Amendment and version tracking",
      "Obligation-to-control linkage",
      "Audit-chain record of library updates",
    ],
    reporting: [
      "Library-currency reporting to governance",
      "Escalation of unincorporated amendments",
    ],
    risks: [
      "Reliance on superseded regulatory text",
      "Gaps in coverage of applicable instruments",
      "Stale references in controls",
      "Inconsistent interpretation across staff",
    ],
  },
  "/policies": {
    title: "Policies & SOPs",
    summary: [
      "The Policies & SOPs module maintains the institution's AML programme charter, policies, and standard operating procedures, governing their approval, versioning, and periodic review. It is the documented control framework that supervisors expect every regulated institution to maintain and follow.",
      "Policies are the institution's stated commitments; SOPs translate them into action. The module ensures both are current, board-approved, version-controlled, and aligned to the regulatory obligations and controls they govern.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — policies and procedures",
      "UAE FDL No.20/2018 — internal control framework",
      "FATF Recommendation 18 — internal policies and controls",
      "CBUAE AML/CFT Standards — documented procedures",
      "SOC2 CC5.3 — policy deployment",
    ],
    requirements: [
      "Maintain a board-approved AML programme charter",
      "Version-control all policies and SOPs",
      "Review and refresh on a defined cadence",
      "Align documents to current obligations",
      "Evidence approval and distribution",
    ],
    controls: [
      "Policy versioning and approval tracking",
      "Periodic-review scheduling",
      "Obligation-alignment mapping",
      "Audit-chain record of policy changes",
    ],
    reporting: [
      "Policy-currency reporting to the Board",
      "Escalation of overdue reviews",
      "Policy-framework evidence for examinations",
    ],
    risks: [
      "Policies not aligned to current obligations",
      "Overdue policy reviews",
      "Unapproved or unversioned documents",
      "SOPs diverging from actual practice",
    ],
  },
  "/typology-library": {
    title: "Typology Library",
    summary: [
      "The Typology Library is a curated, AI-searchable repository of 500+ money-laundering typologies, including UAE-specific localised content, that equips investigators to recognise emerging laundering methods. It connects the institution's monitoring and investigation to the evolving threat landscape.",
      "Effective detection depends on knowing what to look for; typologies encode that knowledge. The module keeps the institution's typology base current and makes it searchable so that monitoring rules and investigations reflect real-world methods.",
    ],
    regulatory: [
      "FATF typologies and red-flag guidance",
      "UAE FDL No.20/2018 — predicate-offence awareness",
      "FATF Recommendation 1 — understanding evolving risk",
      "CBUAE AML/CFT Standards — typology awareness",
      "FATF Methodology — risk understanding",
    ],
    requirements: [
      "Maintain a current, comprehensive typology base",
      "Include UAE-specific and emerging typologies",
      "Make typologies searchable for investigators",
      "Link typologies to monitoring rules",
      "Refresh as new methods emerge",
    ],
    controls: [
      "AI-searchable typology repository",
      "UAE-localised content curation",
      "Typology-to-rule linkage",
      "Audit-chain record of library updates",
    ],
    reporting: [
      "Typology-coverage reporting to governance",
      "Escalation of newly emerging typologies",
    ],
    risks: [
      "Detection gaps for emerging typologies",
      "Stale or incomplete typology coverage",
      "Monitoring rules disconnected from typologies",
      "UAE-specific methods underrepresented",
    ],
  },
  "/playbook": {
    title: "Compliance Playbook",
    summary: [
      "The Compliance Playbook provides step-by-step AML/CFT operational playbooks that standardise how staff execute key compliance processes, from alert investigation to STR filing to sanctions response. It codifies institutional knowledge into repeatable, auditable procedures.",
      "Consistency is a hallmark of a mature control environment; playbooks ensure that critical processes are executed the same defensible way regardless of who performs them. The module maintains these procedures and links them to the obligations they satisfy.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — documented procedures",
      "UAE FDL No.20/2018 — internal controls",
      "FATF Recommendation 18 — internal procedures",
      "CBUAE AML/CFT Standards — operational consistency",
      "SOC2 CC5.x — control execution",
    ],
    requirements: [
      "Maintain step-by-step procedures for key processes",
      "Align playbooks to current obligations",
      "Version-control and review playbooks",
      "Train staff on playbook execution",
      "Evidence consistent application",
    ],
    controls: [
      "Playbook repository and versioning",
      "Obligation-alignment mapping",
      "Execution-consistency tracking",
      "Audit-chain record of playbook use",
    ],
    reporting: [
      "Playbook-currency reporting to governance",
      "Escalation of process deviations",
    ],
    risks: [
      "Inconsistent execution of key processes",
      "Playbooks diverging from regulation",
      "Untrained staff bypassing procedures",
      "Stale playbooks not reflecting current practice",
    ],
  },
  "/corrections": {
    title: "Data Corrections",
    summary: [
      "The Data Corrections module manages data-subject access and correction requests, governing how the institution responds to individuals exercising their data rights while preserving AML record-keeping obligations. It balances data-protection rights against the regulatory imperative to retain compliance records.",
      "Data-subject rights and AML retention can conflict; corrections must be handled without compromising the integrity of the compliance record. The module governs this carefully — correcting genuine errors while preserving the auditable history regulators require.",
    ],
    regulatory: [
      "UAE FDL No.45/2021 — Personal Data Protection Law",
      "UAE FDL No.20/2018 — record-keeping obligations",
      "FATF Recommendation 11 — record retention",
      "UAE FDL No.10/2025 — AI data governance",
      "GDPR/PDPL — data-subject rights",
    ],
    requirements: [
      "Process access and correction requests within mandated timeframes",
      "Correct genuine data errors",
      "Preserve AML records against improper erasure",
      "Balance data rights against retention obligations",
      "Evidence the handling of each request",
    ],
    controls: [
      "Request intake and lifecycle tracking",
      "Correction workflow with retention safeguards",
      "Audit-chain record of corrections",
      "Retention-conflict resolution logic",
    ],
    reporting: [
      "Data-request handling reporting to governance",
      "Escalation of retention conflicts",
      "Compliance reporting to the data-protection authority where required",
    ],
    risks: [
      "Improper erasure of AML records",
      "Missed data-request deadlines",
      "Uncorrected genuine data errors",
      "Retention/erasure conflicts mishandled",
    ],
  },
  "/ai-incident-playbook": {
    title: "AI Incident Playbook",
    summary: [
      "The AI Incident Playbook governs the institution's response to AI failures — hallucination, bias spikes, data poisoning, and prompt injection — under UAE FDL 10/2025. It defines detection, containment, escalation, and recovery for each failure mode, ensuring AI risks are managed with the same rigour as any operational incident.",
      "AI systems introduce novel failure modes that can produce non-compliant or harmful outcomes; FDL 10/2025 requires these to be governed. The module provides the structured response that contains AI incidents and evidences the institution's control over its AI estate.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — AI incident governance",
      "NIST AI RMF — MANAGE function (incident response)",
      "UNESCO AI Ethics Recommendation — accountability",
      "UAE FDL No.20/2018 — operational-control obligations",
      "SOC2 CC7.3/CC7.4 — incident response",
    ],
    requirements: [
      "Define response procedures per AI failure mode",
      "Detect and contain AI incidents promptly",
      "Escalate by severity to appropriate authority",
      "Recover and restore safe operation",
      "Evidence the full incident lifecycle",
    ],
    controls: [
      "Failure-mode-specific response playbooks",
      "Detection and containment workflow",
      "Severity-based escalation",
      "Audit-chain record of AI incidents",
    ],
    reporting: [
      "AI-incident reporting to governance and the Board",
      "Regulatory notification where mandated",
      "Lessons-learned feed to continuous improvement",
    ],
    risks: [
      "Model hallucination producing false output",
      "Bias spike breaching fairness thresholds",
      "Data-poisoning of training or reference data",
      "Prompt-injection manipulating model behaviour",
    ],
  },
  "/ai-governance": {
    title: "AI Governance Framework",
    summary: [
      "The AI Governance Framework is the institution's enterprise AI-governance hub, organising eleven components — stakeholder ownership, governance structure, policy, risk management, responsible-AI practice, model lifecycle, data governance, compliance and audit, monitoring, incident management, and continuous improvement — into a single, coherent oversight surface. It surfaces the NIST AI RMF scorecard, the AI risk register, MITRE ATLAS probe coverage, and model-lifecycle status.",
      "FDL 10/2025 requires demonstrable governance of AI used in regulated decisions. This module consolidates the institution's AI-governance evidence and controls so that accountability, risk, and oversight across the AI estate are visible, measurable, and defensible to a regulator.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — comprehensive AI governance",
      "NIST AI Risk Management Framework — GOVERN/MAP/MEASURE/MANAGE",
      "UNESCO Recommendation on the Ethics of AI",
      "UAE FDL No.20/2018 — accountable decision-making",
      "ISO/IEC 42001 — AI management systems",
    ],
    requirements: [
      "Assign stakeholder ownership and decision rights",
      "Maintain an AI risk register with mitigations",
      "Govern the model lifecycle with approval gates",
      "Monitor AI against the NIST AI RMF",
      "Manage AI incidents and drive continuous improvement",
    ],
    controls: [
      "Eleven-component governance dashboard",
      "AI risk register and model-lifecycle tracking",
      "NIST AI RMF scorecard and MITRE ATLAS heatmap",
      "Audit-chain record of governance actions",
    ],
    reporting: [
      "AI-governance reporting to the Board",
      "NIST AI RMF maturity reporting",
      "Regulatory disclosure of AI governance under FDL 10/2025",
    ],
    risks: [
      "Ungoverned or shadow AI in regulated decisions",
      "Unmitigated entries in the AI risk register",
      "Gaps in NIST RMF or ATLAS coverage",
      "Models deployed without lifecycle approval",
    ],
  },
  "/shadow-ai": {
    title: "Shadow AI Register",
    summary: [
      "The Shadow AI Register detects and remediates unauthorised AI tools in use across the institution, identifying no-DPA vendors and data-classification risks that arise when staff adopt AI services outside governance. It closes the gap between sanctioned AI and the tools people actually use.",
      "Unsanctioned AI can exfiltrate regulated data to ungoverned services and produce decisions outside the institution's controls. The module surfaces this shadow estate, assesses its risk, and drives remediation so that all AI handling regulated data is governed.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — governance of all AI use",
      "UAE FDL No.45/2021 — data-protection in AI processing",
      "NIST AI RMF — MAP function (context and inventory)",
      "UAE FDL No.20/2018 — data-handling controls",
      "SOC2 CC6.x — unauthorised-tool controls",
    ],
    requirements: [
      "Detect unauthorised AI tools in use",
      "Assess data-classification and DPA risk",
      "Remediate or sanction shadow AI",
      "Maintain an AI-usage inventory",
      "Evidence remediation actions",
    ],
    controls: [
      "Shadow-AI detection and inventory",
      "No-DPA vendor flagging",
      "Data-classification risk scoring",
      "Audit-chain record of remediation",
    ],
    reporting: [
      "Shadow-AI exposure reporting to governance",
      "Escalation of regulated-data exposure",
      "Remediation-progress reporting",
    ],
    risks: [
      "Regulated data sent to no-DPA AI vendors",
      "Decisions made by ungoverned AI tools",
      "Unknown AI in the processing estate",
      "Data-classification breaches via shadow AI",
    ],
  },
  "/vendor-ai-audit": {
    title: "Vendor AI Audit",
    summary: [
      "The Vendor AI Audit module conducts due diligence on third-party AI vendors, assessing data-processing agreements, model cards, penetration-test results, and service-level commitments, and preserving a CBUAE-aligned audit trail. It extends AI governance to the models the institution consumes from others.",
      "When AI capability is sourced externally, the institution remains accountable for its governance. The module ensures each AI vendor is assessed against DPA, security, transparency, and SLA criteria before and during use, with the assessment fully evidenced.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — third-party AI governance",
      "UAE FDL No.45/2021 — data-processor obligations",
      "NIST AI RMF — supply-chain AI risk",
      "CBUAE AML/CFT Standards — vendor audit trail",
      "SOC2 CC9.2 — vendor management",
    ],
    requirements: [
      "Assess vendor DPAs and data handling",
      "Review model cards and transparency disclosures",
      "Verify penetration testing and security posture",
      "Confirm SLAs and support commitments",
      "Maintain a CBUAE-aligned vendor audit trail",
    ],
    controls: [
      "Vendor-AI due-diligence workflow",
      "Model-card and DPA review tracking",
      "Penetration-test and SLA verification",
      "Audit-chain record of vendor assessments",
    ],
    reporting: [
      "Vendor-AI risk reporting to governance",
      "Escalation of vendor-control gaps",
      "Audit-trail evidence for CBUAE",
    ],
    risks: [
      "Vendor without an adequate DPA",
      "Opaque vendor models lacking model cards",
      "Untested vendor security posture",
      "SLA failures degrading governed AI",
    ],
  },

  // ════════════════════════ KYC TOOLS ════════════════════════
  "/osint": {
    title: "OSINT",
    summary: [
      "The OSINT module harvests open-source intelligence — domains, usernames, and public footprints — to enrich due diligence and investigation with externally verifiable information. It supports the independent-source verification that effective CDD requires and strengthens adverse-media and network analysis.",
      "Open-source signals can corroborate or contradict customer-supplied data and surface risk invisible to internal systems. The module gathers this intelligence systematically and feeds it into the institution's risk assessment with an auditable provenance.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.4 — independent-source verification",
      "UAE FDL No.20/2018 Art.18 — due diligence enrichment",
      "FATF Recommendation 10 — reliable information sources",
      "CBUAE AML/CFT Standards — adverse-information gathering",
    ],
    requirements: [
      "Gather open-source intelligence from reliable sources",
      "Corroborate customer data against external signals",
      "Record provenance of OSINT findings",
      "Integrate findings into risk assessment",
      "Respect lawful data-gathering boundaries",
    ],
    controls: [
      "Domain and username harvesting",
      "Adverse-footprint detection",
      "Provenance recording",
      "Audit-chain record of OSINT use",
    ],
    reporting: [
      "OSINT findings into case and CDD records",
      "Escalation of adverse OSINT signals",
    ],
    risks: [
      "Adverse public footprint contradicting CDD",
      "Identity inconsistencies across sources",
      "Links to high-risk entities or content",
      "Unverifiable or low-quality sources",
    ],
  },
  "/gleif": {
    title: "GLEIF / LEI Lookup",
    summary: [
      "The GLEIF / LEI Lookup module verifies legal entities against the Global Legal Entity Identifier Foundation registry, confirming identity, status, and registration data for corporate customers and counterparties. It provides an authoritative, independent source for entity verification.",
      "The LEI is a globally recognised, regulator-endorsed entity identifier; verifying against GLEIF strengthens the reliability of entity CDD. The module integrates this lookup into onboarding and ongoing diligence with a recorded verification basis.",
    ],
    regulatory: [
      "FATF Recommendation 24 — legal-person identification",
      "UAE Cabinet Decision No.10/2019 Art.4 — reliable sources",
      "UAE FDL No.20/2018 Art.18 — entity verification",
      "FATF Recommendation 16 — originator/beneficiary identification",
    ],
    requirements: [
      "Verify entities against the GLEIF registry",
      "Confirm LEI status and registration data",
      "Record the verification basis",
      "Re-verify on status change",
      "Integrate LEI data into entity CDD",
    ],
    controls: [
      "GLEIF registry lookup and matching",
      "LEI status verification",
      "Verification-basis recording",
      "Audit-chain record of lookups",
    ],
    reporting: [
      "Entity-verification evidence into CDD",
      "Escalation of lapsed or invalid LEIs",
    ],
    risks: [
      "Lapsed or revoked LEI status",
      "Entity data mismatching the registry",
      "Unverifiable corporate identity",
      "Stale registration information",
    ],
  },
  "/entity-graph": {
    title: "Entity Graph",
    summary: [
      "The Entity Graph visualises relationships and ownership networks across customers, counterparties, and connected parties, revealing the connections that individual records conceal. It supports network-based risk detection — hidden links to sanctioned or high-risk parties, and clusters indicative of organised activity.",
      "Money laundering is frequently a network phenomenon; risk that is invisible at the single-entity level emerges in the graph. The module makes these relationships navigable and feeds network risk into the institution's assessment.",
    ],
    regulatory: [
      "FATF Recommendation 24/25 — ownership and control transparency",
      "UAE FDL No.20/2018 Art.18 — connected-party identification",
      "UAE Cabinet Decision No.10/2019 — relationship analysis",
      "FATF Recommendation 10 — beneficial-ownership networks",
    ],
    requirements: [
      "Map relationships across connected parties",
      "Detect links to sanctioned or high-risk entities",
      "Identify clusters indicative of organised risk",
      "Integrate network risk into assessment",
      "Record network-analysis findings",
    ],
    controls: [
      "Relationship and ownership graphing",
      "High-risk-link detection",
      "Cluster-risk analysis",
      "Audit-chain record of graph analyses",
    ],
    reporting: [
      "Network-risk findings into case records",
      "Escalation of high-risk connections",
    ],
    risks: [
      "Hidden links to sanctioned parties",
      "Networks indicative of organised laundering",
      "Concealed common control across entities",
      "Undisclosed connected-party exposure",
    ],
  },
  "/domain-intel": {
    title: "Domain Intelligence",
    summary: [
      "The Domain Intelligence module analyses domains and web infrastructure associated with customers and counterparties, surfacing risk signals such as recently registered domains, suspicious hosting, and infrastructure shared with known-bad actors. It strengthens diligence on entities whose legitimacy is asserted online.",
      "Web infrastructure can corroborate or undermine a counterparty's claimed legitimacy; fraudulent operations frequently share tell-tale infrastructure traits. The module brings this technical intelligence into the risk picture with recorded provenance.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.4 — independent verification",
      "UAE FDL No.20/2018 Art.18 — diligence enrichment",
      "FATF Recommendation 10 — reliable information",
      "CBUAE AML/CFT Standards — counterparty verification",
    ],
    requirements: [
      "Analyse domain and infrastructure risk signals",
      "Detect recently registered or suspicious domains",
      "Identify infrastructure shared with bad actors",
      "Record findings with provenance",
      "Integrate signals into risk assessment",
    ],
    controls: [
      "Domain and infrastructure analysis",
      "Risk-signal detection",
      "Provenance recording",
      "Audit-chain record of analyses",
    ],
    reporting: [
      "Domain-intelligence findings into CDD",
      "Escalation of high-risk infrastructure",
    ],
    risks: [
      "Recently registered domains masking new fronts",
      "Infrastructure shared with known-bad actors",
      "Mismatched or concealed registrant data",
      "Indicators of fraudulent web presence",
    ],
  },
  "/crypto-risk": {
    title: "Crypto Risk",
    summary: [
      "The Crypto Risk module assesses wallet and virtual-asset exposure, screening addresses and flows against sanctions and illicit-activity intelligence and scoring counterparty risk in line with the FATF travel-rule regime. It extends the institution's controls to virtual-asset risk.",
      "Virtual assets present distinct laundering and sanctions-evasion risk that traditional controls do not capture. The module brings wallet screening, exposure scoring, and travel-rule awareness into the institution's framework with an auditable basis.",
    ],
    regulatory: [
      "FATF Recommendation 15 — virtual assets and VASPs",
      "FATF Travel Rule — originator/beneficiary information",
      "UAE FDL No.20/2018 — virtual-asset proceeds",
      "CBUAE / VARA virtual-asset regulations",
      "FATF Recommendation 6/7 — sanctions on virtual assets",
    ],
    requirements: [
      "Screen wallet addresses against sanctions and illicit intel",
      "Assess counterparty and exposure risk",
      "Apply travel-rule information requirements",
      "Record virtual-asset risk decisions",
      "Re-screen on new intelligence",
    ],
    controls: [
      "Wallet and address screening",
      "Exposure and counterparty risk scoring",
      "Travel-rule data checks",
      "Audit-chain record of crypto-risk decisions",
    ],
    reporting: [
      "Crypto-risk findings into case records",
      "STR/SAR referral where illicit exposure arises",
      "Escalation of sanctioned-wallet exposure",
    ],
    risks: [
      "Exposure to sanctioned or illicit wallets",
      "Mixing/tumbling obscuring fund origin",
      "Missing travel-rule counterparty data",
      "High-risk VASP counterparties",
    ],
  },
  "/vessel-check": {
    title: "Vessel Check",
    summary: [
      "The Vessel Check module screens vessels for sanctions exposure and dark-fleet indicators — AIS gaps, flag-hopping, and ownership obfuscation — supporting trade-finance and maritime due diligence. It addresses the elevated sanctions-evasion risk in shipping.",
      "Maritime sanctions evasion relies on disguising vessel identity, ownership, and movement; detecting these patterns is essential to trade-related diligence. The module screens vessels and surfaces dark-fleet behaviour with a recorded basis.",
    ],
    regulatory: [
      "FATF Recommendation 6/7 — sanctions screening",
      "UAE FDL No.20/2018 — sanctions compliance",
      "OFAC/UN maritime sanctions advisories",
      "FATF Recommendation 16 — trade-finance data",
      "CBUAE Guidance on Targeted Financial Sanctions",
    ],
    requirements: [
      "Screen vessels against sanctions lists",
      "Detect dark-fleet and AIS-manipulation indicators",
      "Assess vessel ownership and flag risk",
      "Record vessel-screening decisions",
      "Re-screen on list and intelligence updates",
    ],
    controls: [
      "Vessel sanctions screening",
      "Dark-fleet indicator detection",
      "Ownership and flag-risk analysis",
      "Audit-chain record of vessel checks",
    ],
    reporting: [
      "Vessel-risk findings into trade-finance diligence",
      "Escalation of sanctioned-vessel exposure",
      "STR/SAR referral where evasion is indicated",
    ],
    risks: [
      "AIS gaps and location spoofing",
      "Flag-hopping and identity changes",
      "Obscured vessel ownership",
      "Links to sanctioned trades or ports",
    ],
  },
  "/benford": {
    title: "Benford Analysis",
    summary: [
      "The Benford Analysis module applies Benford's-law statistical testing to transaction and financial data to surface anomalies indicative of fabrication or manipulation. It provides a quantitative, evidence-based screen for data that has been artificially constructed rather than naturally generated.",
      "Naturally occurring financial data follows predictable digit distributions; significant deviation can indicate manipulation or fraud. The module flags such deviations as investigative leads, complementing rule-based monitoring with statistical anomaly detection.",
    ],
    regulatory: [
      "FATF Recommendation 10 — scrutiny of transactions",
      "UAE FDL No.20/2018 — detection of suspicious activity",
      "FATF Methodology — analytical effectiveness",
      "CBUAE AML/CFT Standards — anomaly detection",
    ],
    requirements: [
      "Apply Benford testing to appropriate datasets",
      "Flag statistically significant deviations",
      "Treat deviations as investigative leads, not conclusions",
      "Record analysis parameters and results",
      "Integrate findings into investigation",
    ],
    controls: [
      "Benford's-law digit-distribution testing",
      "Statistical-significance flagging",
      "Parameter and result recording",
      "Audit-chain record of analyses",
    ],
    reporting: [
      "Anomaly findings into case records",
      "Escalation of significant deviations",
    ],
    risks: [
      "Fabricated or manipulated transaction data",
      "Artificial structuring of amounts",
      "Data inconsistent with natural distributions",
      "Concealment through rounded or patterned values",
    ],
  },
  "/investigation": {
    title: "Investigation Workbench",
    summary: [
      "The Investigation Workbench is the analyst's consolidated environment for working complex cases, bringing screening, network, transaction, and intelligence data into a single investigative surface with a documented working record. It standardises how deep investigations are conducted and evidenced.",
      "Complex investigations require synthesis across many sources; fragmentation breeds gaps and inconsistency. The workbench consolidates the evidence and the analyst's reasoning into a coherent, auditable record that supports defensible disposition and onward filing.",
    ],
    regulatory: [
      "UAE FDL No.20/2018 Art.15 — assessment of suspicion",
      "UAE Cabinet Decision No.10/2019 Art.17 — investigation process",
      "FATF Recommendation 20 — suspicious-activity assessment",
      "CBUAE AML/CFT Standards — investigation rigour",
      "SOC2 CC7.3 — investigation and resolution",
    ],
    requirements: [
      "Consolidate multi-source evidence per investigation",
      "Document the investigative reasoning",
      "Reach a defensible disposition",
      "Refer reportable findings to STR/SAR workflow",
      "Preserve the investigation record",
    ],
    controls: [
      "Unified investigative data surface",
      "Working-record documentation",
      "Disposition workflow",
      "Audit-chain record of investigation steps",
    ],
    reporting: [
      "STR/SAR referral for reportable findings",
      "Escalation of complex cases to the MLRO",
      "Investigation-quality metrics to governance",
    ],
    risks: [
      "Fragmented evidence yielding incomplete analysis",
      "Undocumented investigative reasoning",
      "Inconsistent disposition standards",
      "Reportable activity not escalated",
    ],
  },
  "/country-risk": {
    title: "Country Risk",
    summary: [
      "The Country Risk module produces single-country risk briefs that assess jurisdictional money-laundering, terrorist-financing, sanctions, and predicate-offence risk, informing geographic risk-rating across CDD and monitoring. Geography is a core risk factor in the FATF risk-based approach.",
      "A customer's or transaction's jurisdictional exposure materially affects its risk; FATF-identified high-risk jurisdictions require enhanced measures. The module provides current, structured country risk that feeds consistently into the institution's assessments.",
    ],
    regulatory: [
      "FATF Recommendation 19 — higher-risk countries",
      "UAE Cabinet Decision No.10/2019 Art.4 — geographic risk",
      "UAE FDL No.20/2018 — risk-based approach",
      "FATF high-risk and monitored jurisdictions lists",
      "CBUAE AML/CFT Standards — country-risk assessment",
    ],
    requirements: [
      "Assess jurisdictional ML/TF and sanctions risk",
      "Apply enhanced measures to high-risk jurisdictions",
      "Incorporate country risk into customer rating",
      "Refresh country risk on list and event changes",
      "Document the country-risk basis",
    ],
    controls: [
      "Single-country risk scoring",
      "FATF-list integration",
      "Country-risk-to-rating linkage",
      "Audit-chain record of assessments",
    ],
    reporting: [
      "Country-risk exposure reporting to governance",
      "Escalation of high-risk-jurisdiction exposure",
    ],
    risks: [
      "Exposure to FATF-listed high-risk jurisdictions",
      "Sanctioned-jurisdiction connections",
      "Elevated predicate-offence geography",
      "Country risk not reflected in ratings",
    ],
  },
  "/geopolitical": {
    title: "Geopolitical Intelligence",
    summary: [
      "The Geopolitical Intelligence module tracks live geopolitical events and maps their impact on the institution's portfolio and risk map, translating sanctions actions, conflicts, and political shifts into concrete exposure assessments. It keeps geographic risk dynamic rather than static.",
      "Sanctions regimes and risk geographies change rapidly with world events; a static country-risk model lags reality. The module connects live events to portfolio exposure so that emerging jurisdictional risk is recognised and acted upon promptly.",
    ],
    regulatory: [
      "FATF Recommendation 19 — higher-risk countries",
      "UAE FDL No.20/2018 — sanctions and geographic risk",
      "FATF Recommendation 6/7 — evolving sanctions",
      "CBUAE Guidance on Targeted Financial Sanctions",
      "FATF Recommendation 1 — dynamic risk understanding",
    ],
    requirements: [
      "Monitor geopolitical events affecting risk",
      "Map events to portfolio exposure",
      "Trigger re-assessment on material shifts",
      "Update geographic risk dynamically",
      "Record event-driven risk changes",
    ],
    controls: [
      "Live geopolitical event monitoring",
      "Portfolio-impact mapping",
      "Dynamic risk-map updating",
      "Audit-chain record of risk changes",
    ],
    reporting: [
      "Geopolitical-exposure reporting to governance",
      "Escalation of newly elevated geographies",
    ],
    risks: [
      "New sanctions actions affecting the portfolio",
      "Conflict-driven risk escalation",
      "Political shifts altering jurisdiction risk",
      "Lagging response to geographic risk change",
    ],
  },
  "/country-risk-map": {
    title: "Country Risk Map",
    summary: [
      "The Country Risk Map presents a global heat-map of jurisdictional risk, giving compliance and governance a portfolio-wide view of geographic exposure at a glance. It aggregates country-level risk into a visual overview that supports strategic risk oversight.",
      "A consolidated geographic view reveals concentration and emerging hot-spots that line-level data obscures. The module visualises the institution's global risk surface so that geographic concentration and change are immediately apparent to decision-makers.",
    ],
    regulatory: [
      "FATF Recommendation 19 — higher-risk countries",
      "UAE FDL No.20/2018 — geographic risk-based approach",
      "FATF Recommendation 1 — portfolio risk understanding",
      "CBUAE AML/CFT Standards — geographic oversight",
    ],
    requirements: [
      "Aggregate country risk into a portfolio view",
      "Highlight geographic concentration and change",
      "Support strategic geographic oversight",
      "Keep the risk map current",
      "Record the basis of map ratings",
    ],
    controls: [
      "Global risk heat-mapping",
      "Concentration and hot-spot highlighting",
      "Map-currency maintenance",
      "Audit-chain record of map updates",
    ],
    reporting: [
      "Geographic-exposure overview to the Board",
      "Escalation of concentration risk",
    ],
    risks: [
      "Undetected geographic concentration",
      "Emerging high-risk hot-spots",
      "Stale geographic risk view",
      "Strategic exposure to sanctioned regions",
    ],
  },
  "/sanctions-evasion": {
    title: "Sanctions Evasion Detection",
    summary: [
      "The Sanctions Evasion Detection module identifies typologies used to circumvent sanctions — front companies, ownership obfuscation, transshipment, and payment layering — applying pattern detection tuned to evasion methods. It targets the deliberate, sophisticated attempts to defeat the institution's sanctions controls.",
      "Determined actors actively engineer their activity to evade screening; detecting evasion requires looking beyond direct matches to the patterns of circumvention. The module brings this specialised detection to bear and evidences each finding.",
    ],
    regulatory: [
      "FATF Recommendation 6/7 — sanctions implementation",
      "UAE FDL No.20/2018 — sanctions evasion as an offence",
      "CBUAE Guidance on Targeted Financial Sanctions",
      "FATF guidance on sanctions-evasion typologies",
      "UAE Cabinet Decision No.74/2020 — TFS",
    ],
    requirements: [
      "Detect sanctions-evasion typologies",
      "Identify front companies and ownership obfuscation",
      "Surface transshipment and layering patterns",
      "Escalate suspected evasion promptly",
      "Record evasion-detection findings",
    ],
    controls: [
      "Evasion-typology pattern detection",
      "Front-company and obfuscation analysis",
      "Layering and transshipment detection",
      "Audit-chain record of findings",
    ],
    reporting: [
      "Escalation of suspected sanctions evasion",
      "STR/SAR and TFS reporting as required",
      "Evasion-risk metrics to governance",
    ],
    risks: [
      "Front companies masking sanctioned principals",
      "Ownership restructuring to evade designation",
      "Transshipment through neutral jurisdictions",
      "Payment layering to obscure sanctioned parties",
    ],
  },
  "/governance/intelligence-tools": {
    title: "Intelligence Tools",
    summary: [
      "The Intelligence Tools module bundles advanced investigative capabilities — the UBO walker, crypto-exposure analysis, and synthetic-identity detection — into a unified analyst toolkit for deep due diligence. It equips investigators with specialised instruments for the hardest diligence problems.",
      "Certain risks — concealed beneficial ownership, crypto exposure, fabricated identities — require purpose-built tools. The module consolidates these capabilities so analysts can pursue complex questions without leaving the governed platform, preserving an auditable trail.",
    ],
    regulatory: [
      "FATF Recommendation 24/25 — ownership transparency",
      "FATF Recommendation 15 — virtual assets",
      "UAE FDL No.20/2018 Art.18 — due diligence",
      "UAE Cabinet Decision No.10/2019 — investigation tools",
      "CBUAE AML/CFT Standards — investigative capability",
    ],
    requirements: [
      "Resolve beneficial ownership via the UBO walker",
      "Assess crypto exposure of subjects",
      "Detect synthetic and fabricated identities",
      "Record tool outputs in the case file",
      "Use tools within governed boundaries",
    ],
    controls: [
      "UBO walker, crypto-exposure, synthetic-ID tooling",
      "Unified investigative toolkit",
      "Output recording to case files",
      "Audit-chain record of tool use",
    ],
    reporting: [
      "Tool findings into investigation records",
      "Escalation of high-risk findings",
    ],
    risks: [
      "Concealed beneficial ownership",
      "Undetected crypto exposure",
      "Synthetic-identity onboarding",
      "Complex structures defeating standard diligence",
    ],
  },
  "/audit-trail": {
    title: "Audit Trail",
    summary: [
      "The Audit Trail module exposes the institution's immutable, append-only decision record, providing tamper-evident evidence of every AI decision, screening result, filing, and four-eyes action. It is the evidentiary foundation on which regulatory defensibility rests.",
      "FDL 10/2025 Art.18 mandates an auditable trail for AI-assisted decisions, and FATF requires record retention. The module guarantees that every consequential action is recorded immutably and can be retrieved and verified on demand.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 Art.18 — AI decision audit trail",
      "UAE FDL No.20/2018 — record-keeping",
      "FATF Recommendation 11 — record retention",
      "CBUAE AML/CFT Standards — auditability",
      "SOC2 CC7.x — audit logging",
    ],
    requirements: [
      "Record every consequential decision immutably",
      "Guarantee tamper-evidence of the record",
      "Retain records for the statutory period",
      "Support verifiable retrieval",
      "Prevent unauthorised alteration",
    ],
    controls: [
      "Append-only HMAC-SHA256 audit chain",
      "Per-request signing",
      "Integrity verification",
      "Retention enforcement",
    ],
    reporting: [
      "Audit-trail evidence to supervisors",
      "Integrity-verification reporting",
      "Retention-compliance reporting",
    ],
    risks: [
      "Attempted tampering with records",
      "Retention gaps or premature deletion",
      "Unverifiable or broken chain segments",
      "Missing entries for consequential actions",
    ],
  },

  // ════════════════════════ INTELLIGENCE ════════════════════════
  "/intel": {
    title: "Live Intelligence Feed",
    summary: [
      "The Live Intelligence Feed aggregates regulatory updates and seven-language adverse-media into a unified, real-time intelligence stream, keeping the institution abreast of emerging risk, designations, and developments relevant to its portfolio. It is the platform's forward-looking risk-awareness layer.",
      "Timely intelligence enables proactive rather than reactive compliance; multi-language coverage is essential in a region with diverse counterparties. The module surfaces relevant developments as they occur and routes them into the institution's risk processes.",
    ],
    regulatory: [
      "FATF Recommendation 1 — current risk understanding",
      "UAE FDL No.20/2018 — awareness of risk developments",
      "FATF Recommendation 19 — high-risk-country awareness",
      "CBUAE AML/CFT Standards — adverse-media monitoring",
    ],
    requirements: [
      "Aggregate regulatory and adverse-media intelligence",
      "Provide multi-language coverage",
      "Surface portfolio-relevant developments",
      "Route intelligence into risk processes",
      "Record intelligence-driven actions",
    ],
    controls: [
      "Unified real-time intelligence aggregation",
      "Seven-language adverse-media coverage",
      "Relevance filtering and routing",
      "Audit-chain record of intelligence actions",
    ],
    reporting: [
      "Intelligence-driven risk alerts to compliance",
      "Escalation of material developments",
    ],
    risks: [
      "Missed designations or regulatory changes",
      "Adverse media in non-English sources overlooked",
      "Delayed response to emerging risk",
      "Portfolio-relevant developments unrouted",
    ],
  },
  "/intelligence-hub": {
    title: "Intelligence Hub",
    summary: [
      "The Intelligence Hub consolidates the platform's analytical, telemetry, red-team, security-audit, status, and API-documentation surfaces into a single operational console. It provides compliance and operations staff a unified view of the system's intelligence faculties and operational health.",
      "Operational visibility across the platform's many faculties is essential to running a controlled environment; fragmentation obscures both capability and risk. The hub centralises these surfaces so that analytical power and system health are visible in one governed place.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — AI-system observability",
      "FATF Recommendation 18 — internal-control monitoring",
      "CBUAE AML/CFT Standards — operational oversight",
      "SOC2 CC7.x — system monitoring",
      "NIST AI RMF — MEASURE function",
    ],
    requirements: [
      "Provide unified access to analytical faculties",
      "Surface telemetry and operational health",
      "Support red-team and security oversight",
      "Document APIs for governed integration",
      "Record operational actions",
    ],
    controls: [
      "Consolidated operational console",
      "Telemetry and status surfacing",
      "Red-team and security-audit access",
      "Audit-chain record of operational use",
    ],
    reporting: [
      "Operational-health reporting to governance",
      "Escalation of system-health degradation",
    ],
    risks: [
      "Operational risk obscured by fragmentation",
      "Undetected system-health degradation",
      "Gaps in red-team or security coverage",
      "Ungoverned API integration",
    ],
  },
  "/system-card": {
    title: "System Card",
    summary: [
      "The System Card publishes the institution's model system card and governance disclosures, documenting model purpose, capabilities, limitations, and oversight in line with FDL 10/2025 transparency expectations. It is the public-facing transparency artefact for the platform's AI.",
      "Transparency about AI capability and limitation is both an ethical principle and a regulatory expectation; a clear system card lets stakeholders and regulators understand what the AI does and how it is governed. The module maintains this disclosure accurately and currently.",
    ],
    regulatory: [
      "UAE FDL No.10/2025 — AI transparency and disclosure",
      "UNESCO AI Ethics Recommendation — transparency",
      "NIST AI RMF — GOVERN/MAP documentation",
      "ISO/IEC 42001 — AI documentation",
      "CBUAE AML/CFT Standards — model governance",
    ],
    requirements: [
      "Document model purpose, capability, and limitation",
      "Disclose oversight and governance arrangements",
      "Keep the system card current with model changes",
      "Make disclosures accessible to stakeholders",
      "Evidence the accuracy of disclosures",
    ],
    controls: [
      "System-card authoring and versioning",
      "Model-change-driven updates",
      "Disclosure-accuracy review",
      "Audit-chain record of card versions",
    ],
    reporting: [
      "Transparency disclosure to regulators",
      "Escalation of disclosure inaccuracies",
    ],
    risks: [
      "Stale system card after model change",
      "Inaccurate capability or limitation claims",
      "Undisclosed oversight gaps",
      "Transparency obligations unmet",
    ],
  },
  "/security-scan": {
    title: "Security Scan",
    summary: [
      "The Security Scan module surfaces dependency and code security findings, integrating the platform's SAST, dependency-audit, and vulnerability-scanning results into a compliance-visible view. It connects software-security posture to the operational-resilience obligations that underpin a trustworthy compliance platform.",
      "A compliance platform's integrity depends on its software security; unpatched vulnerabilities are an operational-risk and data-protection exposure. The module makes security findings visible and tracks their remediation alongside compliance controls.",
    ],
    regulatory: [
      "UAE FDL No.45/2021 — data-security obligations",
      "UAE FDL No.10/2025 — AI-system integrity",
      "SOC2 CC7.1 — vulnerability management",
      "CBUAE AML/CFT Standards — operational resilience",
      "NIST AI RMF — MANAGE (security)",
    ],
    requirements: [
      "Scan dependencies and code for vulnerabilities",
      "Prioritise findings by severity",
      "Remediate within risk-based timeframes",
      "Track remediation to closure",
      "Evidence security posture",
    ],
    controls: [
      "Dependency and SAST scanning",
      "Severity-based prioritisation",
      "Remediation tracking",
      "Audit-chain record of security findings",
    ],
    reporting: [
      "Security-posture reporting to governance",
      "Escalation of critical vulnerabilities",
      "Remediation-progress reporting",
    ],
    risks: [
      "Unpatched high-severity vulnerabilities",
      "Vulnerable dependencies in the supply chain",
      "Security findings not remediated in time",
      "Integrity exposure of the compliance platform",
    ],
  },
  "/analyst-behavior": {
    title: "Analyst Behavior Monitor",
    summary: [
      "The Analyst Behavior Monitor surveils analyst activity for indicators of error, override, or misconduct — anomalous disposition patterns, control bypass, and inconsistent decision-making. It provides assurance that the human layer of the control environment is itself functioning with integrity.",
      "Controls executed by people can be undermined by people; supervisors expect institutions to monitor for internal control failure and misconduct. The module surfaces behavioural anomalies for review while respecting proportionality and staff rights.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — internal controls",
      "UAE FDL No.20/2018 — control integrity",
      "FATF Recommendation 18 — internal-control monitoring",
      "CBUAE AML/CFT Standards — staff oversight",
      "SOC2 CC1.x — accountability",
    ],
    requirements: [
      "Monitor analyst decision and activity patterns",
      "Detect anomalous dispositions and overrides",
      "Investigate indicators of error or misconduct",
      "Respect proportionality and staff rights",
      "Evidence behavioural-monitoring actions",
    ],
    controls: [
      "Analyst-activity anomaly detection",
      "Override and bypass monitoring",
      "Consistency analysis",
      "Audit-chain record of monitoring findings",
    ],
    reporting: [
      "Behavioural-anomaly escalation to compliance",
      "Reporting of suspected misconduct",
      "Control-integrity metrics to governance",
    ],
    risks: [
      "Anomalous disposition patterns",
      "Control bypass or override",
      "Inconsistent decision-making",
      "Indicators of internal misconduct",
    ],
  },
  "/board-dashboard": {
    title: "Board Dashboard",
    summary: [
      "The Board Dashboard presents board-level compliance metrics and risk indicators in a consolidated executive view, giving directors the information they need to discharge their oversight responsibility for the AML/CFT and AI-governance programme. It translates operational detail into governance-relevant signal.",
      "Effective board oversight depends on clear, relevant, and timely information; FATF and CBUAE expect demonstrable board engagement with AML risk. The module provides the executive view that enables and evidences that engagement.",
    ],
    regulatory: [
      "UAE Cabinet Decision No.10/2019 Art.20 — board oversight",
      "UAE FDL No.20/2018 — senior accountability",
      "FATF Recommendation 1 — senior-management oversight",
      "CBUAE AML/CFT Standards — board reporting",
      "SOC2 CC1.2 — board oversight",
    ],
    requirements: [
      "Present board-relevant compliance metrics",
      "Surface key risk indicators and trends",
      "Support informed board decision-making",
      "Keep the dashboard current",
      "Evidence board review of the information",
    ],
    controls: [
      "Executive compliance dashboarding",
      "Key-risk-indicator surfacing",
      "Trend analysis",
      "Audit-chain record of board reporting",
    ],
    reporting: [
      "Board-level compliance reporting",
      "Escalation of material risk to directors",
      "Oversight-evidence packs",
    ],
    risks: [
      "Board decisions on incomplete information",
      "Material risk not surfaced to directors",
      "Stale governance metrics",
      "Insufficient evidenced board engagement",
    ],
  },
  "/kri-dashboard": {
    title: "KRI Dashboard",
    summary: [
      "The KRI Dashboard tracks key risk indicators across the AML/CFT programme, providing early-warning signals of rising risk or control degradation through quantified, trended metrics. It is the institution's risk-radar, surfacing deterioration before it becomes a failing.",
      "Key risk indicators turn diffuse risk into measurable, actionable signal; trending them enables proactive intervention. The module computes and monitors KRIs against thresholds and escalates adverse movements for timely response.",
    ],
    regulatory: [
      "FATF Recommendation 1 — risk monitoring",
      "UAE Cabinet Decision No.10/2019 — risk-based management",
      "UAE FDL No.20/2018 — ongoing risk awareness",
      "CBUAE AML/CFT Standards — risk indicators",
      "SOC2 CC4.1 — performance monitoring",
    ],
    requirements: [
      "Define KRIs aligned to programme risk",
      "Compute and trend indicators",
      "Set and monitor thresholds",
      "Escalate adverse movements",
      "Evidence KRI review and response",
    ],
    controls: [
      "KRI computation and trending",
      "Threshold-based alerting",
      "Risk-radar dashboarding",
      "Audit-chain record of KRI reviews",
    ],
    reporting: [
      "KRI reporting to risk committees and the Board",
      "Escalation of threshold breaches",
    ],
    risks: [
      "Rising risk undetected without indicators",
      "Control degradation masked by aggregates",
      "Threshold breaches unactioned",
      "KRIs misaligned with actual risk",
    ],
  },
  "/access-control": {
    title: "Access Control",
    summary: [
      "The Access Control module manages user roles, sessions, and permissions, enforcing least-privilege access to regulated data and functions across the platform. It is the logical-access foundation that protects sensitive compliance data and ensures that consequential actions are taken only by authorised parties.",
      "Logical access control is a baseline security and compliance obligation; over-broad access is both a data-protection risk and a control weakness. The module enforces role-appropriate access, governs sessions, and evidences who can do what across the platform.",
    ],
    regulatory: [
      "UAE FDL No.45/2021 — data-access controls",
      "UAE Cabinet Decision No.10/2019 Art.20 — access governance",
      "UAE FDL No.20/2018 — confidentiality of records",
      "SOC2 CC6.1 — logical access controls",
      "FATF Recommendation 18 — internal-control access",
    ],
    requirements: [
      "Enforce least-privilege role-based access",
      "Govern session lifecycle and authentication",
      "Restrict regulated data to authorised roles",
      "Review access entitlements periodically",
      "Evidence access decisions and changes",
    ],
    controls: [
      "Role-based access control",
      "Session and authentication governance",
      "Least-privilege enforcement",
      "Audit-chain record of access changes",
    ],
    reporting: [
      "Access-review reporting to governance",
      "Escalation of excessive or anomalous access",
      "Access-control evidence for examinations",
    ],
    risks: [
      "Over-broad or stale access entitlements",
      "Unauthorised access to regulated data",
      "Weak session or authentication controls",
      "Unreviewed privilege accumulation",
    ],
  },
};

// ─── Render ───────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#111",
  borderBottom: "1px solid #999",
  paddingBottom: 3,
  marginTop: 16,
  marginBottom: 8,
};
const para: React.CSSProperties = { fontSize: 10.5, lineHeight: 1.55, color: "#222", margin: "0 0 7px 0" };
const li: React.CSSProperties = { fontSize: 10, lineHeight: 1.5, color: "#222", marginBottom: 3 };
const ul: React.CSSProperties = { margin: "0 0 4px 0", paddingLeft: 18 };

function resolveReport(pathname: string): ReportData | null {
  if (REPORTS[pathname]) return REPORTS[pathname]!;
  // Longest-prefix match so nested / query-bearing routes still resolve.
  const key = Object.keys(REPORTS)
    .filter((k) => pathname === k || pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? REPORTS[key]! : null;
}

export function CompliancePrintReport() {
  const pathname = usePathname() ?? "";
  const report = resolveReport(pathname);
  if (!report) return null;

  return (
    <div
      className="compliance-print-report"
      style={{ display: "none", fontFamily: "Arial, Helvetica, sans-serif", marginBottom: 24 }}
    >
      <div style={sectionTitle}>1 · Executive Summary</div>
      {report.summary.map((p, i) => (
        <p key={i} style={para}>{p}</p>
      ))}

      <div style={sectionTitle}>2 · Regulatory Framework</div>
      <ul style={ul}>
        {report.regulatory.map((r, i) => (
          <li key={i} style={li}>{r}</li>
        ))}
      </ul>

      <div style={sectionTitle}>3 · Compliance Requirements</div>
      <ul style={ul}>
        {report.requirements.map((r, i) => (
          <li key={i} style={li}>{r}</li>
        ))}
      </ul>

      <div style={sectionTitle}>4 · Monitoring & Controls</div>
      <ul style={ul}>
        {report.controls.map((c, i) => (
          <li key={i} style={li}>{c}</li>
        ))}
      </ul>

      <div style={sectionTitle}>5 · Reporting Obligations</div>
      <ul style={ul}>
        {report.reporting.map((r, i) => (
          <li key={i} style={li}>{r}</li>
        ))}
      </ul>

      <div style={sectionTitle}>6 · Key Risk Indicators</div>
      <ul style={ul}>
        {report.risks.map((r, i) => (
          <li key={i} style={li}>{r}</li>
        ))}
      </ul>

      <div style={{ borderTop: "2px solid #111", marginTop: 18, marginBottom: 16 }} />
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#444", marginBottom: 10 }}>
        Live Module Data
      </div>
    </div>
  );
}
