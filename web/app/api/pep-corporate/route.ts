export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PepCorporateResult {
  pepExposureLevel: "direct" | "indirect" | "none";
  riskRating: "critical" | "high" | "medium" | "low";
  politicalConnections: string[];
  corruptionRiskFactors: string[];
  eddMeasures: string[];
  approvalRequired: string;
  regulatoryBasis: string;
}

const FALLBACK: PepCorporateResult = {
  pepExposureLevel: "indirect",
  riskRating: "high",
  politicalConnections: [
    "Company 40% owned by entity whose UBO is a serving Cabinet minister (PEP-1)",
    "CEO is son of former Central Bank Governor — PEP-2 (family member within 1st degree)",
    "Government entity holds golden share — political influence over corporate decisions",
    "Company awarded 3 government contracts totalling AED 180M in past 24 months",
  ],
  corruptionRiskFactors: [
    "Award of government contracts without public tender process documented",
    "PEP family member receives consulting fees from company — potential conflict",
    "Company incorporated in same month that PEP assumed office — suspicious timing",
    "Cash dividends paid to PEP-linked entity exceed stated business income",
  ],
  eddMeasures: [
    "Senior management approval required before onboarding (FDL Art.12(2))",
    "Source of wealth and funds for all PEP-connected shareholders",
    "Annual EDD refresh — every 12 months or on political event",
    "Transaction monitoring with lower thresholds — flag all transactions >AED 50,000",
    "Public procurement contract review — verify tender process compliance",
  ],
  approvalRequired:
    "Managing Director and Board Risk Committee sign-off required. Cannot be approved by MLRO alone — FDL Art.12(2) explicit requirement.",
  regulatoryBasis:
    "FATF R.12 (PEPs), UAE FDL 10/2025 Art.12, CBUAE AML Standards §3.4 (PEP), Transparency International CPI context",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    companyName: string;
    pepName: string;
    pepRole: string;
    ownershipPct: string;
    industryContext: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pep-corporate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in PEP exposure for corporate customers. Assess PEP-linked corporate risk and EDD requirements under UAE FDL and FATF standards. Return valid JSON only matching the PepCorporateResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess PEP exposure for this corporate customer.\n\nCompany: ${sanitizeField(body.companyName)}\nPEP Name: ${sanitizeField(body.pepName)}\nPEP Role: ${sanitizeField(body.pepRole)}\nOwnership %: ${sanitizeField(body.ownershipPct)}\nIndustry Context: ${sanitizeField(body.industryContext)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: pepExposureLevel, riskRating, politicalConnections[], corruptionRiskFactors[], eddMeasures[], approvalRequired, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PepCorporateResult;
    if (!Array.isArray(result.politicalConnections)) result.politicalConnections = [];
    if (!Array.isArray(result.corruptionRiskFactors)) result.corruptionRiskFactors = [];
    if (!Array.isArray(result.eddMeasures)) result.eddMeasures = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pep-corporate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
