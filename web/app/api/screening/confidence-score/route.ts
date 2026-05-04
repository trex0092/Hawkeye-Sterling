export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface ConfidenceScoreResult {
  ok: true;
  confidenceScore: number;
  falsePositiveProbability: number;
  keyFactors: string[];
  recommendation: "clear" | "escalate" | "file_str" | "manual_review";
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an AML sanctions-screening specialist with deep expertise in false-positive triage for OFAC SDN, UN, EU, UKSI, and EOCN lists. Your role is to assess whether a watchlist hit against a subject is a true match or a false positive.

Given a subject's identifying data and the details of a watchlist hit, you must:
1. Compute a confidenceScore (0–100) representing the likelihood the hit is a TRUE match (100 = certain true match, 0 = certain false positive).
2. Compute falsePositiveProbability (0–100) representing the inverse likelihood this is a false positive.
3. Identify the key differentiating factors (names, dates of birth, nationalities, ID numbers, aliases, geography) that drive your assessment.
4. Recommend one of: "clear" (dispose as false positive), "escalate" (senior analyst/MLRO needed), "file_str" (proceed directly to STR), "manual_review" (gather more info first).
5. Provide concise reasoning in 2–3 sentences.

Return ONLY valid JSON — no markdown fences, no commentary:
{
  "ok": true,
  "confidenceScore": <0-100>,
  "falsePositiveProbability": <0-100>,
  "keyFactors": ["<factor 1>", "<factor 2>", ...],
  "recommendation": "clear"|"escalate"|"file_str"|"manual_review",
  "reasoning": "<2-3 sentence narrative>"
}`;

const FALLBACK: ConfidenceScoreResult = {
  ok: true,
  confidenceScore: 50,
  falsePositiveProbability: 50,
  keyFactors: [
    "Name similarity score requires further review",
    "Nationality and date of birth not yet verified",
    "No corroborating adverse media identified at this time",
  ],
  recommendation: "manual_review",
  reasoning:
    "The available data is insufficient to make a confident determination. The name match warrants further investigation but differentiating identifiers (DOB, nationality, ID number) have not been confirmed. Manual review with client clarification is recommended before disposition.",
};

export async function POST(req: Request) {
  let body: {
    subject?: {
      name?: string;
      dob?: string;
      nationality?: string;
      idNumber?: string;
    };
    hit?: {
      listName?: string;
      matchedName?: string;
      score?: number;
      details?: string;
    };
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.subject?.name || !body.hit?.listName) {
    return NextResponse.json(
      { ok: false, error: "subject.name and hit.listName are required" },
      { status: 400 },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "screening/confidence-score temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const userContent = `Subject Details:
- Name: ${body.subject.name}
- Date of Birth: ${body.subject.dob ?? "not provided"}
- Nationality: ${body.subject.nationality ?? "not provided"}
- ID Number: ${body.subject.idNumber ?? "not provided"}

Watchlist Hit:
- List: ${body.hit.listName}
- Matched Name on List: ${body.hit.matchedName ?? body.subject.name}
- Fuzzy Match Score: ${body.hit.score != null ? `${body.hit.score}/100` : "not provided"}
- Additional Details: ${body.hit.details ?? "none"}

Assess whether this is a true sanctions/PEP/watchlist match or a false positive. Return JSON only.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as ConfidenceScoreResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "screening/confidence-score temporarily unavailable - please retry." }, { status: 503 });
  }
}
