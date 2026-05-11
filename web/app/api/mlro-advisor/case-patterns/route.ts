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
  status: string;
  openedAt: string;
  reportKind?: string;
}

interface Body {
  cases: CaseInput[];
}

interface Pattern {
  type:
    | "coordinated_structuring"
    | "shared_counterparty"
    | "typology_cluster"
    | "jurisdiction_concentration"
    | "escalating_trend"
    | "consolidation_candidate"
    | "other";
  severity: "critical" | "high" | "medium";
  caseIds: string[];
  description: string;
  regulatoryImplication: string;
  recommendedAction: string;
}

interface CasePatternsResult {
  patterns: Pattern[];
  portfolioRisk: "critical" | "high" | "medium" | "low";
  consolidationRequired: boolean;
  immediateEscalations: string[];
  summary: string;
}

const FALLBACK: CasePatternsResult = {
  patterns: [],
  portfolioRisk: "low",
  consolidationRequired: false,
  immediateEscalations: [],
  summary: "Insufficient cases for pattern analysis",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const cases = body?.cases ?? [];

  if (!apiKey || cases.length < 2) {
    return NextResponse.json({ ok: false, error: "mlro-advisor/case-patterns temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  const casesSummary = cases
    .map((c) =>
      [
        `Case ID: ${c.id}`,
        `Subject: ${c.subject}`,
        `Meta: ${c.meta}`,
        `Status: ${c.status}`,
        `Opened: ${c.openedAt}`,
        ...(c.reportKind ? [`Report Kind: ${c.reportKind}`] : []),
      ].join(" | "),
    )
    .join("\n");

  const userContent = `Analyze the following ${cases.length} compliance cases for cross-case patterns and output the structured JSON:\n\n${casesSummary}`;

  const systemPrompt = [
    "You are a UAE MLRO analyzing a portfolio of compliance cases for cross-case patterns. Look for: coordinated structuring (multiple cases with similar amounts/timing), shared counterparties or beneficial owners, typology clusters (same ML method across cases), jurisdictional concentration, escalating risk trends, cases that should be consolidated into a single SAR.",
    "",
    "Output ONLY valid JSON in this exact shape:",
    `{
  "patterns": [
    {
      "type": "coordinated_structuring" | "shared_counterparty" | "typology_cluster" | "jurisdiction_concentration" | "escalating_trend" | "consolidation_candidate" | "other",
      "severity": "critical" | "high" | "medium",
      "caseIds": ["string array of case IDs involved"],
      "description": "string — specific pattern description",
      "regulatoryImplication": "string — what this pattern means under UAE/FATF rules",
      "recommendedAction": "string"
    }
  ],
  "portfolioRisk": "critical" | "high" | "medium" | "low",
  "consolidationRequired": boolean,
  "immediateEscalations": ["string array of case IDs needing immediate escalation"],
  "summary": "string — 2-sentence portfolio risk summary for the MLRO"
}`,
  ].join("\n");

  let result: CasePatternsResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      result = { ...FALLBACK, summary: `AI pattern analysis unavailable (API ${res.status}) — manual review of ${cases.length} case(s) required.` };
    } else {
      const data = (await res.json()) as {
        content?: { type: string; text: string }[];
      };
      const raw = data?.content?.[0]?.text ?? "";
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        result = JSON.parse(cleaned) as CasePatternsResult;
      } catch {
        result = { ...FALLBACK, summary: "AI response could not be parsed — manual review required." };
      }
    }
  } catch {
    result = { ...FALLBACK, summary: `AI pattern analysis temporarily unavailable — manual review of ${cases.length} case(s) required.` };
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.case-patterns",
      `${cases.length} case(s) analyzed → ${result.patterns.length} pattern(s), portfolioRisk: ${result.portfolioRisk}, consolidation: ${result.consolidationRequired}`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
