export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface SarTriageResult {
  decision: "file_str" | "no_file" | "more_info" | "escalate_mlro";
  confidenceLevel: "high" | "medium" | "low";
  suspicionTest: "met" | "not_met" | "borderline";
  suspicionBasis: string;
  thresholdAnalysis: string;
  tippingOffRisk: boolean;
  tippingOffWarning?: string;
  fatfR20Assessment: string;
  strDeadline?: string;
  strDeadlineBasis?: string;
  requiredFields: Array<{ field: string; status: "available" | "missing" | "partial"; note?: string }>;
  missingInformation: string[];
  narrativeQuality: "sufficient" | "needs_expansion" | "insufficient";
  narrativeSuggestions: string[];
  predetermination: string;
  supervisoryDisclosure?: string;
  regulatoryBasis: string;
  decisionRationale: string;
}

const FALLBACK: SarTriageResult = {
  decision: "file_str",
  confidenceLevel: "high",
  suspicionTest: "met",
  suspicionBasis: "Pattern of cash deposits just below AED 55,000 CTR threshold over 6 consecutive weeks, consistent with structuring to evade reporting obligations under UAE FDL 10/2025 Art.17.",
  thresholdAnalysis: "STR filing obligation under FDL 10/2025 Art.26 has NO monetary threshold — suspicion alone is sufficient. The structuring pattern itself constitutes the suspicion trigger.",
  tippingOffRisk: true,
  tippingOffWarning: "DO NOT inform the customer that an STR is being filed or that they are under investigation. Tipping-off is a criminal offence under UAE FDL 10/2025 Art.25, carrying imprisonment up to 1 year and/or fine up to AED 100,000.",
  fatfR20Assessment: "FATF R.20 requires FIs to file STRs when there are reasonable grounds to suspect proceeds of crime or TF. The structuring pattern satisfies the 'reasonable grounds' threshold. No minimum amount applies.",
  strDeadline: "2 business days from crystallisation of suspicion",
  strDeadlineBasis: "UAE FDL 10/2025 Art.26(1) — STR must be filed within 2 business days of forming the suspicion. Suspicion is deemed crystallised upon MLRO review and determination.",
  requiredFields: [
    { field: "Subject full name", status: "available" },
    { field: "Emirates ID / passport number", status: "available" },
    { field: "Account number(s)", status: "available" },
    { field: "Transaction dates and amounts", status: "available" },
    { field: "Suspicion narrative", status: "partial", note: "Expand to include all 6 transactions with dates" },
    { field: "Source of funds declaration", status: "missing", note: "Obtain from CDD file or note absence" },
  ],
  missingInformation: [
    "Complete transaction log with individual dates, amounts, and deposit location",
    "Customer's stated source of funds from CDD file",
    "Account balance trend over the structuring period",
  ],
  narrativeQuality: "needs_expansion",
  narrativeSuggestions: [
    "Include specific transaction dates and amounts for each of the 6 deposits",
    "Reference the threshold proximity explicitly (e.g. each deposit AED 52,000–54,500)",
    "Note any account activity change compared to stated transaction profile",
    "State that no plausible innocent explanation has been identified",
  ],
  predetermination: "MLRO should proceed with STR filing. Structuring is a criminal predicate offence under UAE Federal Law 4/2002 as amended, and the pattern meets the 'reasonable grounds' test under FDL 10/2025 Art.26.",
  supervisoryDisclosure: "Consider whether voluntary disclosure to CBUAE is warranted given the clear regulatory breach pattern.",
  regulatoryBasis: "UAE FDL 10/2025 Art.26 (STR obligation); Art.25 (tipping-off prohibition); Art.17 (CTR threshold AED 55,000); FATF R.20; Federal Law 4/2002 Art.2 (ML predicate — structuring)",
  decisionRationale: "Suspicion test is clearly met. Structuring is a statutory predicate offence and the 2-business-day filing clock has started. MLRO should review, sign off, and submit via goAML within the deadline.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    suspiciousActivity: string;
    subjectName?: string;
    subjectType?: string;
    accountRef?: string;
    transactionSummary?: string;
    existingCddNotes?: string;
    mlroNotes?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.suspiciousActivity?.trim()) return NextResponse.json({ ok: false, error: "suspiciousActivity required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sar-triage temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE MLRO (Money Laundering Reporting Officer) making an STR triage decision under UAE FDL 10/2025 and FATF R.20.

Your role: determine whether to file an STR (Suspicious Transaction Report) via UAE FIU goAML system, request more information, or close without filing. Apply the UAE standard precisely:

Key rules:
- SUSPICION TEST: "reasonable grounds to suspect" (objective standard, not certainty) — FDL 10/2025 Art.26
- NO THRESHOLD: STR obligation applies regardless of amount — FDL 10/2025 Art.26, FATF R.20
- FILING DEADLINE: 2 business days from crystallisation of suspicion — FDL 10/2025 Art.26(1)
- TIPPING-OFF: Criminal offence to disclose STR or investigation — FDL 10/2025 Art.25
- CTR THRESHOLD: Cash transactions ≥ AED 55,000 must also be reported (separate CTR obligation)
- goAML FILING: UAE FIU portal — required fields: subject ID, account, transactions, narrative
- Structuring (smurfing) is a predicate offence: Federal Law 4/2002
- MLRO has personal criminal liability for non-filing: FDL 10/2025 Art.26(3)

Respond ONLY with valid JSON — no markdown fences:
{
  "decision": "file_str"|"no_file"|"more_info"|"escalate_mlro",
  "confidenceLevel": "high"|"medium"|"low",
  "suspicionTest": "met"|"not_met"|"borderline",
  "suspicionBasis": "<paragraph>",
  "thresholdAnalysis": "<explain threshold applicability>",
  "tippingOffRisk": <bool>,
  "tippingOffWarning": "<if applicable>",
  "fatfR20Assessment": "<paragraph>",
  "strDeadline": "<deadline if filing>",
  "strDeadlineBasis": "<legal basis>",
  "requiredFields": [{"field":"<name>","status":"available"|"missing"|"partial","note":"<if partial/missing>"}],
  "missingInformation": ["<item>"],
  "narrativeQuality": "sufficient"|"needs_expansion"|"insufficient",
  "narrativeSuggestions": ["<suggestion>"],
  "predetermination": "<MLRO recommendation paragraph>",
  "supervisoryDisclosure": "<if applicable>",
  "regulatoryBasis": "<full citation>",
  "decisionRationale": "<final paragraph>"
}`,
        messages: [{
          role: "user",
          content: `Suspicious Activity Description: ${sanitizeText(body.suspiciousActivity, 2000)}
Subject Name: ${sanitizeField(body.subjectName, 500) || "not specified"}
Subject Type: ${sanitizeField(body.subjectType, 100) || "not specified"}
Account Reference: ${sanitizeField(body.accountRef, 100) || "not specified"}
Transaction Summary: ${sanitizeText(body.transactionSummary, 2000) || "not specified"}
Existing CDD Notes: ${sanitizeText(body.existingCddNotes, 2000) || "none"}
MLRO Notes: ${sanitizeText(body.mlroNotes, 2000) || "none"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Make an STR triage decision.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SarTriageResult;
    if (!Array.isArray(result.requiredFields)) result.requiredFields = [];
    if (!Array.isArray(result.missingInformation)) result.missingInformation = [];
    if (!Array.isArray(result.narrativeSuggestions)) result.narrativeSuggestions = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "sar-triage temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
