import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AuditEntryInput {
  ts: string;
  actor: string;
  action: string;
  subject?: string;
}

interface RequestBody {
  entries: AuditEntryInput[];
  periodDays: number;
}

interface Anomaly {
  type: string;
  description: string;
  severity: "high" | "medium" | "low";
  affectedActors: string[];
  recommendation: string;
}

interface ActorRisk {
  actor: string;
  riskFlag: string;
  actionCount: number;
}

interface AuditAnomalyResult {
  anomalyScore: number;
  anomalyLevel: "critical" | "elevated" | "normal";
  anomalies: Anomaly[];
  patternSummary: string;
  actorRisk: ActorRisk[];
  integrityNote: string;
  regulatoryNote: string;
}

const FALLBACK: AuditAnomalyResult = {
  anomalyScore: 0,
  anomalyLevel: "normal",
  anomalies: [],
  patternSummary: "API key not configured — manual review required.",
  actorRisk: [],
  integrityNote: "",
  regulatoryNote: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
    }

  const { entries, periodDays } = body;
  if (!entries || !Array.isArray(entries)) {
    return NextResponse.json({ ok: false, error: "entries array is required" }, { status: 400 , headers: gate.headers});
  }

  try { writeAuditEvent("mlro", "audit-trail.ai-anomaly-scan", "trail"); }
  catch (err) { console.warn("[hawkeye] audit-anomaly writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "audit-anomaly temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system:
          "You are a UAE AML internal audit specialist. Analyze this audit trail for suspicious access patterns, operational anomalies, and compliance gaps that could indicate insider threat, system manipulation, or procedural failures under FDL 10/2025 Art.21 and FATF R.18. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Audit trail (${periodDays} days, ${entries.length} entries): ${JSON.stringify(entries)}. Return ONLY this JSON: { "anomalyScore": number, "anomalyLevel": "critical"|"elevated"|"normal", "anomalies": [{ "type": "string", "description": "string", "severity": "high"|"medium"|"low", "affectedActors": ["string"], "recommendation": "string" }], "patternSummary": "string", "actorRisk": [{ "actor": "string", "riskFlag": "string", "actionCount": number }], "integrityNote": "string", "regulatoryNote": "string" }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as AuditAnomalyResult;
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "audit-anomaly temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
