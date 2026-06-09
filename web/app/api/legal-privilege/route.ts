export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface LegalPrivilegeResult {
  privilegeApplies: boolean;
  tippingOffRisk: "high" | "medium" | "low";
  disclosurePermitted: boolean;
  safeProcedureSteps: string[];
  legalCounselRequired: boolean;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectType: string;
    communicationType: string;
    context: string;
    legalRelationship: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT legal expert specialising in legal professional privilege, tipping-off prohibition, and confidentiality obligations under UAE Federal Decree-Law No. 10 of 2025 Art.30. Analyse legal privilege and tipping-off scenarios and return a JSON object with exactly these fields: { "privilegeApplies": boolean, "tippingOffRisk": "high"|"medium"|"low", "disclosurePermitted": boolean, "safeProcedureSteps": string[], "legalCounselRequired": boolean, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following legal privilege and tipping-off scenario:
- Subject Type: ${sanitizeField(body.subjectType, 100)}
- Communication Type: ${sanitizeField(body.communicationType, 100)}
- Legal Relationship: ${sanitizeField(body.legalRelationship, 200)}
- Additional Context: ${sanitizeText(body.context, 2000)}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as LegalPrivilegeResult;
    if (!Array.isArray(parsed.safeProcedureSteps)) parsed.safeProcedureSteps = [];
    void writeAuditChainEntry(
      { event: "legal_privilege_assessed", actor: gate.keyId, privilegeApplies: parsed.privilegeApplies, tippingOffRisk: parsed.tippingOffRisk, disclosurePermitted: parsed.disclosurePermitted },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
