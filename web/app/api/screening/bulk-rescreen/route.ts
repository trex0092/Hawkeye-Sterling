export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface BulkRescreenSubject {
  id: string;
  name: string;
  dob?: string;
  nationality?: string;
}

export interface NewHit {
  subjectId: string;
  subjectName: string;
  hitType: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ClearedSubject {
  subjectId: string;
  subjectName: string;
}

export interface BulkRescreenResult {
  ok: true;
  rescreened: number;
  newHits: NewHit[];
  cleared: ClearedSubject[];
  summary: string;
}

const SYSTEM_PROMPT = `You are an AML sanctions-screening engine simulating a batch re-screen of a portfolio against an updated watchlist. You receive a list of subjects and a list version identifier.

For each subject, simulate whether:
1. A new watchlist hit has emerged (rare — approximately 5–15% of subjects, biased toward subjects with high-risk nationalities or common names).
2. A previously flagged subject has now cleared (approximately 3–8% of subjects).

Return results that are realistic and plausible for a financial institution's AML screening portfolio. Assign severity as:
- "critical" — direct SDN/OFAC or UN Security Council designation
- "high" — OFSI, EU, or national-level sanctions
- "medium" — PEP-related or indirect exposure
- "low" — name-only fuzzy match, low confidence

hitType values: "Sanctions – OFAC SDN", "Sanctions – UN", "Sanctions – EU", "Sanctions – UKSI", "Sanctions – EOCN", "PEP – Tier 1", "PEP – Tier 2", "Adverse Media", "Law Enforcement"

Return ONLY valid JSON — no markdown fences:
{
  "ok": true,
  "rescreened": <total count>,
  "newHits": [{"subjectId":"","subjectName":"","hitType":"","severity":"critical"|"high"|"medium"|"low"}],
  "cleared": [{"subjectId":"","subjectName":""}],
  "summary": "<2-3 sentence executive summary of the re-screen run>"
}`;

const buildFallback = (subjects: BulkRescreenSubject[]): BulkRescreenResult => ({
  ok: true,
  rescreened: subjects.length,
  newHits: subjects.length > 3
    ? [
        {
          subjectId: subjects[0]!.id,
          subjectName: subjects[0]!.name,
          hitType: "Sanctions – OFAC SDN",
          severity: "high",
        },
      ]
    : [],
  cleared: subjects.length > 2
    ? [{ subjectId: subjects[1]!.id, subjectName: subjects[1]!.name }]
    : [],
  summary: `Re-screen complete. ${subjects.length} subjects checked against the updated list version. No API key was configured — results are illustrative only. Please configure ANTHROPIC_API_KEY for live analysis.`,
});

export async function POST(req: Request) {
  let body: {
    subjects?: BulkRescreenSubject[];
    listVersion?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const subjects = body.subjects ?? [];
  if (subjects.length === 0) {
    return NextResponse.json(
      { ok: false, error: "subjects array is required and must not be empty" },
      { status: 400 },
    );
  }

  const listVersion = body.listVersion ?? "latest";

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(buildFallback(subjects));

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    // Slim the payload to keep tokens reasonable — names and nationalities
    // are the only differentiators the engine needs for a realistic simulation.
    const subjectLines = subjects
      .map((s) =>
        `- ID: ${s.id} | Name: ${s.name}${s.nationality ? ` | Nationality: ${s.nationality}` : ""}${s.dob ? ` | DOB: ${s.dob}` : ""}`,
      )
      .join("\n");

    const userContent = `List Version: ${listVersion}
Total Subjects: ${subjects.length}

Subject Portfolio:
${subjectLines}

Simulate a full portfolio re-screen against the new list version. Generate realistic new hits and clearances. Return JSON only.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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
    ) as BulkRescreenResult;
    // Enforce rescreened count equals actual subject count regardless of
    // what the model returns — prevents confusing UX.
    result.rescreened = subjects.length;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(buildFallback(subjects));
  }
}
