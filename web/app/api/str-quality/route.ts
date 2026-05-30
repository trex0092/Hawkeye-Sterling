export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface StrQualityResult {
  qualityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  goamlReadiness: "ready" | "needs-revision" | "major-rework";
  missingElements: string[];
  narrativeWeaknesses: string[];
  strengths: string[];
  revisedNarrativeSuggestions: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    narrativeText: string;
    subjectName: string;
    totalAmount: string;
    transactionCount: string;
    suspectedOffence: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "str-quality temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in goAML STR quality assessment. Evaluate STR narratives for UAE FIU/goAML submission readiness. Return valid JSON only matching the StrQualityResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess the STR narrative quality for goAML submission.\n\nSubject: ${sanitizeField(body.subjectName)}\nTotal Amount: ${sanitizeField(body.totalAmount)}\nTransaction Count: ${sanitizeField(body.transactionCount)}\nSuspected Offence: ${sanitizeField(body.suspectedOffence)}\nContext: ${sanitizeText(body.context)}\n\nNarrative Text:\n${sanitizeText(body.narrativeText)}\n\nReturn JSON with fields: qualityScore (0-100), grade (A/B/C/D/F), goamlReadiness, missingElements[], narrativeWeaknesses[], strengths[], revisedNarrativeSuggestions[], regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as StrQualityResult;
    if (!Array.isArray(result.missingElements)) result.missingElements = [];
    if (!Array.isArray(result.narrativeWeaknesses)) result.narrativeWeaknesses = [];
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.revisedNarrativeSuggestions)) result.revisedNarrativeSuggestions = [];
    void writeAuditChainEntry(
      { event: "str_quality_assessed", actor: gate.keyId, qualityScore: result.qualityScore, grade: result.grade, goamlReadiness: result.goamlReadiness },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "str-quality temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
