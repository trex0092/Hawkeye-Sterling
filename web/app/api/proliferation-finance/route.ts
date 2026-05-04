export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

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

const FALLBACK: PfScreenerResult = {
  pfRisk: "high",
  wmdNexus: "possible",
  sanctionedEntityHit: false,
  dualUseGoodsDetected: true,
  dualUseCategories: ["Category 3 — Electronics (EAR99 crossover)", "Dual-use ML-related components"],
  indicators: [
    {
      indicator: "Payment for machine-tool components to entity in DPRK-linked jurisdiction",
      severity: "critical",
      category: "dual_use",
      unscr: "UNSCR 1718 (2006); UNSCR 2397 (2017) — DPRK total embargo on industrial machinery",
      detail: "Machine tools and precision components are controlled dual-use goods under UNSCR 2397 and UAE Cabinet Decision 57/2020 implementing WMD-related sanctions against DPRK.",
    },
    {
      indicator: "Front company structure obscuring end-user identity in Iran/DPRK sanctions corridor",
      severity: "high",
      category: "sanctions_evasion",
      unscr: "UNSCR 2231 (Iran); UNSCR 1718 (DPRK); UAE Federal Decree-Law 26/2021",
      detail: "Use of front companies to circumvent WMD-related sanctions is a primary PF typology per FATF Guidance on Countering Proliferation Financing (2020).",
    },
  ],
  primaryConcern: "Potential dual-use goods diversion to sanctioned WMD programme via front company",
  mandatoryFreeze: false,
  recommendedAction: "escalate_mlro",
  actionRationale: "Dual-use goods payments with DPRK/Iran nexus require immediate MLRO escalation. If reasonable grounds for PF suspicion exist, STR must be filed under UAE FDL 10/2025 Art.26. CBUAE PF Circular 2023 requires enhanced CDD on all trade finance with WMD-risk jurisdictions.",
  requiredActions: [
    "Screen all parties against UNSCR 1718/1737/1267 consolidated lists via UAE EOCN",
    "Verify end-user certificate and ultimate consignee for any goods with dual-use classification",
    "Escalate to MLRO with full trade finance documentation",
    "File STR if reasonable PF suspicion — no threshold under FDL 10/2025 Art.26",
    "Check goods against UAE Strategic Goods Control List (SGCL) under MoEI",
    "Assess whether export licence required under UAE Federal Decree-Law 26/2021",
  ],
  applicableRegime: [
    "UNSCR 1718 (DPRK)",
    "UNSCR 1737 (Iran nuclear)",
    "UNSCR 2231 (Iran — JCPOA related)",
    "UNSCR 2397 (DPRK industrial goods embargo)",
    "UAE Federal Decree-Law 26/2021 (Strategic Goods Control)",
    "UAE Cabinet Decision 57/2020 (DPRK implementing measures)",
    "FATF R.7 — Targeted Financial Sanctions for PF",
  ],
  regulatoryBasis: "FATF R.7; UAE FDL 10/2025 Art.21(3); UAE Federal Decree-Law 26/2021; UAE Cabinet Decision 57/2020; CBUAE PF Circular 2023; UNSCR 1718, 1737, 2231, 2397",
  pfObligations: [
    "Immediate freeze if UNSCR-designated entity identified — no court order required (UAE Federal Decree-Law 26/2021 Art.9)",
    "STR within 2 business days of PF suspicion — FDL 10/2025 Art.26 (no threshold for PF)",
    "Enhanced due diligence on all correspondent relationships with WMD-risk jurisdictions — CBUAE PF Circular",
    "Maintain SGCL screening records 8 years — FDL 10/2025 Art.16",
    "Report suspected SGCL violation to UAE MoEI / CBUAE in parallel to FIU",
  ],
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
    currency?: string;
    endUser?: string;
    endUserCountry?: string;
    existingRedFlags?: string[];
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subject?.trim()) return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "proliferation-finance temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
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
          content: `Subject: ${body.subject}
Subject Country: ${body.subjectCountry ?? "not specified"}
Counterparty: ${body.counterparty ?? "not specified"}
Counterparty Country: ${body.counterpartyCountry ?? "not specified"}
Goods / Services: ${body.goods ?? "not specified"}
Transaction Type: ${body.transactionType ?? "not specified"}
Amount: ${body.amount ?? "not specified"} ${body.currency ?? ""}
End User: ${body.endUser ?? "not specified"}
End User Country: ${body.endUserCountry ?? "not specified"}
Existing Red Flags: ${body.existingRedFlags?.join("; ") ?? "none"}
Additional Context: ${body.context ?? "none"}

Assess for proliferation financing risk.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "proliferation-finance temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PfScreenerResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "proliferation-finance temporarily unavailable - please retry." }, { status: 503 });
  }
}
