// POST /api/regulatory-triage
//
// Batch triage endpoint for the UAE Regulatory Feed. Accepts up to 20
// regulatory items and returns per-item triage metadata via Claude Haiku:
// relevance score, impact level, required action, and optional deadline.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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
  const tenant = tenantIdFromGate(gate);
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
      { ok: true, results: [], status: "degraded", reason: "AI triage key not configured — feed items displayed unscored." },
      { status: 200, headers: gate.headers }
    );
  }

  const compact = items.map((i) => ({
    id: i.id,
    title: sanitizeField(i.title, 500),
    summary: sanitizeText(i.summary ?? "", 2000),
    tone: sanitizeField(i.tone, 100),
    source: sanitizeField(i.source, 200),
  }));

  let results: TriageResult[];
  try {
    const client = getAnthropicClient(apiKey, 30_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      // 20 items × ~5 short fields needs well over 700 tokens; an undersized
      // budget truncated the array (no closing "]") and the parse failed,
      // surfacing as "degraded mode" with items unscored.
      max_tokens: 4_096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: JSON.stringify(compact) },
        // Prefill the assistant turn with "[" so the model is forced to
        // continue a JSON array rather than wrapping it in prose. We prepend
        // the "[" back below before parsing.
        { role: "assistant", content: "[" },
      ],
    });
    const continuation = (response.content.find(b => b.type === "text") as { text: string } | undefined)?.text ?? "";
    const raw = `[${continuation}`;
    // Extract the outermost array (tolerates any trailing prose after "]").
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { ok: true, results: [], status: "degraded", reason: "AI triage response could not be parsed — feed items displayed unscored." },
        { status: 200, headers: gate.headers }
      );
    }
    results = JSON.parse(jsonMatch[0]) as TriageResult[];
    if (!Array.isArray(results)) results = [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[hawkeye] regulatory-triage upstream error:", msg);
    return NextResponse.json(
      { ok: false, error: `Regulatory triage upstream error — ${msg}` },
      { status: 503, headers: gate.headers }
    );
  }

  void writeAuditChainEntry({ event: "regulatory_triage.completed", actor: gate.keyId, itemCount: items.length, resultCount: results.length }, tenant).catch(() => {});
  return NextResponse.json({ ok: true, results }, { headers: gate.headers });
}
