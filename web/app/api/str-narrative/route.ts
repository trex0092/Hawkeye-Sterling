export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export interface StrNarrativeResult {
  narrative: string;
  wordCount: number;
  qualityScore: number;
  fatfR20Coverage: string[];
  missingElements: string[];
  goAmlFields: {
    reportType: string;
    suspiciousActivityType: string;
    filingBasis: string;
    deadlineDate: string;
  };
  regulatoryBasis: string;
}

const FALLBACK: StrNarrativeResult = {
  narrative: `SUSPICIOUS TRANSACTION REPORT — DRAFT

Subject: [SUBJECT NAME], [ENTITY TYPE], [NATIONALITY/JURISDICTION]

SUMMARY OF SUSPICIOUS ACTIVITY:
The subject conducted a series of structured cash deposits across multiple branches over a 14-day period, each transaction falling below the AED 55,000 reporting threshold. The cumulative value of AED 638,000 was subsequently consolidated and transmitted via international wire transfer to a counterparty in a CAHRA jurisdiction with no documented business rationale.

FACTS IDENTIFIED:
1. On [DATE], subject deposited AED [AMOUNT] at [BRANCH] — transaction reference [REF].
2. Pattern repeated across [N] transactions; aggregate total AED [TOTAL].
3. Funds consolidated and wired to [COUNTERPARTY], [JURISDICTION], on [DATE].
4. No invoice, contract, or other business documentation was presented to justify the transfers.
5. Subject's declared business activity ([ACTIVITY]) is inconsistent with the transaction volume and cross-border nature of transfers.

RED FLAGS IDENTIFIED:
— Structuring pattern consistent with FATF Typology: Placement/Layering via structured deposits (FATF R.20 §4)
— Cross-border wire to CAHRA jurisdiction without documented commercial purpose (FATF R.19)
— Transaction volume inconsistent with customer risk profile and declared business (FDL 10/2025 Art.8)
— No source of funds documentation provided despite enhanced scrutiny requests (FDL 10/2025 Art.11)

BASIS FOR SUSPICION:
The cumulative pattern of structured deposits followed by immediate offshore wire transfer is consistent with placement and layering typologies documented in FATF Guidance on ML/TF Risks and Vulnerabilities Associated with Gold (2015) and OECD CAHRA 5-Step Due Diligence. The MLRO is satisfied, on reasonable grounds, that the funds may be proceeds of a predicate offence or are being used for the purposes of money laundering contrary to UAE Federal Decree-Law No. 10/2025 Art.21.

ACTIONS TAKEN:
— Enhanced due diligence initiated on [DATE]
— Customer requested to provide source of funds documentation — not provided
— Transaction monitoring alert escalated to MLRO on [DATE]
— Freeze of funds considered; STR filed within statutory 2-business-day deadline

This report is filed pursuant to UAE FDL 10/2025 Art.26 and Cabinet Resolution 134/2025. Tipping-off prohibition applies per FDL 10/2025 Art.25.`,
  wordCount: 310,
  qualityScore: 72,
  fatfR20Coverage: ["WHO (subject identity)", "WHAT (suspicious activity)", "WHEN (dates)", "WHERE (jurisdictions)", "WHY (basis for suspicion)", "Red flags documented", "Typology link"],
  missingElements: ["Precise transaction references", "Counterparty full legal name and account details", "CDD documents held on file"],
  goAmlFields: {
    reportType: "STR — Suspicious Transaction Report",
    suspiciousActivityType: "Structuring / Layering",
    filingBasis: "FDL 10/2025 Art.26",
    deadlineDate: "2 business days from MLRO determination",
  },
  regulatoryBasis: "UAE FDL 10/2025 Art.21, Art.26; Cabinet Resolution 134/2025; FATF R.20; MoE DPMS Circular",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    subjectType?: string;
    subjectNationality?: string;
    activityDescription: string;
    amounts?: string;
    dates?: string;
    counterparty?: string;
    jurisdiction?: string;
    redFlags?: string[];
    actionsTaken?: string;
    additionalFacts?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.subjectName?.trim() || !body.activityDescription?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName and activityDescription required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  const QUALITY_THRESHOLD = 80;
  const MAX_ITERATIONS = 3;

  const baseUserContent = `Subject Name: ${body.subjectName}
Subject Type: ${body.subjectType ?? "not specified"}
Nationality/Jurisdiction: ${body.subjectNationality ?? "not specified"}
Activity Description: ${body.activityDescription}
Amounts: ${body.amounts ?? "not specified"}
Key Dates: ${body.dates ?? "not specified"}
Counterparty: ${body.counterparty ?? "not specified"}
Jurisdiction: ${body.jurisdiction ?? "not specified"}
Red Flags Identified: ${body.redFlags?.join("; ") ?? "not specified"}
Actions Taken: ${body.actionsTaken ?? "not specified"}
Additional Facts: ${body.additionalFacts ?? "none"}

Draft the STR narrative.`;

  const SYSTEM = `You are a senior UAE AML compliance officer drafting a Suspicious Transaction Report (STR) for submission via goAML to the UAE Financial Intelligence Unit (FIU).

Draft a regulator-grade STR narrative that covers ALL mandatory FATF R.20 elements:
WHO (subject identification), WHAT (suspicious activity description), WHEN (dates and timeline), WHERE (accounts, branches, jurisdictions), WHY (basis for suspicion — typology link, red flags), plus the actions taken by the reporting entity.

Tone: formal, factual, precise. No speculation beyond what the facts support. Use clear paragraphs with headings. The narrative must be suitable for direct submission to the UAE FIU via goAML.

Respond ONLY with valid JSON — no markdown fences:
{
  "narrative": "<full STR narrative — structured text with headings, 300–500 words>",
  "wordCount": <number>,
  "qualityScore": <0–100>,
  "fatfR20Coverage": ["<covered element>"],
  "missingElements": ["<element that should be added before filing>"],
  "goAmlFields": {
    "reportType": "<STR type>",
    "suspiciousActivityType": "<typology category>",
    "filingBasis": "<regulatory article>",
    "deadlineDate": "<filing deadline>"
  },
  "regulatoryBasis": "<full citation>"
}`;

  const client = getAnthropicClient(apiKey, 55_000, "str-narrative");

  try {
    let best: StrNarrativeResult | null = null;
    let iterations = 0;
    let userContent = baseUserContent;

    while (iterations < MAX_ITERATIONS) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";

      let candidate: StrNarrativeResult | null = null;
      try {
        candidate = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as StrNarrativeResult;
        if (!Array.isArray(candidate.fatfR20Coverage)) candidate.fatfR20Coverage = [];
        if (!Array.isArray(candidate.missingElements)) candidate.missingElements = [];
      } catch {
        break; // parse failure — keep best from prior iterations
      }

      if (candidate?.narrative) {
        iterations++;
        if (!best || (candidate.qualityScore ?? 0) > (best.qualityScore ?? 0)) best = candidate;
        if ((candidate.qualityScore ?? 0) >= QUALITY_THRESHOLD) break;
        if (candidate.missingElements?.length) {
          userContent = `${baseUserContent}

REVISION REQUEST (attempt ${iterations}/${MAX_ITERATIONS}):
The previous draft scored ${candidate.qualityScore}/100. Improve it by addressing these missing elements:
${candidate.missingElements.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Produce a revised narrative that scores ≥${QUALITY_THRESHOLD}/100.`;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (!best) return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
    return NextResponse.json({ ok: true, ...best, iterations }, { headers: gate.headers });
  } catch (err) {
    console.error("[str-narrative] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }
}
