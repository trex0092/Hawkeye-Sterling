export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface HnwRiskResult {
  riskScore: number;
  riskRating: "critical" | "high" | "medium" | "low";
  wealthSourceVerified: boolean;
  wealthSourceGaps: string[];
  keyRiskFactors: string[];
  eddRequirements: string[];
  ongoingMonitoringPlan: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    nationality: string;
    wealthEstimateAed: string;
    wealthSources: string;
    pepStatus: string;
    jurisdictions: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in high-net-worth individual due diligence under FATF R.10, R.12, and UAE FDL 10/2025. Conduct EDD risk assessments and return a JSON object with exactly these fields: { "riskScore": number (0-100), "riskRating": "critical"|"high"|"medium"|"low", "wealthSourceVerified": boolean, "wealthSourceGaps": string[], "keyRiskFactors": string[], "eddRequirements": string[], "ongoingMonitoringPlan": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Conduct an EDD risk assessment for the following HNW individual:
- Subject Name: ${sanitizeField(body.subjectName, 200)}
- Nationality: ${sanitizeField(body.nationality, 100)}
- Wealth Estimate (AED): ${sanitizeField(body.wealthEstimateAed, 50)}
- Wealth Sources: ${sanitizeText(body.wealthSources, 1000)}
- PEP Status: ${body.pepStatus}
- Jurisdictions: ${body.jurisdictions}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as HnwRiskResult;
    if (!Array.isArray(parsed.wealthSourceGaps)) parsed.wealthSourceGaps = [];
    if (!Array.isArray(parsed.keyRiskFactors)) parsed.keyRiskFactors = [];
    if (!Array.isArray(parsed.eddRequirements)) parsed.eddRequirements = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
