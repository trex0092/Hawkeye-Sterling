export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PfIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "dual_use" | "sanctions_evasion" | "financing_pattern" | "entity" | "jurisdiction" | "trade" | "other";
  unscr: string;
  detail: string;
}

export interface PfScreenerResult {
  pfRisk: "critical" | "high" | "medium" | "low" | "clear";
  wmdNexus: "confirmed" | "possible" | "unlikely" | "none";
  sanctionedEntityHit: boolean;
  dualUseGoodsDetected: boolean;
  dualUseCategories: string[];
  indicators: PfIndicator[];
  primaryConcern: string;
  mandatoryFreeze: boolean;
  freezeBasis?: string;
  recommendedAction: "freeze_and_report_immediately" | "file_str" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  requiredActions: string[];
  applicableRegime: string[];
  regulatoryBasis: string;
  pfObligations: string[];
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  let body: {
    subject: string;
    subjectCountry?: string;
    counterparty?: string;
    counterpartyCountry?: string;
    goods?: string;
    transactionType?: string;
    amount?: string;
    currency?: string;
    endUser?: string;
    endUserCountry?: string;
    existingRedFlags?: string[];
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.subject?.trim()) return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "proliferation-finance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE proliferation financing (PF) specialist. Assess transactions/entities for weapons of mass destruction proliferation financing risk under FATF R.7, UAE FDL 10/2025, and UN WMD sanctions regimes.

Key frameworks:
- FATF R.7 (targeted financial sanctions for PF), FATF Guidance on Countering PF (2020)
- UNSCR 1718/2397 (DPRK — total embargo on most goods), UNSCR 1737/2231 (Iran nuclear)
- UNSCR 1267/1989 (Al-Qaida), UNSCR 1929 (Iran arms)
- UAE Federal Decree-Law 26/2021 on Strategic Goods Control (SGCL)
- UAE Cabinet Decision 57/2020 (DPRK implementing measures)
- CBUAE PF Circular 2023
- UAE FDL 10/2025 Art.21(3) — PF STR obligation (no threshold)

PF red flags: dual-use goods, machine tools, precision instruments, electronics, chemicals, biological materials to WMD-risk jurisdictions; front companies; false end-user certificates; payments inconsistent with stated goods; DPRK/Iran/Syria/Libya nexus; third-country transshipment.

Respond ONLY with valid JSON — no markdown fences:
{
  "pfRisk": "critical"|"high"|"medium"|"low"|"clear",
  "wmdNexus": "confirmed"|"possible"|"unlikely"|"none",
  "sanctionedEntityHit": <bool>,
  "dualUseGoodsDetected": <bool>,
  "dualUseCategories": ["<category>"],
  "indicators": [{"indicator":"<text>","severity":"critical"|"high"|"medium"|"low","category":"dual_use"|"sanctions_evasion"|"financing_pattern"|"entity"|"jurisdiction"|"trade"|"other","unscr":"<citation>","detail":"<explanation>"}],
  "primaryConcern": "<summary>",
  "mandatoryFreeze": <bool>,
  "freezeBasis": "<if freeze required>",
  "recommendedAction": "freeze_and_report_immediately"|"file_str"|"escalate_mlro"|"enhanced_dd"|"monitor"|"clear",
  "actionRationale": "<paragraph>",
  "requiredActions": ["<action>"],
  "applicableRegime": ["<regime>"],
  "regulatoryBasis": "<full citation>",
  "pfObligations": ["<obligation>"]
}`,
        messages: [{
          role: "user",
          content: `Subject: ${sanitizeField(body.subject, 500)}
Subject Country: ${sanitizeField(body.subjectCountry ?? "not specified", 100)}
Counterparty: ${sanitizeField(body.counterparty ?? "not specified", 500)}
Counterparty Country: ${sanitizeField(body.counterpartyCountry ?? "not specified", 100)}
Goods / Services: ${sanitizeText(body.goods ?? "not specified", 2000)}
Transaction Type: ${sanitizeField(body.transactionType ?? "not specified", 100)}
Amount: ${body.amount ?? "not specified"} ${sanitizeField(body.currency ?? "", 10)}
End User: ${sanitizeField(body.endUser ?? "not specified", 500)}
End User Country: ${sanitizeField(body.endUserCountry ?? "not specified", 100)}
Existing Red Flags: ${body.existingRedFlags?.slice(0, 30).map((f: string) => sanitizeField(f, 200)).join("; ") ?? "none"}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Assess for proliferation financing risk.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PfScreenerResult;
    if (!Array.isArray(result.dualUseCategories)) result.dualUseCategories = [];
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.requiredActions)) result.requiredActions = [];
    if (!Array.isArray(result.applicableRegime)) result.applicableRegime = [];
    if (!Array.isArray(result.pfObligations)) result.pfObligations = [];
    void writeAuditChainEntry({ event: "proliferation_finance.completed", actor: gate.keyId }, tenant).catch(() => {});
return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "proliferation-finance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
