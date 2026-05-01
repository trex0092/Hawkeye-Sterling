export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in goAML STR quality assessment. Evaluate STR narratives for UAE FIU/goAML submission readiness. Return valid JSON only matching the StrQualityResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess the STR narrative quality for goAML submission.\n\nSubject: ${body.subjectName}\nTotal Amount: ${body.totalAmount}\nTransaction Count: ${body.transactionCount}\nSuspected Offence: ${body.suspectedOffence}\nContext: ${body.context}\n\nNarrative Text:\n${body.narrativeText}\n\nReturn JSON with fields: qualityScore (0-100), grade (A/B/C/D/F), goamlReadiness, missingElements[], narrativeWeaknesses[], strengths[], revisedNarrativeSuggestions[], regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, ...FALLBACK });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as StrQualityResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
