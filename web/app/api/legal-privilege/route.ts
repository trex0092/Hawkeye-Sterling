export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT legal expert specialising in legal professional privilege, tipping-off prohibition, and confidentiality obligations under UAE FDL 10/2025 Art.30. Analyse legal privilege and tipping-off scenarios and return a JSON object with exactly these fields: { "privilegeApplies": boolean, "tippingOffRisk": "high"|"medium"|"low", "disclosurePermitted": boolean, "safeProcedureSteps": string[], "legalCounselRequired": boolean, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following legal privilege and tipping-off scenario:
- Subject Type: ${body.subjectType}
- Communication Type: ${body.communicationType}
- Legal Relationship: ${body.legalRelationship}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as LegalPrivilegeResult;
    if (!Array.isArray(parsed.safeProcedureSteps)) parsed.safeProcedureSteps = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
