export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

export interface TimelineEvent {
  date: string;
  event: string;
  significance: "critical" | "high" | "medium" | "low";
  fatfRef?: string;
  evidenceType: "transaction" | "behaviour" | "intelligence" | "document" | "screening" | "other";
}

export interface CaseTimelineResult {
  timeline: TimelineEvent[];
  narrativeSummary: string;
  keyDateRange: string;
  totalDuration: string;
  patternIdentified: string;
  goAmlNarrativeBlock: string;
  suspicionCrystallisedDate: string;
  strDeadline: string;
  regulatoryBasis: string;
}

const FALLBACK: CaseTimelineResult = {
  timeline: [
    {
      date: "01/01/2024",
      event: "First cash deposit of AED 54,000 recorded — just below the AED 55,000 mandatory reporting threshold.",
      significance: "high",
      fatfRef: "FATF R.20; UAE FDL 10/2025 Art.21",
      evidenceType: "transaction",
    },
    {
      date: "15/02/2024",
      event: "Second structured cash deposit of AED 54,500 received; same branch, same depositor. Pattern of structuring becomes apparent.",
      significance: "critical",
      fatfRef: "FATF R.20; UAE FDL 10/2025 Art.21(1)(c)",
      evidenceType: "transaction",
    },
    {
      date: "31/03/2025",
      event: "Outbound international wire transfer of AED 108,000 to beneficiary in high-risk jurisdiction, exhausting accumulated balance. Rapid movement of structured funds.",
      significance: "critical",
      fatfRef: "FATF R.16; UAE FDL 10/2025 Art.21",
      evidenceType: "transaction",
    },
  ],
  narrativeSummary: "Between 01 January 2024 and 31 March 2025, the subject conducted a series of structured cash deposits consistently below the AED 55,000 mandatory reporting threshold, followed by a single consolidated outbound wire transfer to a high-risk jurisdiction. The pattern is consistent with the smurfing / threshold structuring typology identified in FATF Guidance on ML/TF (2023). Reasonable grounds for suspicion of money laundering under UAE FDL 10/2025 Art.21 crystallised upon identification of the structured deposit pattern.",
  keyDateRange: "01/01/2024 – 31/03/2025",
  totalDuration: "15 months",
  patternIdentified: "Structured cash deposits below AED 55,000 threshold followed by rapid outbound wire transfers",
  goAmlNarrativeBlock: "GOAML STR NARRATIVE\nCase Reference: [CASE-REF]\nSubject: [SUBJECT-NAME]\nReport Date: [TODAY]\n\nBetween 01/01/2024 and 31/03/2025 the subject conducted structured cash deposits consistently below the AED 55,000 cash transaction reporting threshold (01/01/2024: AED 54,000; 15/02/2024: AED 54,500), followed by a consolidated outbound wire transfer of AED 108,000 on 31/03/2025 to a beneficiary in a high-risk jurisdiction. The structuring pattern is consistent with deliberate threshold avoidance (smurfing) as described in FATF Typology Guidance. Suspicion crystalised on 15/02/2024 upon identification of the repeated below-threshold deposits by the same depositor. This STR is filed pursuant to UAE FDL 10/2025 Art.21 and Art.26 within the 2 business day reporting deadline.",
  suspicionCrystallisedDate: "15/02/2024",
  strDeadline: "19/02/2024",
  regulatoryBasis: "UAE FDL 10/2025 Art.21, Art.26; FATF R.20",
};

export async function POST(req: Request) {
  let body: {
    events: string;
    subjectName?: string;
    accountRef?: string;
    caseRef?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.events?.trim()) return NextResponse.json({ ok: false, error: "events required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "case-timeline temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE MLRO building a goAML STR timeline from case notes. Organise events chronologically, identify when suspicion crystalised (FATF R.20 "reasonable grounds"), and produce a goAML-ready narrative block. The STR deadline is 2 business days from crystallisation per UAE FDL 10/2025 Art.26.

Respond ONLY with valid JSON — no markdown fences:
{
  "timeline": [{"date": "<DD/MM/YYYY>", "event": "<description>", "significance": "critical"|"high"|"medium"|"low", "fatfRef": "<optional citation>", "evidenceType": "transaction"|"behaviour"|"intelligence"|"document"|"screening"|"other"}],
  "narrativeSummary": "<ready-to-paste STR narrative paragraph>",
  "keyDateRange": "<DD/MM/YYYY – DD/MM/YYYY>",
  "totalDuration": "<e.g. 14 months>",
  "patternIdentified": "<e.g. Layering via multiple accounts over 14 months>",
  "goAmlNarrativeBlock": "<formatted for direct paste into goAML>",
  "suspicionCrystallisedDate": "<DD/MM/YYYY>",
  "strDeadline": "<DD/MM/YYYY — 2 business days from crystallisation>",
  "regulatoryBasis": "<full citation>"
}`,
        messages: [
          {
            role: "user",
            content: `Case Events (chronological or unordered notes):
${body.events}

Subject Name: ${body.subjectName ?? "not specified"}
Account Reference: ${body.accountRef ?? "not specified"}
Case Reference: ${body.caseRef ?? "not specified"}
Additional Context: ${body.context ?? "none"}

Build the STR timeline and goAML narrative block.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "case-timeline temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CaseTimelineResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "case-timeline temporarily unavailable - please retry." }, { status: 503 });
  }
}
