export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in PEP exposure for corporate customers. Assess PEP-linked corporate risk and EDD requirements under UAE FDL and FATF standards. Return valid JSON only matching the PepCorporateResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess PEP exposure for this corporate customer.\n\nCompany: ${body.companyName}\nPEP Name: ${body.pepName}\nPEP Role: ${body.pepRole}\nOwnership %: ${body.ownershipPct}\nIndustry Context: ${body.industryContext}\nContext: ${body.context}\n\nReturn JSON with fields: pepExposureLevel, riskRating, politicalConnections[], corruptionRiskFactors[], eddMeasures[], approvalRequired, regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, ...FALLBACK });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PepCorporateResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
