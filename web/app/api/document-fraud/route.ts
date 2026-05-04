export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

export interface DocFraudIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  documentType: string;
  detail: string;
}

export interface DocumentFraudResult {
  fraudRisk: "critical" | "high" | "medium" | "low" | "clear";
  fraudProbability: number;
  documentAssessments: Array<{
    docType: string;
    authentic: "likely" | "suspect" | "counterfeit" | "unknown";
    redFlags: string[];
    verificationRequired: string[];
  }>;
  indicators: DocFraudIndicator[];
  identityConsistency: "consistent" | "inconsistent" | "partially_inconsistent" | "unknown";
  kycImpact: "reject" | "re_verify" | "enhanced_verification" | "acceptable";
  recommendedAction: "reject_onboarding" | "escalate_mlro" | "re_verify_documents" | "enhanced_dd" | "clear";
  actionRationale: string;
  requiredVerificationSteps: string[];
  externalVerificationSources: string[];
  regulatoryBasis: string;
}

const FALLBACK: DocumentFraudResult = {
  fraudRisk: "high",
  fraudProbability: 72,
  documentAssessments: [
    {
      docType: "Emirates ID",
      authentic: "suspect",
      redFlags: [
        "MRZ zone font inconsistency (Arial vs. OCR-B standard)",
        "Hologram pattern differs from FINA post-2020 issuance series",
        "Date of birth in Gregorian and Hijri fields do not correspond",
      ],
      verificationRequired: ["ICP online verification portal", "Physical chip scan (NFC)", "ICP biometric match"],
    },
    {
      docType: "Salary certificate",
      authentic: "suspect",
      redFlags: [
        "Company stamp digital artefacts suggest scan-and-insert fabrication",
        "Salary figure inconsistent with stated occupation (AED 45,000/month for junior clerk)",
        "Employer registration number not matching MoHRE database format",
      ],
      verificationRequired: ["MoHRE employer registry check", "Direct contact with stated employer HR department"],
    },
  ],
  indicators: [
    {
      indicator: "MRZ zone font inconsistency on Emirates ID",
      severity: "critical",
      documentType: "Emirates ID",
      detail: "UAE ICP-issued Emirates IDs use OCR-B typeface exclusively in the MRZ zone. Presence of proportional font suggests document alteration or production on non-official equipment.",
    },
    {
      indicator: "Salary figure inconsistent with occupation/employer",
      severity: "high",
      documentType: "Salary certificate",
      detail: "Source of funds claim rests on an income figure statistically inconsistent with the stated position. Inflated income documents are a primary method of concealing true source of funds in UAE ML cases.",
    },
  ],
  identityConsistency: "inconsistent",
  kycImpact: "re_verify",
  recommendedAction: "escalate_mlro",
  actionRationale: "Multiple document authenticity concerns across primary ID and SOF document require MLRO escalation. Business relationship must not proceed until independent verification is completed. If fraud confirmed, MLRO to consider STR under FDL 10/2025 Art.26 as document fraud may indicate identity theft (predicate offence under UAE Penal Code Art.206) or ML via false CDD.",
  requiredVerificationSteps: [
    "Emirates ID: ICP online verification at icp.gov.ae — name, DOB, ID number cross-check",
    "Emirates ID: Physical NFC chip read to verify chip data matches printed data",
    "Salary certificate: Direct verification call to stated employer HR (use independently sourced contact number)",
    "Salary certificate: MoHRE establishment listing verification",
    "Cross-check name spelling across all documents — Arabic vs. English transliteration consistency",
    "Run name against UAE courts records for identity fraud history",
  ],
  externalVerificationSources: [
    "ICP (Federal Authority for Identity and Citizenship) — icp.gov.ae",
    "MoHRE (Ministry of Human Resources and Emiratisation) employer registry",
    "UAE courts public records (where available)",
    "Trade licence issuing authority (DET/ADCCI/DIFC) for business ownership claims",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.14 (CDD obligations — verify identity documents); Art.26 (STR if fraud suspected); FATF R.10 (CDD); UAE Federal Law 4/2002 Art.2 (ML predicate); UAE Penal Code Art.206 (document forgery)",
};

export async function POST(req: Request) {
  let body: {
    documentTypes: string;
    documentDetails?: string;
    subjectName?: string;
    subjectNationality?: string;
    occupationClaimed?: string;
    incomeClaimedAed?: string;
    inconsistenciesObserved?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.documentTypes?.trim()) return NextResponse.json({ ok: false, error: "documentTypes required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "document-fraud temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1400,
        system: `You are a UAE KYC/CDD document authenticity expert assessing identity documents and supporting KYC documents for fraud indicators under UAE FDL 10/2025.

UAE document types and red flags:
- Emirates ID (ICP-issued): MRZ uses OCR-B font, hologram post-2020 series, Gregorian+Hijri DOB must correspond, NFC chip
- UAE passport: MRZ consistency, hologram, visa page security features
- Salary certificates: MoHRE format, employer stamp, salary consistency with stated role
- Bank statements: branch address, IBAN format (AE + 21 digits), realistic transaction patterns
- Trade licences: DET/ADCCI/DIFC format, licence number format, activity codes
- Corporate documents: MOEC format, attestation chains for offshore
- Utility bills: DEWA/ADDC format, address consistency

Red flag patterns:
- Font inconsistency in MRZ zones
- Hologram digital artefact (scan-and-paste)
- Date inconsistency across documents
- Salary implausible for stated occupation
- Address mismatch across documents
- Sequential or round-number ID/reference numbers (suggest fabrication)
- Corporate stamps with digital artefacts
- Offshore documents lacking apostille/notarisation chain

Respond ONLY with valid JSON — no markdown fences:
{
  "fraudRisk": "critical"|"high"|"medium"|"low"|"clear",
  "fraudProbability": <0-100>,
  "documentAssessments": [{"docType":"<type>","authentic":"likely"|"suspect"|"counterfeit"|"unknown","redFlags":["<flag>"],"verificationRequired":["<step>"]}],
  "indicators": [{"indicator":"<text>","severity":"critical"|"high"|"medium"|"low","documentType":"<doc>","detail":"<explanation>"}],
  "identityConsistency": "consistent"|"inconsistent"|"partially_inconsistent"|"unknown",
  "kycImpact": "reject"|"re_verify"|"enhanced_verification"|"acceptable",
  "recommendedAction": "reject_onboarding"|"escalate_mlro"|"re_verify_documents"|"enhanced_dd"|"clear",
  "actionRationale": "<paragraph>",
  "requiredVerificationSteps": ["<step>"],
  "externalVerificationSources": ["<source>"],
  "regulatoryBasis": "<full citation>"
}`,
        messages: [{
          role: "user",
          content: `Document Types Presented: ${body.documentTypes}
Document Details / Observations: ${body.documentDetails ?? "not provided"}
Subject Name: ${body.subjectName ?? "not specified"}
Subject Nationality: ${body.subjectNationality ?? "not specified"}
Occupation Claimed: ${body.occupationClaimed ?? "not specified"}
Income Claimed (AED/month): ${body.incomeClaimedAed ?? "not specified"}
Inconsistencies Observed: ${body.inconsistenciesObserved ?? "none noted"}
Additional Context: ${body.context ?? "none"}

Assess these documents for fraud indicators.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "document-fraud temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as DocumentFraudResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "document-fraud temporarily unavailable - please retry." }, { status: 503 });
  }
}
