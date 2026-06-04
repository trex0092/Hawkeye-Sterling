// GET /api/compliance/uae-requirements
//
// Returns a structured reference of UAE AML/CFT regulatory requirements
// covering FDL 10/2025 key articles, CBUAE AML/CFT Standards, regulatory
// deadlines, current compliance dates, and penalties summary.
//
// Regulatory framework:
//   · UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025) — AML/CFT
//   · CBUAE AML/CFT Standards v3 (effective 2024-07-01)
//   · FATF 40 Recommendations (FATF 4th Round Mutual Evaluation: 2026)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FdlArticle {
  article: string;
  title: string;
  obligation: string;
  keyRequirements: string[];
}

interface CbuaeStandard {
  standard: string;
  title: string;
  summary: string;
  keyProvisions: string[];
}

interface RegulatoryDeadline {
  obligation: string;
  deadline: string;
  legalBasis: string;
  notes?: string;
}

interface ComplianceDate {
  event: string;
  effectiveDate: string;
  status: "in-force" | "upcoming" | "superseded";
  notes?: string;
}

interface PenaltySummary {
  violationType: string;
  fineRange: string;
  additionalConsequences?: string[];
  legalBasis: string;
}

interface UaeRequirementsResponse {
  ok: true;
  generatedAt: string;
  jurisdiction: "UAE";
  primaryLegislation: string;
  fdl102025Articles: FdlArticle[];
  cbuaeStandards: CbuaeStandard[];
  regulatoryDeadlines: RegulatoryDeadline[];
  complianceDates: ComplianceDate[];
  penaltiesSummary: PenaltySummary[];
  disclaimer: string;
}

// ── Static regulatory data ────────────────────────────────────────────────────

