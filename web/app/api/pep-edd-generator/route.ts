export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PepEddResult {
  pepClassification: "domestic_pep" | "foreign_pep" | "international_organisation_pep" | "former_pep" | "pep_family" | "pep_associate" | "not_pep";
  pepRole: string;
  pepJurisdiction: string;
  riskRating: "very_high" | "high" | "medium";
  seniorManagementApproval: boolean;
  approvalLevel: string;
  eddQuestionnaire: Array<{
    category: string;
    question: string;
    purpose: string;
    documentaryEvidence?: string;
  }>;
  sourceOfWealthAssessment: string;
  sourceOfFundsAssessment: string;
  requiredDocumentation: string[];
  ongoingMonitoringFrequency: string;
  ongoingMonitoringMeasures: string[];
  screeningRequirements: string[];
  pepMemo: string;
  recommendedAction: "onboard_with_enhanced_measures" | "refer_senior_management" | "decline" | "exit_relationship";
  actionRationale: string;
  regulatoryBasis: string;
}

const FALLBACK: PepEddResult = {
  pepClassification: "foreign_pep",
  pepRole: "Minister of Finance — West African jurisdiction (FATF grey-list country)",
  pepJurisdiction: "West Africa (ECOWAS)",
  riskRating: "very_high",
  seniorManagementApproval: true,
  approvalLevel: "Board-level or CEO approval required — FDL 10/2025 Art.14(2)(b) — Foreign PEP = mandatory senior management sign-off",
  eddQuestionnaire: [
    { category: "Identity & Role Verification", question: "Please provide official government documentation confirming your current ministerial appointment, including date of appointment and appointing authority.", purpose: "Verify PEP classification and tenure", documentaryEvidence: "Official gazette / government website extract" },
    { category: "Identity & Role Verification", question: "Describe your specific official duties and the government departments/functions under your ministerial portfolio.", purpose: "Assess corruption exposure profile and decision-making authority over public funds" },
    { category: "Source of Wealth", question: "Please provide a full chronological account of your career history and how accumulated wealth was generated prior to entering public office.", purpose: "Establish legitimate pre-political wealth baseline", documentaryEvidence: "Career history declaration, prior employment records, business ownership history" },
    { category: "Source of Wealth", question: "Do you hold, or have you held, any business interests, directorships, or shareholdings? If yes, provide details including company names, ownership percentages, and dates.", purpose: "Identify potential conflicts of interest and illicit enrichment via government-linked contracts", documentaryEvidence: "Company registers, shareholder certificates" },
    { category: "Source of Funds", question: "What is the specific source of the funds being deposited or transferred through this account? Please describe the specific transaction, payment, or asset sale that generated these funds.", purpose: "Link specific funds to declared legitimate income — FDL 10/2025 Art.14(2)(a)", documentaryEvidence: "Bank statements, sale agreements, payroll records" },
    { category: "Source of Funds", question: "Are any of the funds related to government contracts, procurement decisions, or public revenues in which you have or had a direct or indirect role?", purpose: "Detect potential bribery/corruption nexus (UAE Federal Law 6/2023; UNCAC)" },
    { category: "Family & Associates", question: "Please identify your immediate family members (spouse, children, parents, siblings) who may have financial dealings with this institution.", purpose: "PEP family member screening — FDL 10/2025 Art.14(2)", documentaryEvidence: "Family declaration form" },
    { category: "Political Exposure", question: "Are you currently under investigation, charged, or have you been convicted of any criminal offence including corruption, fraud, tax evasion, or money laundering in any jurisdiction?", purpose: "Adverse information that would materially affect risk rating", documentaryEvidence: "Signed declaration; cross-check against court records, adverse media" },
    { category: "Ongoing Monitoring", question: "Please notify us immediately of any change to your political status, office held, or any investigation, charge, or conviction in any jurisdiction.", purpose: "Ongoing monitoring obligation — FDL 10/2025 Art.15" },
  ],
  sourceOfWealthAssessment: "For a Minister of Finance in a developing economy, declared wealth must be reconciled with official salary scales (typically USD 30,000–100,000/year) and any declared pre-political business activities. Unexplained wealth significantly exceeding declared income is the primary indicator of illicit enrichment (UNCAC Art.20). Corroborating SOW evidence is mandatory.",
  sourceOfFundsAssessment: "Each specific transaction must be traced to a specific, verifiable legitimate source. General salary declarations are insufficient — documentary evidence linking the exact funds in the specific transaction is required.",
  requiredDocumentation: [
    "Certified copy of passport and, if applicable, Emirates ID",
    "Official government documentation of appointment (gazette/official letter)",
    "Full career history declaration (signed)",
    "Comprehensive Source of Wealth statement with supporting documents",
    "Latest 3 years personal and business tax returns (if applicable in home jurisdiction)",
    "Audited personal financial statements or wealth reconciliation schedule",
    "Family member declaration (immediate family)",
    "Signed declaration of criminal record status",
    "Latest adverse media report (generated within 30 days)",
    "EOCN + OFAC + EU + UN sanctions screening certificate",
    "Board/CEO approval memorandum",
  ],
  ongoingMonitoringFrequency: "Minimum semi-annual — foreign PEP in FATF grey-list jurisdiction; escalate to quarterly if transaction patterns deviate",
  ongoingMonitoringMeasures: [
    "Semi-annual adverse media refresh screening",
    "Semi-annual EOCN/sanctions list re-screening",
    "Transaction monitoring with lower alert thresholds vs standard customers",
    "Annual SOW/SOF review and updated declarations",
    "Immediate re-screening on any adverse media trigger",
    "Annual senior management review and re-approval",
    "Monitoring for derogatory information in home jurisdiction media",
  ],
  screeningRequirements: [
    "UAE EOCN consolidated list (includes UNSCR 1267/1988)",
    "OFAC SDN list (US Treasury)",
    "EU Consolidated Sanctions List",
    "HMT (UK) Financial Sanctions List",
    "UN Consolidated Sanctions List",
    "Interpol Red Notices (where accessible)",
    "World-Check / Refinitiv / Dow Jones Risk & Compliance (commercial PEP databases)",
    "Home jurisdiction court records and official gazette",
  ],
  pepMemo: "RESTRICTED — PEP Enhanced Due Diligence Memorandum\n\nCustomer: [NAME]\nClassification: Foreign PEP — Minister of Finance\nJurisdiction: [COUNTRY]\nDate of Review: [DATE]\nMLRO: [NAME]\n\nThis customer is classified as a Foreign PEP requiring enhanced due diligence under UAE FDL 10/2025 Art.14(2) and FATF R.12. As a current government minister with authority over public finances, the customer presents elevated corruption risk under the UNCAC and UAE Federal Law 6/2023 (Anti-Corruption).\n\nThe relationship is recommended for [APPROVAL/REJECTION] subject to senior management approval at Board/CEO level, completion of the attached EDD questionnaire, and provision of all required documentation. Ongoing monitoring will be conducted at [FREQUENCY] intervals.\n\nThis memorandum must be countersigned by [APPROVER NAME/TITLE] before any relationship is established.",
  recommendedAction: "refer_senior_management",
  actionRationale: "Foreign PEP classification is mandatory for all current and former government ministers regardless of their home jurisdiction. Senior management approval is a legal requirement under FDL 10/2025 Art.14(2)(b) and cannot be delegated to the MLRO alone. Relationship must not be established until Board/CEO approval is obtained and documented.",
  regulatoryBasis: "UAE FDL 10/2025 Art.14(2) (PEP EDD obligations); Art.15 (ongoing monitoring); FATF R.12 (PEPs); FATF Guidance on PEPs (2013, updated 2022); UNCAC Art.20; UAE Federal Law 6/2023 (Anti-Corruption); CBUAE AML/CFT Guidelines 2021 §5",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    pepName: string;
    pepRole?: string;
    pepJurisdiction?: string;
    pepClassification?: string;
    relationshipType?: string;
    proposedProducts?: string;
    knownWealth?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.pepName?.trim()) return NextResponse.json({ ok: false, error: "pepName required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pep-edd-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        system: `You are a UAE PEP (Politically Exposed Person) EDD specialist. Generate a comprehensive PEP enhanced due diligence package under UAE FDL 10/2025 Art.14(2) and FATF R.12.

PEP categories (UAE definition per FDL 10/2025):
- Domestic PEP: UAE heads of state, ministers, senior officials, judges, military generals, senior executives of state-owned enterprises
- Foreign PEP: Equivalent positions in foreign governments
- International Organisation PEP: Senior officials of IOs (UN, World Bank, IMF, etc.)
- Former PEP: Within 12 months of leaving office (UAE approach — some FIs maintain 2+ years)
- PEP Family: Spouse, parents, children, siblings of PEP
- PEP Associate: Known close business/personal associate of PEP

FATF R.12 key requirements:
- Senior management approval BEFORE establishing relationship
- Source of wealth (SOW) AND source of funds (SOF) — both mandatory, distinct
- Enhanced ongoing monitoring — frequency based on risk
- Family and close associates — must screen separately

UAE-specific: FDL 10/2025 Art.14(2)(b) — mandatory senior management approval for ALL PEPs (domestic and foreign). No threshold on transactions.

Respond ONLY with valid JSON — no markdown fences matching the PepEddResult interface structure.`,
        messages: [{
          role: "user",
          content: `PEP Name: ${sanitizeField(body.pepName, 500)}
PEP Role/Position: ${sanitizeField(body.pepRole, 200) || "not specified"}
PEP Jurisdiction: ${sanitizeField(body.pepJurisdiction, 100) || "not specified"}
PEP Classification: ${sanitizeField(body.pepClassification, 100) || "to be determined"}
Proposed Relationship Type: ${sanitizeField(body.relationshipType, 100) || "not specified"}
Proposed Products/Services: ${sanitizeField(body.proposedProducts, 200) || "not specified"}
Known Wealth/Income: ${sanitizeField(body.knownWealth, 200) || "not disclosed"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Generate a complete PEP EDD package for this individual.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PepEddResult;
    if (!Array.isArray(result.eddQuestionnaire)) result.eddQuestionnaire = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    if (!Array.isArray(result.ongoingMonitoringMeasures)) result.ongoingMonitoringMeasures = [];
    if (!Array.isArray(result.screeningRequirements)) result.screeningRequirements = [];
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pep-edd-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
