export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface FreezeSeizureResult {
  legalBasis: string;
  eligibleAssets: string[];
  freezeOrderDraft: string;
  procedureSteps: string[];
  timeConstraints: string;
  internationalCooperation: boolean;
  mutualLegalAssistance: boolean;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    assetDescription: string;
    legalBasisCited: string;
    estimatedValue: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT legal expert specialising in asset freezing and seizure procedures under UAE FDL 10/2025 and FATF standards. Analyse asset freeze/seizure scenarios and return a JSON object with exactly these fields: { "legalBasis": string, "eligibleAssets": string[], "freezeOrderDraft": string, "procedureSteps": string[], "timeConstraints": string, "internationalCooperation": boolean, "mutualLegalAssistance": boolean, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following asset freeze/seizure scenario:
- Subject Name: ${sanitizeField(body.subjectName, 200)}
- Asset Description: ${sanitizeText(body.assetDescription, 1000)}
- Legal Basis Cited: ${sanitizeField(body.legalBasisCited, 300)}
- Estimated Value: ${sanitizeField(body.estimatedValue, 50)}
- Jurisdictions: ${body.jurisdictions}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as FreezeSeizureResult;
    if (!Array.isArray(parsed.eligibleAssets)) parsed.eligibleAssets = [];
    if (!Array.isArray(parsed.procedureSteps)) parsed.procedureSteps = [];
    void writeAuditChainEntry(
      { event: "freeze_seizure_assessed", actor: gate.keyId, internationalCooperation: parsed.internationalCooperation, mutualLegalAssistance: parsed.mutualLegalAssistance, eligibleAssetCount: parsed.eligibleAssets.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
