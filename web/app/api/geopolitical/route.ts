// POST /api/geopolitical
//
// Political instability index for a given country. Complements the
// GET /api/geopolitical/events endpoint (which returns a list of
// current events) with a per-subject country deep-dive.
// Backs the "Political Instability Index" panel in DeepIntelPanel.tsx.
//
// Body: { name?, country, checkInstabilityIndex? }
// Response: {
//   ok: true,
//   country: string,
//   instabilityScore: number,   // 0–100
//   riskLevel: string,
//   fragileStatesProxy: number,
//   governanceTrend: "improving"|"stable"|"deteriorating",
//   amlImplication: string,
//   recommendation: string
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";
const BUDGET_MS = 4_500;

interface Body {
  name?: string;
  country?: string;
  checkInstabilityIndex?: boolean;
}

interface ParsedPayload {
  country?: string;
  instabilityScore?: number;
  riskLevel?: string;
  fragileStatesProxy?: number;
  governanceTrend?: string;
  amlImplication?: string;
  recommendation?: string;
}

const DEGRADED = {
  ok: true as const,
  country: "unknown",
  instabilityScore: 0,
  riskLevel: "unknown",
  fragileStatesProxy: 0,
  governanceTrend: "unknown",
  amlImplication: "Geopolitical analysis unavailable — AI service offline",
  recommendation: "Conduct manual country risk assessment",
  degraded: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(DEGRADED, { headers: gate.headers });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const country = sanitizeField(body.country, 100);
  const subjectName = sanitizeField(body.name, 200);

  if (!country) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400, headers: gate.headers });
  }

  const prompt = `You are a geopolitical risk analyst specialising in AML/CFT implications for UAE-based financial institutions. Provide a political instability assessment for "${country}"${subjectName ? ` in the context of a subject named "${subjectName}"` : ""}.

Return ONLY a JSON object (no prose, no markdown fences):
{
  "country": "${country}",
  "instabilityScore": <integer 0–100; higher = more unstable>,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "fragileStatesProxy": <integer 0–120 — proxy for Fragile States Index, higher = more fragile>,
  "governanceTrend": "improving" | "stable" | "deteriorating",
  "amlImplication": "<1–2 sentence AML/CFT implication for UAE firms dealing with this country>",
  "recommendation": "<specific compliance action for UAE DNFBP/FI — 1 sentence>"
}

Rules:
- instabilityScore: synthesise publicly known governance, conflict, sanctions, and financial crime risk.
- fragileStatesProxy: 0–120 aligned with the FSI scoring range.
- recommendation: reference the relevant CBUAE/FATF guidance or UAE Cabinet Decision 10/2019 where applicable.
- Be calibrated — UAE itself scores ~15, a post-conflict state ~110.`;

  try {
    const client = getAnthropicClient(apiKey, BUDGET_MS);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("");

    let parsed: ParsedPayload = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1)) as ParsedPayload;
    } catch {
      return NextResponse.json(DEGRADED, { headers: gate.headers });
    }

    void writeAuditChainEntry(
      { event: "geopolitical.instability-check", actor: gate.keyId, country, instabilityScore: parsed.instabilityScore },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] geopolitical:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      {
        ok: true,
        country: parsed.country ?? country,
        instabilityScore: parsed.instabilityScore ?? 0,
        riskLevel: parsed.riskLevel ?? "unknown",
        fragileStatesProxy: parsed.fragileStatesProxy ?? 0,
        governanceTrend: parsed.governanceTrend ?? "unknown",
        amlImplication: parsed.amlImplication ?? DEGRADED.amlImplication,
        recommendation: parsed.recommendation ?? DEGRADED.recommendation,
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[geopolitical]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(DEGRADED, { headers: gate.headers });
  }
}
