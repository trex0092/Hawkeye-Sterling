export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

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


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.events?.trim()) return NextResponse.json({ ok: false, error: "events required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "case-timeline temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
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
${sanitizeText(body.events, 5000)}

Subject Name: ${sanitizeField(body.subjectName, 200) || "not specified"}
Account Reference: ${sanitizeField(body.accountRef, 100) || "not specified"}
Case Reference: ${sanitizeField(body.caseRef, 100) || "not specified"}
Additional Context: ${body.context ?? "none"}

Build the STR timeline and goAML narrative block.`,
          },
        ],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CaseTimelineResult;
    if (!Array.isArray(result.timeline)) result.timeline = [];
    void writeAuditChainEntry(
      { event: "case_timeline.generated", actor: gate.keyId, timelineEventCount: result.timeline.length, patternIdentified: result.patternIdentified, strDeadline: result.strDeadline },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "case-timeline temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
