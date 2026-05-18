export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface GhostCompanyResult {
  ghostRisk: "critical" | "high" | "medium" | "low";
  ghostScore: number;
  indicators: string[];
  economicSubstanceGaps: string[];
  verificationSteps: string[];
  recommendedAction: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    companyName: string;
    incorporationDate: string;
    tradeActivity: string;
    employeeCount: string;
    physicalAddress: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ghost-company temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in shell and ghost company detection. Assess economic substance and ghost company indicators under UAE regulations and FATF standards. Return valid JSON only matching the GhostCompanyResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess ghost/shell company risk for this entity.\n\nCompany: ${sanitizeField(body.companyName)}\nIncorporation Date: ${sanitizeField(body.incorporationDate)}\nTrade Activity: ${sanitizeField(body.tradeActivity)}\nEmployee Count: ${sanitizeField(body.employeeCount)}\nPhysical Address: ${sanitizeField(body.physicalAddress)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: ghostRisk, ghostScore (0-100), indicators[], economicSubstanceGaps[], verificationSteps[], recommendedAction, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as GhostCompanyResult;
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.economicSubstanceGaps)) result.economicSubstanceGaps = [];
    if (!Array.isArray(result.verificationSteps)) result.verificationSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ghost-company temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
