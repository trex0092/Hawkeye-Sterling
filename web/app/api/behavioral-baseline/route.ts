import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  entityType: string;
  industry: string;
  jurisdiction: string;
  riskScore: number;
}

const HIGH_RISK_JURISDICTIONS = ["BVI", "Cayman Islands", "Panama", "Seychelles", "Vanuatu", "Marshall Islands"];
const HIGH_RISK_INDUSTRIES = ["crypto", "gambling", "gaming", "money services", "cash intensive", "precious metals", "real estate"];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const { entityType, industry, jurisdiction, riskScore } = body;
  if (!entityType || !industry || !jurisdiction) {
    return NextResponse.json({ ok: false, error: "entityType, industry, and jurisdiction are required" }, { status: 400 , headers: gate.headers});
  }

  const jurisRisk = HIGH_RISK_JURISDICTIONS.some(j => jurisdiction.toLowerCase().includes(j.toLowerCase()));
  const indRisk = HIGH_RISK_INDUSTRIES.some(i => industry.toLowerCase().includes(i.toLowerCase()));

  const baseline: Record<string, unknown> = {
    expectedTransactionFrequency: indRisk ? "high" : "moderate",
    expectedCounterpartyCount: entityType === "individual" ? "5-20" : "20-200",
    expectedCashUsage: indRisk ? "elevated" : "low",
    expectedCrossJurisdictional: jurisRisk ? "high" : "low",
    typicalDocumentationLevel: entityType === "corporate" ? "full" : "partial",
    expectedRiskBand: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
  };

  const deviations: string[] = [];
  if (riskScore > 80 && !jurisRisk) deviations.push("Risk score elevated beyond jurisdiction-expected baseline");
  if (riskScore > 70 && !indRisk) deviations.push("Risk score inconsistent with industry peer group");
  if (jurisRisk && riskScore < 30) deviations.push("Unusually low risk score for high-risk jurisdiction — verify data completeness");

  const anomalyScore = Math.min(100, deviations.length * 25 + (Math.abs(riskScore - 50) / 2));

  const peerComparison = `${entityType} entities in ${industry} (${jurisdiction}) typically score ${
    indRisk && jurisRisk ? "65-85" : indRisk || jurisRisk ? "45-65" : "25-45"
  } on risk assessment. Subject score of ${riskScore} is ${
    riskScore > (indRisk || jurisRisk ? 65 : 45) ? "above" : "within or below"
  } peer range.`;

  return NextResponse.json({
    ok: true,
    baseline,
    deviations,
    anomalyScore,
    peerComparison,
  });
}