const FDL_10_2025_ARTICLES: FdlArticle[] = [
  {
    article: "Art.4",
    title: "Obligations of Financial Institutions — Customer Due Diligence",
    obligation:
      "Financial institutions must implement comprehensive CDD measures for all customers and transactions.",
    keyRequirements: [
      "Verify the identity of customers and beneficial owners before or during establishment of business relationship",
      "Understand the nature and purpose of the business relationship",
      "Conduct ongoing CDD to ensure records remain up to date",
      "Apply CDD measures proportionate to the risk profile of the customer",
      "Refuse to establish or continue business relationships where CDD cannot be completed",
    ],
  },
  {
    article: "Art.5",
    title: "Know Your Customer (KYC) Requirements",
    obligation:
      "Financial institutions must establish and maintain a robust KYC programme covering identity verification and risk classification.",
    keyRequirements: [
      "Collect and verify full legal name, date of birth, nationality, and government-issued ID for individuals",
      "Verify legal name, registration number, registered address, and ownership structure for legal entities",
      "Identify and verify ultimate beneficial owners holding ≥25% ownership or effective control",
      "Obtain information on the purpose and intended nature of the business relationship",
      "Classify every customer into a risk tier (low / medium / high) based on documented risk criteria",
      "Re-verify customer identity upon material change of circumstances or at periodic review intervals",
    ],
  },
  {
    article: "Art.7",
    title: "Enhanced Due Diligence for High-Risk Customers",
    obligation:
      "Enhanced due diligence must be applied to customers and transactions assessed as high-risk.",
    keyRequirements: [
      "Obtain senior management approval before establishing or continuing high-risk relationships",
      "Identify and verify the source of funds and source of wealth for high-risk customers",
      "Apply enhanced ongoing monitoring, including increased frequency of transaction reviews",
      "Collect additional documentation to substantiate the economic purpose of complex transactions",
      "EDD mandatory for PEPs, correspondent banking relationships, non-face-to-face customers, and high-risk jurisdictions",
      "Review and update the EDD assessment at least annually for high-risk accounts",
    ],
  },
  {
    article: "Art.9",
    title: "Record Keeping",
    obligation:
      "Financial institutions must retain all customer, transaction, and compliance records for a minimum of five years.",
    keyRequirements: [
      "Retain CDD records (identity documents, beneficial ownership information) for at least 5 years after relationship end",
      "Retain transaction records sufficient to reconstruct individual transactions for at least 5 years",
      "Maintain records of STRs filed, internal investigations, and compliance decisions",
      "Records must be retrievable promptly in response to competent authority requests",
      "Electronic records must be stored in a tamper-evident format",
      "Records related to ongoing investigations or legal proceedings must be retained until formally released",
    ],
  },
  {
    article: "Art.14",
    title: "Transaction Monitoring Obligations",
    obligation:
      "Financial institutions must implement systems to monitor customer transactions on a continuous basis to detect suspicious activity.",
    keyRequirements: [
      "Deploy automated transaction monitoring systems calibrated to the institution's risk appetite",
      "Define and document typologies, thresholds, and alert scenarios used by the monitoring system",
      "Review, investigate, and document the disposition of every generated alert",
      "Identify unusual transactions inconsistent with the customer's expected activity or risk profile",
      "Monitor complex, unusually large, or structuring transactions with no apparent economic purpose",
      "Escalate unresolved alerts to the MLRO within a defined and documented timeframe",
    ],
  },
  {
    article: "Art.17",
    title: "STR/SAR Filing — 48-Hour Obligation",
    obligation:
      "Financial institutions must file a Suspicious Transaction Report (STR) via goAML within 48 hours of forming reasonable suspicion.",
    keyRequirements: [
      "Submit STR to the UAE FIU via the goAML portal within 48 hours of suspicion formation",
      "Suspicion threshold is triggered when the institution has reasonable grounds — not certainty — to suspect ML/TF",
      "Filing obligation applies regardless of whether the transaction is completed or declined",
      "STR must document: subject identity, transaction details, suspicion rationale, and predicate offences suspected",
      "MLRO must formally record the date and time suspicion was formed to anchor the 48-hour deadline",
      "Supplementary STRs must be filed promptly when material new information becomes available",
    ],
  },
  {
    article: "Art.18",
    title: "Tipping-Off Prohibition",
    obligation:
      "Financial institutions and their employees are prohibited from disclosing that an STR has been filed or that an investigation is underway.",
    keyRequirements: [
      "Strictly prohibit disclosing to the subject or any third party that an STR has been or may be filed",
      "Staff training must explicitly cover the tipping-off prohibition and the criminal consequences of breach",
      "Internal policies must restrict STR-related information to a strictly need-to-know basis",
      "The prohibition applies during and after the investigation, including after account closure",
      "Legitimate information-sharing within a financial group under Art.19 does not constitute tipping-off provided confidentiality is maintained",
    ],
  },
  {
    article: "Art.19",
    title: "Cooperation with Authorities",
    obligation:
      "Financial institutions must cooperate fully with competent authorities and the UAE FIU on all AML/CFT matters.",
    keyRequirements: [
      "Respond promptly and completely to all requests for information from competent authorities",
      "Provide competent authorities with access to records, systems, and personnel as requested",
      "Do not impede, delay, or obstruct official investigations or inspections",
      "Designate a single authorised point of contact for regulatory and law enforcement inquiries",
      "Information sharing with foreign FIUs is permitted through established mutual legal assistance channels",
      "Voluntary cooperation beyond mandatory obligations is encouraged and recognised by supervisors",
    ],
  },
  {
    article: "Art.25",
    title: "Correspondent Banking Requirements",
    obligation:
      "Financial institutions engaging in correspondent banking must apply enhanced due diligence to respondent institutions.",
    keyRequirements: [
      "Gather sufficient information on the respondent institution to understand its AML/CFT framework",
      "Assess the respondent's AML/CFT controls and determine they meet UAE and FATF standards",
      "Obtain senior management approval before establishing new correspondent banking relationships",
      "Document the respective AML/CFT responsibilities of each party in a written agreement",
      "Prohibit establishing or maintaining correspondent relationships with shell banks",
      "Conduct periodic reviews of existing correspondent relationships to verify continued compliance",
    ],
  },
  {
    article: "Art.32",
    title: "Politically Exposed Person (PEP) Obligations",
    obligation:
      "Financial institutions must apply enhanced measures to PEPs, their family members, and close associates.",
    keyRequirements: [
      "Screen all customers and beneficial owners against PEP lists at onboarding and on an ongoing basis",
      "Obtain senior management approval before establishing or continuing a business relationship with a PEP",
      "Identify the source of wealth and source of funds of PEPs and verify these through independent means",
      "Apply enhanced ongoing monitoring to all PEP accounts and transactions",
      "Treat foreign PEPs as inherently high-risk; domestic and international organisation PEPs to be risk-assessed",
      "Review PEP status at least annually and update the risk classification when PEP status changes",
    ],
  },
];

