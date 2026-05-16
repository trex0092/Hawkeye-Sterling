export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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

const FALLBACK: StrQualityResult = {
  qualityScore: 68,
  grade: "C",
  goamlReadiness: "needs-revision",
  missingElements: [
    "Predicate offence not specified — goAML requires selection from statutory list",
    "No reference to FATF typology code",
    "Subject's source of funds not addressed",
    "No explanation of why STR is filed NOW vs earlier transactions",
  ],
  narrativeWeaknesses: [
    "Narrative uses passive voice throughout — makes attribution unclear",
    "Transaction amounts stated without context of account normal activity",
    "No link established between adverse media and suspicious transactions",
    "Conclusion states 'may constitute' — goAML requires affirmative reasonable grounds",
  ],
  strengths: [
    "All transaction dates and amounts accurately recorded",
    "Subject identification complete — full name, passport, nationality",
    "Prior STR reference included for continuity",
  ],
  revisedNarrativeSuggestions: [
    "Replace 'transactions may constitute money laundering' with 'Hawkeye Sterling has reasonable grounds to suspect that the transactions described herein represent proceeds of [predicate offence]'",
    "Add: 'These transactions are inconsistent with [SUBJECT's] stated business purpose of [PURPOSE] and exceed expected transaction volumes by [X]%'",
    "Add adverse media link: 'Adverse media screening on [DATE] identified [ARTICLE] which corroborates the above suspicion'",
  ],
  regulatoryBasis:
    "UAE FDL 10/2025 Art.17 (STR obligation), goAML UAE Technical Guide v3.1, FATF R.20 (suspicious transaction reporting)",
};

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
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
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
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "str-quality temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
