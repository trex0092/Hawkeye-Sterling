export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface TrustStructuresResult {
  opacityScore: number;
  riskRating: "critical" | "high" | "medium" | "low";
  uboIdentified: boolean;
  jurisdictionRisk: string;
  layersCount: number;
  structureRedFlags: string[];
  uboVerificationSteps: string[];
  regulatoryBasis: string;
}

const FALLBACK: TrustStructuresResult = {
  opacityScore: 82,
  riskRating: "critical",
  uboIdentified: false,
  jurisdictionRisk:
    "Cayman Islands trust with BVI corporate trustee — both jurisdictions rated high risk for opacity. No public UBO register. No regulatory access without MLA request.",
  layersCount: 4,
  structureRedFlags: [
    "Four-layer structure: Cayman trust → BVI corporate trustee → Seychelles holding company → UAE operating entity",
    "Protector identity unknown — not disclosed in trust deed",
    "Discretionary trust — no fixed beneficiaries, MLRO cannot identify natural persons",
    "Trust established 3 months before large gold purchase — suspicious timing",
    "Letter of wishes held by unknown third party in Geneva",
  ],
  uboVerificationSteps: [
    "Request certified copy of full trust deed including all schedules and amendments",
    "Identify and verify all trustees, protectors, settlors, and potential beneficiaries",
    "Obtain signed UBO declaration from trustee with supporting evidence",
    "Commission independent legal opinion in Cayman on disclosure obligations",
    "If UBO cannot be confirmed: decline to onboard under FDL 10/2025 Art.7(3)",
  ],
  regulatoryBasis:
    "UAE FDL 10/2025 Art.7 (UBO), FATF R.25 (legal arrangements), Cabinet Resolution 132/2023 (UBO register), CBUAE AML Standards §3.5",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName: string;
    structureType: string;
    jurisdictions: string;
    layerCount: string;
    purposeStated: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "trust-structures temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in complex trust and legal arrangement risk assessment under FATF R.25 and UAE FDL 10/2025 Art.7. Analyse trust/legal structures and return a JSON object with exactly these fields: { "opacityScore": number (0-100), "riskRating": "critical"|"high"|"medium"|"low", "uboIdentified": boolean, "jurisdictionRisk": string, "layersCount": number, "structureRedFlags": string[], "uboVerificationSteps": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following trust/legal structure:
- Entity Name: ${sanitizeField(body.entityName)}
- Structure Type: ${sanitizeField(body.structureType)}
- Jurisdictions: ${sanitizeField(body.jurisdictions)}
- Number of Layers: ${sanitizeField(body.layerCount)}
- Stated Purpose: ${sanitizeText(body.purposeStated)}
- Additional Context: ${sanitizeText(body.context)}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "trust-structures temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

    const parsed = JSON.parse(jsonMatch[0]) as TrustStructuresResult;
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "trust-structures temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
