// POST /api/regulatory-triage
//
// Batch triage endpoint for the UAE Regulatory Feed. Accepts up to 20
// regulatory items and returns per-item triage metadata via Claude Haiku:
// relevance score, impact level, required action, and optional deadline.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a UAE DPMS/VASP compliance triage analyst. For each regulatory item provided, return a JSON array (same order) of: { id, relevance: 0-100 (how relevant to a UAE precious metals dealer / VASP), impact: 'high'|'medium'|'low', actionRequired: '1 sentence max', deadline: 'ISO date or empty string' }. Return ONLY the JSON array.`;

interface TriageItem {
  id: string;
  title: string;
  summary?: string;
  tone: string;
  source: string;
}

interface TriageResult {
  id: string;
  relevance: number;
  impact: "high" | "medium" | "low";
  actionRequired: string;
  deadline: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  let items: TriageItem[];
  try {
    const body = (await req.json()) as { items: TriageItem[] };
    items = (Array.isArray(body.items) ? body.items : []).slice(0, 20);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, results: [] }, { headers: gate.headers });
  }

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Regulatory triage unavailable — please retry. An empty list here is not a 'no items' finding." },
      { status: 503, headers: gate.headers }
    );
  }

  const compact = items.map((i) => ({
    id: i.id,
    title: i.title,
    summary: i.summary ?? "",
    tone: i.tone,
    source: i.source,
  }));

  let results: TriageResult[];
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(compact) }],
    });
    const text = (response.content.find(b => b.type === "text") as { text: string } | undefined)?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { ok: false, error: "Regulatory triage unavailable — please retry. An empty list here is not a 'no items' finding." },
        { status: 503, headers: gate.headers }
      );
    }
    results = JSON.parse(jsonMatch[0]) as TriageResult[];
    if (!Array.isArray(results)) results = [];
  } catch {
    return NextResponse.json(
      { ok: false, error: "Regulatory triage unavailable — please retry. An empty list here is not a 'no items' finding." },
      { status: 503, headers: gate.headers }
    );
  }

  return NextResponse.json({ ok: true, results }, { headers: gate.headers });
}
