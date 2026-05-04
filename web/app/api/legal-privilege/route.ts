export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface LegalPrivilegeResult {
  privilegeApplies: boolean;
  tippingOffRisk: "high" | "medium" | "low";
  disclosurePermitted: boolean;
  safeProcedureSteps: string[];
  legalCounselRequired: boolean;
  regulatoryBasis: string;
}

const FALLBACK: LegalPrivilegeResult = {
  privilegeApplies: false,
  tippingOffRisk: "high",
  disclosurePermitted: true,
  safeProcedureSteps: [
    "Do NOT inform subject that an STR has been filed or is under consideration — tipping-off prohibition is absolute",
    "Legal professional privilege does NOT apply to transaction facilitation — only genuine legal advice",
    "Consult external AML legal counsel before any communication with subject regarding account restrictions",
    "If subject directly asks about account freeze, refer to 'routine compliance review' only — do not confirm or deny STR existence",
    "Document all internal communications about this decision with timestamps for audit trail",
    "STR must be filed regardless of legal relationship — no privilege exception for DPMS/DNFBP",
  ],
  legalCounselRequired: true,
  regulatoryBasis:
    "UAE FDL 10/2025 Art.30 (tipping-off), FATF Guidance on Legal Privilege (2013), UAE Legal Profession Law, CBUAE AML Standards §7.2 (confidentiality)",
};

export async function POST(req: Request) {
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
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
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
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as LegalPrivilegeResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "legal-privilege temporarily unavailable - please retry." }, { status: 503 });
  }
}