const CBUAE_STANDARDS: CbuaeStandard[] = [
  {
    standard: "Standard 1",
    title: "Customer Risk Assessment",
    summary:
      "Licensed financial institutions must implement a risk-based approach to customer risk assessment, classifying each customer according to documented ML/TF risk criteria.",
    keyProvisions: [
      "Documented risk-scoring methodology covering customer type, geography, product, and channel risk factors",
      "Minimum three-tier classification: low, medium, and high risk",
      "Risk scores must be reviewed upon material change and at least annually for high-risk customers",
      "Board-approved risk appetite statement must anchor the customer risk framework",
      "Risk assessments must be retained as part of the customer file for the record-keeping period",
    ],
  },
  {
    standard: "Standard 2",
    title: "Customer Due Diligence",
    summary:
      "Licensed institutions must implement CDD measures proportionate to assessed risk, covering identity verification, beneficial ownership, and business purpose.",
    keyProvisions: [
      "Verify identity from reliable, independent documentary sources for individuals and legal entities",
      "Identify and verify ultimate beneficial owners (UBOs) at the 25% ownership threshold or effective control",
      "Obtain and document the purpose and intended nature of the business relationship",
      "Simplified CDD permitted only for demonstrably low-risk customers per CBUAE-approved criteria",
      "CDD records must be updated promptly whenever there is a trigger event or material change",
    ],
  },
  {
    standard: "Standard 3",
    title: "Enhanced Due Diligence",
    summary:
      "Enhanced due diligence measures must be applied to high-risk customers, PEPs, correspondent banking, non-face-to-face relationships, and customers from high-risk jurisdictions.",
    keyProvisions: [
      "Senior management approval mandatory before onboarding or continuing any high-risk relationship",
      "Source of funds and source of wealth verification required, with corroborating evidence where possible",
      "Enhanced ongoing monitoring with increased transaction review frequency for high-risk accounts",
      "Detailed EDD file documenting the basis for high-risk classification and measures applied",
      "EDD for non-resident customers must include verification of home-country AML/CFT regime quality",
    ],
  },
  {
    standard: "Standard 4",
    title: "Ongoing Monitoring",
    summary:
      "Institutions must maintain continuous transaction monitoring and periodic customer review programmes calibrated to the risk profile of each customer.",
    keyProvisions: [
      "Automated transaction monitoring systems with documented alert scenarios and thresholds",
      "Alert disposition must be documented, including the rationale for clearing or escalating each alert",
      "Periodic customer reviews: high-risk annually, medium-risk every 2 years, low-risk every 3-5 years",
      "Trigger-based reviews must be initiated upon suspicious activity, adverse media, or sanctions alerts",
      "Monitoring scenarios must be reviewed and updated at least annually to reflect evolving typologies",
    ],
  },
  {
    standard: "Standard 5",
    title: "Correspondent Banking",
    summary:
      "Institutions providing correspondent banking services must conduct enhanced due diligence on respondent institutions and document AML/CFT responsibilities.",
    keyProvisions: [
      "Pre-relationship assessment of respondent's AML/CFT programme, controls, and regulatory standing",
      "Written agreement specifying AML/CFT responsibilities and information-sharing arrangements",
      "Senior management sign-off required prior to establishing new correspondent relationships",
      "Prohibition on correspondent relationships with shell banks or institutions in non-cooperative jurisdictions",
      "Annual review of correspondent banking relationships to assess continued AML/CFT compliance",
    ],
  },
  {
    standard: "Standard 6",
    title: "Wire Transfer Compliance — FATF Recommendation 16",
    summary:
      "Institutions must ensure all cross-border and domestic wire transfers carry complete and accurate originator and beneficiary information in compliance with FATF R.16.",
    keyProvisions: [
      "Originator information: full name, account number (or unique transaction reference), address or national ID",
      "Beneficiary information: full name and account number (or unique reference) must accompany every transfer",
      "Batch file transfers must include the above information for each individual transfer",
      "Institutions must screen wire transfer information against sanctions lists before processing",
      "Missing or incomplete ordering information must trigger a risk-based decision to hold, return, or investigate",
      "Records of wire transfer information must be retained for at least 5 years",
    ],
  },
  {
    standard: "Standard 7",
    title: "High-Risk Industries",
    summary:
      "Institutions must apply enhanced scrutiny to customers operating in sectors identified as inherently high-risk for ML/TF purposes.",
    keyProvisions: [
      "High-risk industries include: real estate, precious metals and stones dealers, virtual asset service providers (VASPs), money service businesses, cash-intensive businesses, and DNFBPs",
      "EDD mandatory for all customers in high-risk sectors regardless of individual customer risk score",
      "Understand and document the customer's business model, revenue streams, and client base",
      "Obtain audited financial statements and licences where applicable",
      "Enhanced monitoring scenarios tailored to the specific typologies of each high-risk sector",
      "Annual review of high-risk industry classifications to incorporate updated CBUAE and FATF guidance",
    ],
  },
];

