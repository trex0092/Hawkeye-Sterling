import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField, sanitizeLlmInput } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CaseInput {
  id: string;
  subject: string;
  meta: string;
  narrative?: string;
  redFlags?: string[];
  /** FATF typology detected for this case — used to score typology match. */
  detectedTypology?: string;
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

For each case you will score the SAR/STR narrative quality and completeness. Evaluate ALL of the following criteria:

── UAE FIU 6-PART COMPLETENESS (35 points total) ──
1. WHAT HAPPENED (6 pts): Is the suspicious transaction/behaviour clearly described?
2. WHY SUSPICIOUS (6 pts): Are specific indicators articulated that match known typologies?
3. SUBJECT DETAILS (7 pts): Does the narrative include full name, ID/document number, occupation, AND relationship to the reporting institution? Partial credit for partial coverage.
4. TRANSACTION DETAILS (8 pts): Are specific amounts (not vague "large sum"), dates, account numbers/instruments, and counterparties documented? Deduct heavily for vague language like "a large sum" or "recent transactions" with no specifics.
5. LEGITIMACY DETERMINATION (4 pts): Does the narrative explain what steps the institution took to determine whether the activity was legitimate, and why it could not do so?
6. REGULATORY BASIS (4 pts): Does the narrative explicitly cite FDL 10/2025 Art. 15 (reporting obligation) or another UAE AML law provision as the legal basis for filing?

── GENERAL QUALITY (35 points total) ──
7. WHO (5 pts): Is the subject clearly identified with full name, entity type, identification details?
8. WHEN (5 pts): Are dates, time periods, and timelines documented?
9. WHERE (5 pts): Are jurisdictions, accounts, and geographies identified?
10. Red flags (10 pts): Are red flags documented with reference to FATF typologies or UAE AML guidelines?
11. Tipping-off risk (5 pts): Is the narrative free of language that could constitute tipping-off under FDL 10/2025 Art. 29? (Score 5 if clean, 0 if tipping-off language present — flag as fatal.)
12. FATF R.20 elements (5 pts): Does it cover all mandatory elements for STR filing?

── TYPOLOGY MATCH (15 points) ──
13. TYPOLOGY MATCH: If a detected typology is provided for the case, does the narrative reference that specific FATF typology by name? Full credit (15 pts) for explicit named citation of the detected typology (e.g. "This activity pattern is consistent with the FATF typology: <name>"). Partial credit (8 pts) if a related typology is cited. Zero if no typology is cited at all.

── SPECIFICITY PENALTY ──
Deduct up to 15 points for vague language: "large sum", "significant amount", "recent transactions", "suspicious behaviour" with no quantification, "unusual activity" with no specifics. Each vague instance without supporting specifics deducts 3 points (max 15 pts total deduction).

FATAL ISSUES (cause goAML rejection): empty narrative, missing subject identity, no red flag documented, tipping-off language present, no regulatory basis cited.

Each case input includes: id, subject, meta, narrative, redFlags, and optionally detectedTypology.

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }
  const { cases } = body;
  if (!Array.isArray(cases) || cases.length === 0) {
    return NextResponse.json({ ok: false, error: "cases must be a non-empty array" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  const userContent = cases
    .slice(0, 50)
    .map((c) => {
      const redFlagsStr =
        c.redFlags && c.redFlags.length > 0
          ? c.redFlags.slice(0, 20).map((f) => sanitizeField(f, 200)).join("; ")
          : "none documented";
      const typologyLine = c.detectedTypology
        ? `\nDetected Typology: ${sanitizeField(c.detectedTypology, 200)}`
        : "\nDetected Typology: (none provided)";
      return `Case ID: ${sanitizeField(c.id, 100)}
Subject: ${sanitizeField(c.subject, 300)}
Meta: ${sanitizeField(c.meta, 300)}
Narrative: ${sanitizeLlmInput(c.narrative, 2000) || "(empty)"}
Red Flags: ${redFlagsStr}${typologyLine}`;
    })
    .join("\n\n---\n\n");

  const client = getAnthropicClient(apiKey, 4_500);
  let claudeRes: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    claudeRes = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please score the following SAR/STR cases:\n\n${userContent}`,
        },
      ],
    });
  } catch (err) {
    console.warn("[sar-qa-score] Anthropic API error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  const rawText = (claudeRes.content.find(b => b.type === "text") as { text: string } | undefined)?.text ?? "";

  let parsed: { scores: Array<{ id: string; score: number; missingElements: string[]; suggestions: string[]; fatalIssues: string[] }> };
  try {
    const cleaned = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned) as typeof parsed;
    if (!Array.isArray(parsed.scores)) {
      return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
    }
  } catch {
    return NextResponse.json({ ok: true, scores: fallbackScores(cases) }, { headers: gate.headers });
  }

  const scores: QaScore[] = parsed.scores.map((s) => ({
    id: s.id,
    score: s.score,
    grade: toGrade(s.score),
    missingElements: Array.isArray(s.missingElements) ? s.missingElements : [],
    suggestions: Array.isArray(s.suggestions) ? s.suggestions : [],
    fatalIssues: Array.isArray(s.fatalIssues) ? s.fatalIssues : [],
  }));

  // Write audit event (server-side call — note: writeAuditEvent uses localStorage
  // so in a server context this is a no-op, but we call it for compliance traceability)
  try {
    writeAuditEvent("mlro", "sar-qa.ai-score", `scored ${scores.length} case(s)`);
  } catch {
    // Non-fatal — server-side localStorage is unavailable
  }

  void writeAuditChainEntry(
    {
      event: "sar.qa_scored",
      actor: gate.keyId,
      caseCount: scores.length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length) : 0,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn("[sar-qa-score] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({ ok: true, scores }, { headers: gate.headers });
}
