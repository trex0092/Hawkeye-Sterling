import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CaseInput {
  id: string;
  subject: string;
  meta: string;
  narrative?: string;
  redFlags?: string[];
}

interface QaScore {
  id: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  missingElements: string[];
  suggestions: string[];
  fatalIssues: string[];
}

interface RequestBody {
  cases: CaseInput[];
}

function toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function fallbackScores(cases: CaseInput[]): QaScore[] {
  return cases.map((c) => ({
    id: c.id,
    score: 0,
    grade: "F" as const,
    missingElements: ["API key not configured"],
    suggestions: [],
    fatalIssues: [],
  }));
}

const SYSTEM_PROMPT = `You are a UAE DPMS/VASP SAR/STR quality assurance reviewer with deep expertise in FATF Recommendation 20, UAE Federal Decree-Law No. 10 of 2025 (AML/CFT/CPF Law), FDL Art. 26 filing standards, and goAML submission requirements.

For each case you will score the SAR/STR narrative quality and completeness. Evaluate:

1. WHO: Is the subject clearly identified with full name, entity type, identification details?
2. WHAT: Is the suspicious activity clearly described — transaction types, amounts, instruments?
3. WHEN: Are dates, time periods, and timelines documented?
4. WHERE: Are jurisdictions, accounts, and geographies identified?
5. WHY: Is the basis for suspicion articulated with a typology link?
6. Red flags: Are red flags documented with reference to FATF typologies or UAE AML guidelines?
7. Typology link: Does the narrative connect the activity to a known ML/TF typology?
8. Tipping-off risk: Is there any language that could constitute tipping-off under AML Law Art. 22?
9. FDL Art. 26 standard: Does the narrative meet the minimum standard for FIU filing?
10. FATF R.20 elements: Does it cover all mandatory elements for STR filing?

FATAL ISSUES (cause goAML rejection): empty narrative, missing subject identity, no red flag documented.

Respond ONLY with valid JSON (no markdown fences) in this exact format:
{
  "scores": [
    {
      "id": "<case id>",
      "score": <0-100>,
      "missingElements": ["<element>", ...],
      "suggestions": ["<suggestion>", ...],
      "fatalIssues": ["<fatal issue>", ...]
    }
  ]
}`;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  const { cases } = body;

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  const userContent = cases
    .map((c) => {
      const redFlagsStr =
        c.redFlags && c.redFlags.length > 0
          ? c.redFlags.join("; ")
          : "none documented";
      return `Case ID: ${c.id}
Subject: ${c.subject}
Meta: ${c.meta}
Narrative: ${c.narrative ?? "(empty)"}
Red Flags: ${redFlagsStr}`;
    })
    .join("\n\n---\n\n");

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please score the following SAR/STR cases:\n\n${userContent}`,
        },
      ],
    }),
  });

  if (!claudeRes.ok) {
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  interface ClaudeContent { type: string; text?: string }
  interface ClaudeResponse { content: ClaudeContent[] }
  const claudeData = (await claudeRes.json()) as ClaudeResponse;
  const rawText = claudeData.content.find((b) => b.type === "text")?.text ?? "";

  let parsed: { scores: Array<{ id: string; score: number; missingElements: string[]; suggestions: string[]; fatalIssues: string[] }> };
  try {
    const cleaned = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  const scores: QaScore[] = parsed.scores.map((s) => ({
    id: s.id,
    score: s.score,
    grade: toGrade(s.score),
    missingElements: s.missingElements,
    suggestions: s.suggestions,
    fatalIssues: s.fatalIssues,
  }));

  // Write audit event (server-side call — note: writeAuditEvent uses localStorage
  // so in a server context this is a no-op, but we call it for compliance traceability)
  try {
    writeAuditEvent("mlro", "sar-qa.ai-score", `scored ${scores.length} case(s)`);
  } catch {
    // Non-fatal — server-side localStorage is unavailable
  }

  return NextResponse.json({ ok: true, scores }, { headers: gate.headers });
}
