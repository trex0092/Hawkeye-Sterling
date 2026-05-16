export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
const FALLBACK = {
  ok: true,
  riskTier: "high",
  fatfCompliance: "VASP appears partially compliant with FATF R.15/16 requirements. Travel rule implementation is incomplete for cross-border transfers above USD 1,000. VARA licensing status could not be confirmed from the data provided.",
  travelRuleStatus: "Non-compliant — travel rule data (originator/beneficiary) not transmitted for transfers above threshold. Risk of correspondent de-risking if not remediated within 90 days.",
  redFlags: [
    "No confirmed VARA or equivalent licence in stated jurisdiction",
    "DeFi exposure without adequate counterparty identification",
    "High monthly volumes inconsistent with stated customer base",
    "Jurisdiction flagged on FATF grey list or equivalent",
  ],
  recommendation: "Apply enhanced CDD before onboarding. Obtain VARA licence confirmation, travel rule policy documentation, and AML programme evidence. Consider declining if travel rule non-compliance cannot be resolved.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { vasp?: string; jurisdiction?: string; products?: string[]; volumes?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers }); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "virtual-asset-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: `You are a VASP/virtual asset AML specialist with expertise in FATF Recommendations 15 and 16, UAE VARA regulations, and crypto AML typologies. Assess the Virtual Asset Service Provider risk and return ONLY valid JSON (no markdown) with this exact structure:
{
  "ok": true,
  "riskTier": "critical"|"high"|"medium"|"low",
  "fatfCompliance": "string — FATF R.15/16 compliance narrative",
  "travelRuleStatus": "string — travel rule compliance assessment",
  "redFlags": ["string"],
  "recommendation": "string — actionable recommendation"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `VASP Name: ${sanitizeField(body.vasp) || "Unknown VASP"}
Jurisdiction: ${sanitizeField(body.jurisdiction) || "Not stated"}
Products/Services: ${(body.products ?? []).map((p) => sanitizeField(p)).join(", ") || "Not stated"}
Monthly Volume: ${sanitizeField(body.volumes) || "Not stated"}

Assess FATF R.15/R.16 compliance, travel rule status, DeFi exposure, mixer/tumbler connections, and overall VASP risk tier. Identify red flags and provide a compliance recommendation.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
    // Normalize arrays — LLM occasionally returns null instead of [].
    if (!Array.isArray(result["redFlags"])) result["redFlags"] = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "virtual-asset-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
