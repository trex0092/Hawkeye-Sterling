export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
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

const FALLBACK: SowCalculatorResult = {
  sowRisk: "critical",
  totalDeclaredIncomeAed: 2940000,
  totalDeclaredAssetsAed: 6200000,
  totalExpenditureAed: 0,
  unexplainedWealthAed: 3200000,
  unexplainedWealthPct: 52,
  wealthConsistency: "inconsistent",
  incomeStreams: [
    {
      source: "Government salary — Director General, Ministry of Public Works",
      annualAed: 420000,
      verifiable: true,
      documentRequired: "Official payslips for review period; HR confirmation of salary grade",
    },
    {
      source: "Rental income — declared 2 residential properties in Abu Dhabi",
      annualAed: 180000,
      verifiable: true,
      documentRequired: "Tenancy contracts, rental receipts, DLD/ADMA registration confirming ownership",
    },
    {
      source: "Investment returns — declared bank fixed deposits",
      annualAed: 140000,
      verifiable: true,
      documentRequired: "Bank deposit certificates, interest statements for review period",
    },
  ],
  assetsSummary: [
    {
      asset: "Dubai Marina apartment — 3-bedroom, purchased 2021",
      valueAed: 3500000,
      acquisitionSource: "Declared as personal savings accumulated pre-employment at Ministry",
      verifiable: false,
    },
    {
      asset: "Abu Dhabi villa — 5-bedroom, purchased 2019",
      valueAed: 2200000,
      acquisitionSource: "Declared as inheritance from father (estate not probated in UAE courts)",
      verifiable: false,
    },
    {
      asset: "Luxury vehicle — Range Rover Sport 2023",
      valueAed: 320000,
      acquisitionSource: "Declared as personal savings",
      verifiable: false,
    },
    {
      asset: "Financial investments — UAE equities portfolio",
      valueAed: 180000,
      acquisitionSource: "Declared as accumulated savings",
      verifiable: true,
    },
  ],
  redFlags: [
    "Total asset value of AED 6,200,000 is inconsistent with 7-year cumulative government salary of AED 2,940,000 — gap of AED 3,260,000 before personal expenditures",
    "Dubai Marina property purchased at AED 3,500,000 in 2021 — subject had been in current role only 2 years; declared savings insufficient to fund this acquisition",
    "Inheritance claim for AED 2,200,000 Abu Dhabi villa is undocumented — no probate, no estate valuation, no transfer documentation",
    "Subject is Director General with oversight of public procurement — elevated bribery/kickback risk per UNCAC Art.15-16 and UAE Federal Law 6/2023",
    "No declared foreign bank accounts despite multiple international travel stamps in passport — potential undisclosed offshore assets",
    "Lifestyle consistent with wealth significantly exceeding declared income — membership of exclusive clubs, private school fees estimated AED 120,000/year not reflected in income",
  ],
  requiredDocumentation: [
    "Certified payslips and employment contracts for full review period (7 years)",
    "Full bank statements for all accounts (UAE and international) for review period",
    "Property purchase documentation for both real estate assets (SPAs, payment records, mortgage records if applicable)",
    "Father's estate documentation — will, court-issued probate, asset transfer records",
    "Tax returns or equivalent wealth disclosure from any prior non-UAE jurisdiction",
    "Signed declaration of all assets (UAE and worldwide) and liabilities",
    "Explanation and supporting evidence for AED 3,200,000 unexplained wealth gap",
    "Documentation of any business interests, investments, or income sources not previously disclosed",
    "School fees and other significant expenditure confirmation",
  ],
  illicitEnrichmentRisk: true,
  regulatoryBasis: "UNCAC Art.20 (illicit enrichment — unexplained increase in assets of public official); UAE Federal Law 6/2023 (Anti-Corruption); UAE FDL 10/2025 Art.14 (EDD for PEPs); FATF R.12 (PEP SOW/SOF); CBUAE AML/CFT Guidelines §5 (PEP enhanced measures)",
  recommendation: "CRITICAL — Illicit enrichment risk identified. Unexplained wealth gap of AED 3,200,000 (52% of total assets) for a government official in a procurement-oversight role is consistent with UNCAC Art.20 illicit enrichment indicators. MLRO must: (1) Escalate to senior management immediately; (2) Issue comprehensive SOW documentation request with 14-day response deadline; (3) If subject fails to provide satisfactory explanation, file STR via goAML; (4) Consider whether UAE Attorney General referral is appropriate under FDL 10/2025. Do NOT exit relationship without MLRO sign-off — exits without notification may constitute obstruction.",
};

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
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1450,
      system: [
        {
          type: "text",
          text: `You are a UAE source of wealth (SOW) and source of funds (SOF) specialist with expertise in PEP wealth reconciliation, UNCAC Article 20 illicit enrichment analysis, and UAE FDL 10/2025 EDD requirements. Analyse declared income streams and assets to identify unexplained wealth gaps, illicit enrichment risk, and documentation deficiencies. Calculate total declared income vs total declared assets and quantify unexplained wealth in AED. Identify specific red flags and required documentation. Apply FATF R.12 PEP SOW/SOF standards. Respond ONLY with valid JSON matching the SowCalculatorResult interface — no markdown fences.`,
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
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "sow-calculator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