const REGULATORY_DEADLINES: RegulatoryDeadline[] = [
  {
    obligation: "STR/SAR Filing",
    deadline: "48 hours from the moment suspicion is formed",
    legalBasis: "UAE FDL 10/2025 Art.17",
    notes:
      "The 48-hour clock starts when any employee, officer, or system formally records suspicion — not when investigation is concluded. MLRO must log the suspicion formation timestamp.",
  },
  {
    obligation: "Annual Enterprise-Wide Risk Assessment (EWRA) Update",
    deadline: "31 December each calendar year",
    legalBasis: "CBUAE AML/CFT Standards v3 — Standard 1; FDL 10/2025 Art.4",
    notes:
      "Board approval required. The EWRA must be submitted to the CBUAE supervisor on request. Material changes during the year require an interim update.",
  },
  {
    obligation: "PEP Relationship Annual Review",
    deadline: "Within 12 months of the previous review date",
    legalBasis: "UAE FDL 10/2025 Art.32; CBUAE Standard 4",
    notes:
      "Senior management sign-off required at each annual review. Review must reassess risk rating, source of wealth, and beneficial ownership in addition to standard CDD refresh.",
  },
  {
    obligation: "Sanctions List Refresh",
    deadline: "Daily (best practice); 24-hour maximum permitted lag",
    legalBasis:
      "Cabinet Resolution No. 74 of 2020 (TFS); UAE FDL 10/2025 Art.4; CBUAE Sanctions Compliance Guidance",
    notes:
      "Institutions must monitor OFAC SDN, EU Consolidated, UN Consolidated, HM Treasury, and UAE Local Terrorist Designation (LTD) lists. Automated feeds are strongly recommended.",
  },
  {
    obligation: "UAE Executive Office for Control & Non-Proliferation (EOCN) Screening",
    deadline: "Real-time — on every customer screening event",
    legalBasis: "Cabinet Resolution No. 74 of 2020; Ministerial Decree on TFS Implementation",
    notes:
      "EOCN check is mandatory at onboarding, on transaction initiation, and whenever a trigger event occurs. Cannot be batched — must be real-time or near-real-time.",
  },
  {
    obligation: "Record Retention (CDD, transactions, STRs, compliance decisions)",
    deadline: "Minimum 5 years from relationship end or transaction date",
    legalBasis: "UAE FDL 10/2025 Art.9; FATF Recommendation 11",
    notes:
      "Records related to ongoing investigations or litigation must be held until formally released by the competent authority. AML audit chain records under Art.24 are subject to 10-year retention per some supervisory interpretations.",
  },
  {
    obligation: "High-Risk Customer Periodic Review",
    deadline: "At least annually",
    legalBasis: "CBUAE AML/CFT Standards v3 — Standard 4",
    notes:
      "Includes refresh of CDD, risk rating re-assessment, and review of transaction behaviour over the period.",
  },
  {
    obligation: "Medium-Risk Customer Periodic Review",
    deadline: "At least every 2 years",
    legalBasis: "CBUAE AML/CFT Standards v3 — Standard 4",
  },
  {
    obligation: "Low-Risk Customer Periodic Review",
    deadline: "At least every 3 to 5 years (institution-defined within CBUAE guidance)",
    legalBasis: "CBUAE AML/CFT Standards v3 — Standard 4",
  },
  {
    obligation: "Transaction Monitoring Scenario Annual Review",
    deadline: "At least annually",
    legalBasis: "CBUAE AML/CFT Standards v3 — Standard 4",
    notes:
      "Must incorporate updates from FATF typologies reports, CBUAE guidance notes, and internal suspicious activity findings.",
  },
];

