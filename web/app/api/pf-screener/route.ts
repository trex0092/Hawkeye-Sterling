export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

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

const FALLBACK: PfScreenerResult = {
  pfRisk: "high",
  dprkNexus: "possible",
  iranNexus: "none",
  dualUseRisk: "medium",
  mandatoryFreezeRequired: false,
  risks: [
    { category: "dprk", description: "Counterparty in jurisdiction with documented DPRK front-company activity", severity: "high", unscr: "UNSCR 2375 (2017)", mandatoryFreeze: false, detail: "The counterparty jurisdiction has documented DPRK front companies operating in the precious metals and minerals sector per UN Panel of Experts reports." },
    { category: "dual_use", description: "Transaction involves industrial equipment with potential dual-use application", severity: "medium", mandatoryFreeze: false, detail: "Gold refinery equipment and certain chemical compounds used in processing can have dual-use military applications subject to export controls." },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "DPRK nexus risk requires MLRO review and potential referral to UAE EOCN. FATF R.7 and UNSCR 1718/2375 obligations apply.",
  applicableUnscrs: ["UNSCR 1718 (2006)", "UNSCR 2375 (2017)", "UNSCR 2397 (2017)"],
  requiredChecks: [
    "Screen all parties against UN Security Council Consolidated List",
    "Check UAE EOCN list for DPRK-linked entities",
    "Verify goods description against dual-use export control lists (UAE Cabinet Decision 57/2020)",
    "Confirm no UN-prohibited financial services are being provided to DPRK-linked parties",
    "Document assessment and escalate to senior management",
  ],
  regulatoryBasis: "UNSCR 1718 (2006); UNSCR 2375 (2017); FATF R.7; UAE FDL 10/2025 Art.14; UAE Cabinet Decision 57/2020 (Export Controls); EOCN guidance",
};

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subject?.trim()) return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pf-screener temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
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
          content: `Subject: ${body.subject}
Subject Country: ${body.subjectCountry ?? "not specified"}
Counterparty: ${body.counterparty ?? "not specified"}
Counterparty Country: ${body.counterpartyCountry ?? "not specified"}
Goods/Services: ${body.goods ?? "not specified"}
Transaction Type: ${body.transactionType ?? "not specified"}
Amount: ${body.amount ?? "not specified"}
Additional Context: ${body.context ?? "none"}

Assess proliferation financing risk.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "pf-screener temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PfScreenerResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "pf-screener temporarily unavailable - please retry." }, { status: 503 });
  }
}
