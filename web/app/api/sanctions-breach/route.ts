export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface SanctionsBreachResult {
  breachSeverity: "critical" | "high" | "medium" | "low";
  voluntaryDisclosureRecommended: boolean;
  estimatedPenaltyRange: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  immediateActions: string[];
  disclosureDraft: string;
  regulatoryBasis: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    counterparty: string;
    transactionAmount: string;
    sanctionsList: string;
    discoveryDate: string;
    breachDuration: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sanctions-breach temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE sanctions compliance expert specialising in breach analysis, voluntary disclosure, and remediation under UAE sanctions law and OFAC/EU frameworks. Analyse sanctions breach scenarios and return a JSON object with exactly these fields: { "breachSeverity": "critical"|"high"|"medium"|"low", "voluntaryDisclosureRecommended": boolean, "estimatedPenaltyRange": string, "mitigatingFactors": string[], "aggravatingFactors": string[], "immediateActions": string[], "disclosureDraft": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following sanctions breach scenario:
- Counterparty: ${body.counterparty}
- Transaction Amount: ${body.transactionAmount}
- Sanctions List: ${body.sanctionsList}
- Discovery Date: ${body.discoveryDate}
- Breach Duration: ${body.breachDuration}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "sanctions-breach temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as SanctionsBreachResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "sanctions-breach temporarily unavailable - please retry." }, { status: 503 });
  }
}