const COMPLIANCE_DATES: ComplianceDate[] = [
  {
    event: "UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025) — Effective Date",
    effectiveDate: "2025-01-01",
    status: "in-force",
    notes:
      "Replaces Federal Law No. 20 of 2018. All licensed financial institutions must comply. No grace period for core AML/CFT obligations.",
  },
  {
    event: "CBUAE AML/CFT Standards Version 3 — Effective Date",
    effectiveDate: "2024-07-01",
    status: "in-force",
    notes:
      "Supersedes the 2020 Standards. Key updates: enhanced VASP coverage, updated correspondent banking requirements, revised PEP risk guidance.",
  },
  {
    event: "FATF 4th Round Mutual Evaluation of UAE",
    effectiveDate: "2026-01-01",
    status: "upcoming",
    notes:
      "Exact date TBC by FATF Secretariat. Institutions should prepare for regulatory intensification and thematic examinations in the 12-18 months preceding the evaluation.",
  },
  {
    event: "Annual EWRA Deadline (2025 cycle)",
    effectiveDate: "2025-12-31",
    status: "upcoming",
    notes: "Board-approved EWRA for the 2025 calendar year must be finalised and signed off by this date.",
  },
  {
    event: "Annual EWRA Deadline (2026 cycle)",
    effectiveDate: "2026-12-31",
    status: "upcoming",
    notes: "Board-approved EWRA for the 2026 calendar year must be finalised and signed off by this date.",
  },
  {
    event: "Cabinet Resolution No. 74 of 2020 on TFS — In Force",
    effectiveDate: "2020-09-10",
    status: "in-force",
    notes: "Governs targeted financial sanctions (TFS) implementation in the UAE. Complementary to FDL 10/2025.",
  },
];

