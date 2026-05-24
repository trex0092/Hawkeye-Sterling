export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface MlScenarioResult {
  scenarioTitle: string;
  predicate: string;
  placement: string;
  layering: string;
  integration: string;
  totalAmountAed: number;
  keyVehicles: string[];
  redFlagSummary: string[];
  typologyCode: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    predicateOffence: string;
    estimatedAmount: string;
    jurisdictions: string;
    sectors: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT financial intelligence expert specialising in money laundering typology analysis under FATF standards and UAE FDL 10/2025. Construct detailed money laundering scenario analyses and return a JSON object with exactly these fields: { "scenarioTitle": string, "predicate": string, "placement": string, "layering": string, "integration": string, "totalAmountAed": number, "keyVehicles": string[], "redFlagSummary": string[], "typologyCode": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Construct a detailed money laundering scenario analysis for the following case:
- Subject Name: ${sanitizeField(body.subjectName, 200)}
- Predicate Offence: ${sanitizeField(body.predicateOffence, 200)}
- Estimated Amount: ${sanitizeField(body.estimatedAmount, 50)}
- Jurisdictions: ${sanitizeField(body.jurisdictions, 200)}
- Sectors Involved: ${body.sectors}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as MlScenarioResult;
    if (!Array.isArray(parsed.keyVehicles)) parsed.keyVehicles = [];
    if (!Array.isArray(parsed.redFlagSummary)) parsed.redFlagSummary = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
