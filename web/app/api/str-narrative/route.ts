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
