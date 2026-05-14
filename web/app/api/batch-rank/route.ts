// POST /api/batch-rank
//
// AI priority ranking for batch screening results.
// Ranks subjects by compliance urgency under UAE DPMS/VASP requirements.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResultInput {
  name: string;
  topScore: number;
  severity: string;
  hitCount: number;
  listCoverage: string[];
  keywordGroups: string[];
  jurisdiction?: string;
  error?: string;
}

interface RankedResult {
  name: string;
  priority: number;
  priorityLabel: "immediate" | "urgent" | "review" | "monitor" | "clear";
  reason: string;
  actionRequired: string;
}

interface BatchRankingResponse {
  ranked: RankedResult[];
  immediateCount: number;
  urgentCount: number;
  topThreats: string[];
  batchSummary: string;
}

interface RequestBody {
  results: ResultInput[];
}

const SYSTEM_PROMPT = `You are a UAE DPMS/VASP compliance triage analyst prioritizing a batch screening result set. Rank cases by compliance urgency and identify which require immediate MLRO attention. Consider: sanctions list hits (OFAC/UN/EU/UK/EOCN) are highest priority; PEP + adverse media combinations; high scores with multiple lists; CAHRA jurisdictions.

Return ONLY a JSON object with this exact structure:
{
  "ranked": [
    {
      "name": "string — subject name",
      "priority": 1,
      "priorityLabel": "immediate",
      "reason": "string — specific reason for this priority level",
      "actionRequired": "string — what to do next"
    }
  ],
  "immediateCount": 0,
  "urgentCount": 0,
  "topThreats": ["string array — names of highest-priority subjects"],
  "batchSummary": "string — 2-sentence summary of the overall batch risk picture"
}

priorityLabel must be one of: "immediate", "urgent", "review", "monitor", "clear".
priority is 1-99 (lower = higher urgency).`;

const FALLBACK: BatchRankingResponse = {
  ranked: [],
  immediateCount: 0,
  urgentCount: 0,
  topThreats: [],
  batchSummary: "API key not configured",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 , headers: gate.headers});
  }

  const results = body.results ?? [];

  if (results.length === 0) {
    writeAuditEvent("analyst", "batch.ai-priority-ranking", "no results — skipped");
    return NextResponse.json({ ok: false, error: "batch-rank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writeAuditEvent("analyst", "batch.ai-priority-ranking", `no-api-key — ${results.length} results skipped`);
    return NextResponse.json({ ok: false, error: "batch-rank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(results),
        },
      ],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as BatchRankingResponse;

    writeAuditEvent(
      "analyst",
      "batch.ai-priority-ranking",
      `${results.length} results ranked — immediate: ${parsed.immediateCount ?? 0} · urgent: ${parsed.urgentCount ?? 0} · topThreats: ${(parsed.topThreats ?? []).join(", ")}`,
    );

    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("analyst", "batch.ai-priority-ranking", `error — ${msg}`);
    return NextResponse.json({ ok: false, error: "batch-rank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
