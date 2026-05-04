export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: MlScenarioResult = {
  scenarioTitle:
    "Gold-backed trade-based money laundering via DPMS sector",
  predicate:
    "Proceeds of corruption — senior official (PEP-1) received AED 12.5M in illicit payments from government contractor in exchange for inflated procurement contracts. Funds initially held in nominee accounts in jurisdiction with weak AML controls.",
  placement:
    "AED 3.2M introduced into UAE financial system via structured DPMS gold purchases across 4 dealers, each transaction below AED 55,000 MoE reporting threshold. Payment by cash and bank transfer from three different accounts in names of family members.",
  layering:
    "Physical gold converted to gold-backed trade finance instruments. Over-invoiced 'gold refining services' routed through DMCC free zone entity to Swiss counter-party. Wire transfers total AED 6.8M passed through 3 jurisdictions (UAE → Switzerland → Singapore). BVI holding company used as intermediate vehicle.",
  integration:
    "Proceeds re-invested into Dubai freehold property (2 apartments, Jumeirah Lakes Towers) in nominee name. Rental income provides legitimate ongoing income stream. Residual AED 2.5M held in VASP accounts across 3 crypto exchanges as Bitcoin.",
  totalAmountAed: 12500000,
  keyVehicles: [
    "DPMS sector (gold purchase)",
    "DMCC free zone entity",
    "BVI holding company",
    "UAE freehold property",
    "Crypto VASP",
  ],
  redFlagSummary: [
    "Structured DPMS purchases below AED 55K threshold across multiple dealers",
    "PEP beneficial owner concealed behind nominee arrangement",
    "Over-invoiced international trade finance transactions",
    "Multi-jurisdiction layering via professional intermediaries",
    "Investment in high-value real estate without mortgage",
  ],
  typologyCode: "TBML-DPMS-RE-PEP",
  regulatoryBasis:
    "FATF R.1/R.3 (risk assessment), UAE FDL 10/2025, LBMA RGG Step-4, MoE Circular 2/2024, FATF Typologies Report 2023",
};

export async function POST(req: Request) {
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
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
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
- Subject Name: ${body.subjectName}
- Predicate Offence: ${body.predicateOffence}
- Estimated Amount: ${body.estimatedAmount}
- Jurisdictions: ${body.jurisdictions}
- Sectors Involved: ${body.sectors}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as MlScenarioResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "ml-scenario temporarily unavailable - please retry." }, { status: 503 });
  }
}
