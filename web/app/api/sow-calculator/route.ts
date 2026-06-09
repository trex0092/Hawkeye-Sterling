export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface SowCalculatorResult {
  sowRisk: "critical" | "high" | "medium" | "low" | "clear";
  totalDeclaredIncomeAed: number;
  totalDeclaredAssetsAed: number;
  totalExpenditureAed: number;
  unexplainedWealthAed: number;
  unexplainedWealthPct: number;
  wealthConsistency: "consistent" | "partially_inconsistent" | "inconsistent" | "insufficient_data";
  incomeStreams: Array<{
    source: string;
    annualAed: number;
    verifiable: boolean;
    documentRequired: string;
  }>;
  assetsSummary: Array<{
    asset: string;
    valueAed: number;
    acquisitionSource: string;
    verifiable: boolean;
  }>;
  redFlags: string[];
  requiredDocumentation: string[];
  illicitEnrichmentRisk: boolean;
  regulatoryBasis: string;
  recommendation: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName?: string;
    declaredIncome: string;
    declaredAssets?: string;
    periodYears?: string;
    knownExpenditures?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.declaredIncome?.trim()) return NextResponse.json({ ok: false, error: "declaredIncome required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sow-calculator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE source of wealth (SOW) and source of funds (SOF) specialist with expertise in PEP wealth reconciliation, UNCAC Article 20 illicit enrichment analysis, and UAE Federal Decree-Law No. 10 of 2025 EDD requirements. Analyse declared income streams and assets to identify unexplained wealth gaps, illicit enrichment risk, and documentation deficiencies. Calculate total declared income vs total declared assets and quantify unexplained wealth in AED. Identify specific red flags and required documentation. Apply FATF R.12 PEP SOW/SOF standards. Respond ONLY with valid JSON matching the SowCalculatorResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Subject Name: ${sanitizeField(body.subjectName)}
Declared Income (description): ${body.declaredIncome}
Declared Assets: ${body.declaredAssets ?? "not provided"}
Review Period (years): ${body.periodYears ?? "not specified"}
Known Expenditures: ${body.knownExpenditures ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Conduct a source of wealth reconciliation analysis. Return complete SowCalculatorResult JSON with AED amounts where calculable.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SowCalculatorResult;
    if (!Array.isArray(result.incomeStreams)) result.incomeStreams = [];
    if (!Array.isArray(result.assetsSummary)) result.assetsSummary = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    void writeAuditChainEntry(
      { event: "sow_calculation_completed", actor: gate.keyId, sowRisk: result.sowRisk, unexplainedWealthPct: result.unexplainedWealthPct, redFlagCount: result.redFlags.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "sow-calculator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