const PENALTIES_SUMMARY: PenaltySummary[] = [
  {
    violationType: "Failure to conduct customer due diligence (Art.4, Art.5)",
    fineRange: "AED 100,000 – AED 1,000,000 per violation",
    additionalConsequences: [
      "Regulatory enforcement notice",
      "Mandatory remediation plan with CBUAE oversight",
      "Reputational damage and potential licence conditions",
    ],
    legalBasis: "UAE FDL 10/2025 Chapter 8 (Penalties)",
  },
  {
    violationType: "Failure to file STR within 48 hours (Art.17)",
    fineRange: "AED 200,000 – AED 2,000,000 per unreported transaction",
    additionalConsequences: [
      "Senior management personal liability",
      "Suspension of MLRO and responsible officers pending investigation",
      "Regulatory referral for criminal prosecution in cases of wilful concealment",
    ],
    legalBasis: "UAE FDL 10/2025 Chapter 8 (Penalties); Art.17",
  },
  {
    violationType: "Tipping-off (Art.18)",
    fineRange: "AED 100,000 – AED 500,000 per incident",
    additionalConsequences: [
      "Criminal prosecution of the individual responsible",
      "Imprisonment of up to 1 year for individuals under UAE Penal Code provisions",
      "Regulatory action against the institution for control failures",
    ],
    legalBasis: "UAE FDL 10/2025 Art.18; UAE Penal Code",
  },
  {
    violationType: "Failure to maintain records (Art.9)",
    fineRange: "AED 100,000 – AED 1,000,000",
    additionalConsequences: [
      "Data reconstruction order at institution's cost",
      "Enhanced supervisory oversight",
    ],
    legalBasis: "UAE FDL 10/2025 Art.9; FATF R.11",
  },
  {
    violationType: "Failure to implement transaction monitoring (Art.14)",
    fineRange: "AED 200,000 – AED 2,000,000",
    additionalConsequences: [
      "Mandatory independent audit of the transaction monitoring framework",
      "Potential suspension of new product/customer approvals",
    ],
    legalBasis: "UAE FDL 10/2025 Art.14",
  },
  {
    violationType: "Failure to apply enhanced due diligence — PEPs or high-risk (Art.7, Art.32)",
    fineRange: "AED 200,000 – AED 3,000,000",
    additionalConsequences: [
      "Senior management personal liability",
      "Mandatory remediation and enhanced monitoring period",
    ],
    legalBasis: "UAE FDL 10/2025 Art.7, Art.32; CBUAE Standards 3 and 7",
  },
  {
    violationType: "Correspondent banking violations (Art.25) — including shell bank relationships",
    fineRange: "AED 500,000 – AED 5,000,000",
    additionalConsequences: [
      "Mandatory termination of the non-compliant relationship",
      "Referral to criminal prosecution for wilful violations",
      "Regulatory embargo on new correspondent banking approvals",
    ],
    legalBasis: "UAE FDL 10/2025 Art.25; CBUAE Standard 5",
  },
  {
    violationType: "Wilful ML/TF facilitation or obstruction of authorities",
    fineRange: "AED 1,000,000 – AED 5,000,000 (institutional); unlimited for individuals under criminal law",
    additionalConsequences: [
      "Criminal prosecution of individuals responsible — imprisonment of up to 10 years",
      "Licence revocation for the institution",
      "Asset freezing and forfeiture orders",
      "International regulatory notifications (FATF egmont network)",
    ],
    legalBasis:
      "UAE FDL 10/2025 Chapter 8; UAE Federal Law No. 3 of 1987 (Penal Code); FATF R.3 (criminalisation of ML)",
  },
];

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleGet(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "compliance.uae-requirements_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const payload: UaeRequirementsResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    jurisdiction: "UAE",
    primaryLegislation: "UAE Federal Decree-Law No. 10 of 2025 on Anti-Money Laundering and Combating the Financing of Terrorism and Financing of Illegal Organisations (FDL 10/2025)",
    fdl102025Articles: FDL_10_2025_ARTICLES,
    cbuaeStandards: CBUAE_STANDARDS,
    regulatoryDeadlines: REGULATORY_DEADLINES,
    complianceDates: COMPLIANCE_DATES,
    penaltiesSummary: PENALTIES_SUMMARY,
    disclaimer:
      "This reference is provided for informational purposes and reflects the regulatory framework as understood at the time of publication. It does not constitute legal advice. Institutions must verify requirements against current official texts and seek qualified legal counsel for compliance decisions.",
  };

  return NextResponse.json(payload, {
    headers: {
      ...gate.headers,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export const GET = handleGet;
