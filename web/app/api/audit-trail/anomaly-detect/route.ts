export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  ip?: string;
}

export interface AnomalyItem {
  eventIds: string[];
  pattern: string;
  severity: "critical" | "high" | "medium";
  description: string;
  recommendation: string;
}

export interface AnomalyDetectResult {
  anomalies: AnomalyItem[];
  riskScore: number;
}

function buildFallback(): AnomalyDetectResult {
  return {
    anomalies: [],
    riskScore: 0,
  };
}

export async function POST(req: Request) {
  let body: { events?: AuditEvent[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.events ?? [];
  if (events.length === 0) {
    return NextResponse.json({ anomalies: [], riskScore: 0 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(buildFallback());

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a UAE AML compliance expert and cybersecurity analyst specialising in behavioural anomaly detection within financial institution audit logs. Detect suspicious patterns in audit events.

DETECTION RULES — look for ALL of the following:
1. BULK OPERATIONS: Any actor performing more than 10 actions within any 5-minute window
2. OFF-HOURS ACTIVITY: Any actions taken outside 08:00–18:00 UAE time (UTC+4). Timestamps may be in ISO 8601 UTC — convert to UAE time before checking
3. UNUSUAL ACTOR-ACTION COMBINATIONS: e.g. junior analysts filing STRs, system accounts performing manual approvals, read-only roles making deletions
4. RAPID ROLE CHANGES OR DELETIONS: Multiple role assignments or mass deletions within short periods
5. REPEATED FAILED PATTERNS: Same actor performing the same action on many targets rapidly
6. SEQUENTIAL SENSITIVE ACTIONS: e.g. case.opened → str.filed → case.closed by the same actor within minutes (bypassing four-eyes)

Return ONLY valid JSON (no markdown fences):
{
  "anomalies": [
    {
      "eventIds": ["<id1>", "<id2>"],
      "pattern": "<short pattern name e.g. 'Bulk operations' | 'Off-hours activity' | 'Unusual actor-action' | 'Rapid deletion' | 'Sequential bypass'>",
      "severity": "critical" | "high" | "medium",
      "description": "<concise explanation of why this is anomalous>",
      "recommendation": "<specific remediation step>"
    }
  ],
  "riskScore": <integer 0-100>
}

riskScore guidance: 0-20 = normal, 21-50 = elevated, 51-75 = high, 76-100 = critical.
If no anomalies are detected, return { "anomalies": [], "riskScore": 0 }.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following ${events.length} audit event(s) for anomalous patterns. Apply all detection rules.

Audit Events:
${JSON.stringify(events, null, 2)}`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as AnomalyDetectResult;

    return NextResponse.json({
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      riskScore: typeof parsed.riskScore === "number" ? Math.min(100, Math.max(0, parsed.riskScore)) : 0,
    } satisfies AnomalyDetectResult);
  } catch {
    return NextResponse.json(buildFallback());
  }
}
