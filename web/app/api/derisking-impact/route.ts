export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface DerisiskingImpactResult {
  justificationStrength: "strong" | "moderate" | "weak";
  fatfConformant: boolean;
  affectedCustomerCount: number;
  reputationalRisk: "high" | "medium" | "low";
  alternativesMitigants: string[];
  exitProcessRequirements: string[];
  documentationRequired: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerSegment: string;
    affectedCount: string;
    riskJustification: string;
    institutionType: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in de-risking impact assessment under FATF guidance (2021) and UAE FDL 10/2025. Assess de-risking decisions and return a JSON object with exactly these fields: { "justificationStrength": "strong"|"moderate"|"weak", "fatfConformant": boolean, "affectedCustomerCount": number, "reputationalRisk": "high"|"medium"|"low", "alternativesMitigants": string[], "exitProcessRequirements": string[], "documentationRequired": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following de-risking decision:
- Customer Segment: ${sanitizeField(body.customerSegment, 200)}
- Affected Customer Count: ${sanitizeField(body.affectedCount, 50)}
- Risk Justification: ${sanitizeText(body.riskJustification, 2000)}
- Institution Type: ${sanitizeField(body.institutionType, 100)}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as DerisiskingImpactResult;
    if (!Array.isArray(parsed.alternativesMitigants)) parsed.alternativesMitigants = [];
    if (!Array.isArray(parsed.exitProcessRequirements)) parsed.exitProcessRequirements = [];
    if (!Array.isArray(parsed.documentationRequired)) parsed.documentationRequired = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
