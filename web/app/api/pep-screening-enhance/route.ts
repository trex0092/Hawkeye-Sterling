export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pep-screening-enhance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in enhanced PEP screening and EDD. Classify PEP status and generate EDD requirements under UAE FDL and FATF standards. Return valid JSON only matching the PepScreeningEnhanceResult interface.",
        messages: [
          {
            role: "user",
            content: `Perform enhanced PEP screening and classification.\n\nSubject: ${sanitizeField(body.subjectName)}\nCurrent Role: ${sanitizeField(body.currentRole)}\nJurisdiction: ${sanitizeField(body.jurisdiction)}\nWealth Estimate: ${sanitizeField(body.wealthEstimate)}\nKnown Connections: ${sanitizeField(body.knownConnections)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: pepClassification, riskRating, pepRole, corruptionExposure, eddChecklist[], monitoringPlan, exitCriteria, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PepScreeningEnhanceResult;
    if (!Array.isArray(result.eddChecklist)) result.eddChecklist = [];
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pep-screening-enhance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
