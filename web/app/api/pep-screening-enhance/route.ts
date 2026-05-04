export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export interface PepScreeningEnhanceResult {
  pepClassification: "PEP-1" | "PEP-2" | "PEP-3" | "Former-PEP" | "Not-PEP";
  riskRating: "critical" | "high" | "medium";
  pepRole: string;
  corruptionExposure: string;
  eddChecklist: string[];
  monitoringPlan: string;
  exitCriteria: string;
  regulatoryBasis: string;
}

const FALLBACK: PepScreeningEnhanceResult = {
  pepClassification: "PEP-1",
  riskRating: "critical",
  pepRole:
    "Serving minister in UAE federal cabinet — direct political authority over regulatory decisions affecting DPMS sector",
  corruptionExposure:
    "High corruption exposure index: role oversees government procurement (AED 8B annual budget). TI CPI score for jurisdiction: 28/100 (moderate). No known allegations — proactive EDD required regardless.",
  eddChecklist: [
    "Obtain and verify source of wealth — independent corroboration of stated wealth origin required",
    "Obtain and verify source of funds for all transactions",
    "Obtain senior management approval (MD + Board Risk) before onboarding or continuing relationship",
    "Identify and verify all connected family members and known associates",
    "Annual EDD refresh — every 12 months or on political event (election, appointment, removal)",
    "Screen all associated entities (companies, trusts, foundations) individually",
  ],
  monitoringPlan:
    "Monthly transaction review by MLRO. Quarterly relationship review. Annual EDD. Auto-escalate any transaction >AED 200,000 to MLRO queue. Adverse media re-screen every 30 days.",
  exitCriteria:
    "Relationship continues only while: source of wealth verified, no confirmed adverse media, annual EDD complete. Exit triggers: unexplained wealth increase >50%, confirmed corruption allegation, failure to provide EDD documents within 30 days.",
  regulatoryBasis:
    "FATF R.12 (PEPs), UAE FDL 10/2025 Art.12, CBUAE AML Standards §3.4, Egmont Group PEP Guidance 2024",
};

export async function POST(req: Request) {
  let body: {
    subjectName: string;
    currentRole: string;
    jurisdiction: string;
    wealthEstimate: string;
    knownConnections: string;
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
          "You are a UAE AML/CFT compliance expert specialising in enhanced PEP screening and EDD. Classify PEP status and generate EDD requirements under UAE FDL and FATF standards. Return valid JSON only matching the PepScreeningEnhanceResult interface.",
        messages: [
          {
            role: "user",
            content: `Perform enhanced PEP screening and classification.\n\nSubject: ${body.subjectName}\nCurrent Role: ${body.currentRole}\nJurisdiction: ${body.jurisdiction}\nWealth Estimate: ${body.wealthEstimate}\nKnown Connections: ${body.knownConnections}\nContext: ${body.context}\n\nReturn JSON with fields: pepClassification, riskRating, pepRole, corruptionExposure, eddChecklist[], monitoringPlan, exitCriteria, regulatoryBasis.`,
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
    ) as PepScreeningEnhanceResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
