export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.documentTypes?.trim()) return NextResponse.json({ ok: false, error: "documentTypes required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "document-fraud temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
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
          content: `Document Types Presented: ${sanitizeField(body.documentTypes, 500)}
Document Details / Observations: ${sanitizeText(body.documentDetails ?? "not provided", 2000)}
Subject Name: ${sanitizeField(body.subjectName ?? "not specified", 500)}
Subject Nationality: ${sanitizeField(body.subjectNationality ?? "not specified", 100)}
Occupation Claimed: ${sanitizeField(body.occupationClaimed ?? "not specified", 200)}
Income Claimed (AED/month): ${sanitizeField(body.incomeClaimedAed ?? "not specified", 50)}
Inconsistencies Observed: ${sanitizeText(body.inconsistenciesObserved ?? "none noted", 2000)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Assess these documents for fraud indicators.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as DocumentFraudResult;
    if (!Array.isArray(result.documentAssessments)) result.documentAssessments = [];
    else for (const d of result.documentAssessments) { if (!Array.isArray(d.redFlags)) d.redFlags = []; if (!Array.isArray(d.verificationRequired)) d.verificationRequired = []; }
    if (!Array.isArray(result.requiredVerificationSteps)) result.requiredVerificationSteps = [];
    if (!Array.isArray(result.externalVerificationSources)) result.externalVerificationSources = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "document-fraud temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
