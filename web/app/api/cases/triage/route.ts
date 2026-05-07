// POST /api/cases/triage
//
// Batch triage endpoint. Sends up to 10 cases at a time to Claude Haiku
// to classify typologies, build a narrative, identify the most serious
// risk, set an escalation priority, and assign a similarity group tag.
// Larger batches are split and sent sequentially; results are merged in
// original order.
//
// Charter P2: every triage decision is backed by FATF typology codes.
// Charter P4: case data is never persisted — ephemeral request only.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const BATCH_SIZE = 10;

interface CaseInput {
  id: string;
  subject: string;
  meta: string;
  status: string;
  screeningHits?: Array<{ listId: string; score: number }>;
}

interface TriageResult {
  id: string;
  typologies: string[];
  narrative: string;
  mostSerious: string;
  escalation: "immediate" | "within_24h" | "routine" | "none";
  similarityGroup: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

const SYSTEM_PROMPT = `You are a UAE AML case triage engine. For each case in the input array, return a JSON array (same order) of objects with: typologies (array of FATF codes e.g. 'ML-TF-01 Structuring'), narrative (1 sentence summary), mostSerious (highest-risk typology label), escalation ('immediate'|'within_24h'|'routine'|'none'), similarityGroup (short tag for grouping similar cases e.g. 'structuring-gold' or 'pep-exposure'). Return ONLY the JSON array.`;

async function triageBatch(
  cases: CaseInput[],
  apiKey: string,
): Promise<TriageResult[]> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(cases),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const text = (data.content?.[0]?.text ?? "[]").trim();

  // Strip markdown fences if model ignored the instruction
  const clean = text
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse triage response as JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Triage response was not a JSON array");
  }

  // Map parsed entries back, filling defaults for any missing fields
  return (parsed as Array<Record<string, unknown>>).map((item, i) => {
    const input = cases[i];
    const id = typeof item["id"] === "string" ? item["id"] : (input?.id ?? `unknown-${i}`);
    const typologies = Array.isArray(item["typologies"])
      ? (item["typologies"] as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const narrative = typeof item["narrative"] === "string" ? item["narrative"] : "No narrative generated.";
    const mostSerious = typeof item["mostSerious"] === "string" ? item["mostSerious"] : (typologies[0] ?? "Unknown");
    const rawEscalation = item["escalation"];
    const escalation: TriageResult["escalation"] =
      rawEscalation === "immediate" ||
      rawEscalation === "within_24h" ||
      rawEscalation === "routine" ||
      rawEscalation === "none"
        ? rawEscalation
        : "routine";
    const similarityGroup =
      typeof item["similarityGroup"] === "string" ? item["similarityGroup"] : "general";

    return { id, typologies, narrative, mostSerious, escalation, similarityGroup };
  });
}

function ruleBasedTriage(cases: CaseInput[]): TriageResult[] {
  return cases.map((c) => {
    const text = `${c.subject} ${c.meta}`.toLowerCase();
    const typologies: string[] = [];
    if (/structur|smurfing|cash/.test(text)) typologies.push("ML-TF-01 Structuring");
    if (/sanction|ofac|sdn|un\s?1267|eu\s?cfsp|eocn/.test(text)) typologies.push("ML-TF-06 Sanctions Exposure");
    if (/pep|politic|government|minister/.test(text)) typologies.push("ML-TF-09 PEP Risk");
    if (/terror|extremi|isis|al.qaeda/.test(text)) typologies.push("ML-TF-02 TF Indicators");
    if (/shell|nominee|beneficial.owner|layering/.test(text)) typologies.push("ML-TF-03 Layering");
    if (/crypto|virtual.asset|bitcoin|usdt/.test(text)) typologies.push("ML-TF-07 Virtual Asset Risk");
    if (/gold|precious|metal|jewel/.test(text)) typologies.push("ML-TF-10 DPMS Risk");
    if (typologies.length === 0) typologies.push("ML-TF-00 General Suspicious Activity");
    const hasSanctions = typologies.some((t) => t.includes("Sanction"));
    const hasTF = typologies.some((t) => t.includes("TF"));
    const escalation: TriageResult["escalation"] = hasSanctions || hasTF ? "immediate" : c.status === "OPEN" ? "within_24h" : "routine";
    return {
      id: c.id,
      typologies,
      narrative: `Case requires review: ${typologies[0] ?? "suspicious activity"} indicators detected.`,
      mostSerious: typologies[0] ?? "General Suspicious Activity",
      escalation,
      similarityGroup: typologies[0]?.split(" ")[0]?.toLowerCase() ?? "general",
    };
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  let body: { cases?: CaseInput[] };
  try {
    body = (await req.json()) as { cases?: CaseInput[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.cases) || body.cases.length === 0) {
    return NextResponse.json(
      { ok: false, error: "body.cases must be a non-empty array" },
      { status: 400 },
    );
  }

  const allCases = body.cases;

  if (!apiKey) {
    return NextResponse.json({ ok: true, triaged: ruleBasedTriage(allCases), fallback: true });
  }

  // Split into batches of BATCH_SIZE and process sequentially
  const batches: CaseInput[][] = [];
  for (let i = 0; i < allCases.length; i += BATCH_SIZE) {
    batches.push(allCases.slice(i, i + BATCH_SIZE));
  }

  const triaged: TriageResult[] = [];
  try {
    for (const batch of batches) {
      const results = await triageBatch(batch, apiKey);
      triaged.push(...results);
    }
  } catch (err) {
    console.error(
      "[hawkeye] cases/triage: AI batch triage failed — falling back to rule-based engine. " +
      "Response carries fallback:true so UI can flag this to the operator.",
      err,
    );
    return NextResponse.json({ ok: true, triaged: ruleBasedTriage(allCases), fallback: true });
  }

  // Audit trail — triage decisions are compliance-relevant.
  try {
    writeAuditEvent(
      "system",
      "cases.triage",
      `triaged ${triaged.length} cases`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, triaged });
}
