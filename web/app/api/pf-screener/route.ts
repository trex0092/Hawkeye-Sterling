export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PfRisk {
  category: "dprk" | "iran" | "dual_use" | "unscr" | "proliferator_network" | "other";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  unscr?: string;
  mandatoryFreeze: boolean;
  detail: string;
}

export interface PfScreenerResult {
  pfRisk: "critical" | "high" | "medium" | "low" | "clear";
  dprkNexus: "confirmed" | "possible" | "unlikely" | "none";
  iranNexus: "confirmed" | "possible" | "unlikely" | "none";
  dualUseRisk: "high" | "medium" | "low" | "none";
  mandatoryFreezeRequired: boolean;
  freezeBasis?: string;
  risks: PfRisk[];
  recommendedAction: "freeze_and_report" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  applicableUnscrs: string[];
  requiredChecks: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subject: string;
    subjectCountry?: string;
    counterparty?: string;
    counterpartyCountry?: string;
    goods?: string;
    transactionType?: string;
    amount?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.subject?.trim()) return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pf-screener temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: `You are a UAE Proliferation Financing (PF) and sanctions specialist. You assess transactions and entities for proliferation financing risk under FATF Recommendation 7 and UN Security Council Resolutions.

Focus specifically on:
1. DPRK nexus — UNSCR 1718, 1874, 2094, 2270, 2321, 2375, 2397 (comprehensive prohibitions on all financial services to DPRK)
2. Iran nexus — UNSCR 2231, JCPOA obligations, arms/ballistic missile financing (UNSCR 2231 Annex B)
3. Dual-use goods — goods/technology with potential WMD or conventional arms applications per UAE Cabinet Decision 57/2020 and Wassenaar Arrangement
4. Proliferator network exposure — front companies, intermediaries documented in UN Panel of Experts reports
5. Mandatory freeze obligations — UNSCR-mandated immediate asset freeze requirements

Respond ONLY with valid JSON — no markdown fences:
{
  "pfRisk": "critical"|"high"|"medium"|"low"|"clear",
  "dprkNexus": "confirmed"|"possible"|"unlikely"|"none",
  "iranNexus": "confirmed"|"possible"|"unlikely"|"none",
  "dualUseRisk": "high"|"medium"|"low"|"none",
  "mandatoryFreezeRequired": <true|false>,
  "freezeBasis": "<UNSCR article if freeze required>",
  "risks": [{"category": "dprk"|"iran"|"dual_use"|"unscr"|"proliferator_network"|"other", "description": "<risk>", "severity": "critical"|"high"|"medium"|"low", "unscr": "<if applicable>", "mandatoryFreeze": <bool>, "detail": "<detail>"}],
  "recommendedAction": "freeze_and_report"|"escalate_mlro"|"enhanced_dd"|"monitor"|"clear",
  "actionRationale": "<paragraph>",
  "applicableUnscrs": ["<UNSCR>"],
  "requiredChecks": ["<check>"],
  "regulatoryBasis": "<citation>"
}`,
        messages: [{
          role: "user",
          content: `Subject: ${sanitizeField(body.subject, 500)}
Subject Country: ${sanitizeField(body.subjectCountry, 100) ?? "not specified"}
Counterparty: ${sanitizeField(body.counterparty, 500) ?? "not specified"}
Counterparty Country: ${sanitizeField(body.counterpartyCountry, 100) ?? "not specified"}
Goods/Services: ${sanitizeText(body.goods, 2000) ?? "not specified"}
Transaction Type: ${sanitizeField(body.transactionType, 100) ?? "not specified"}
Amount: ${sanitizeField(body.amount, 100) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Assess proliferation financing risk.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PfScreenerResult;
    if (!Array.isArray(result.risks)) result.risks = [];
    if (!Array.isArray(result.applicableUnscrs)) result.applicableUnscrs = [];
    if (!Array.isArray(result.requiredChecks)) result.requiredChecks = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "pf-screener temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
