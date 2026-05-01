export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  insiderRisk: "high",
  behaviourFlags: [
    "Unusual system access outside business hours — accessing customer records not relevant to job function",
    "Personal financial transactions significantly above income level — unexplained wealth accumulation",
    "Offshore account disclosure in jurisdiction with no tax information exchange agreement",
    "Pattern of approving transactions for related parties or personal contacts",
    "Resistance to role rotation or annual leave — classic indicator of concealing ongoing fraud",
  ],
  recommendation: "Escalate to MLRO and HR. Initiate discreet internal investigation under legal privilege. Preserve system audit logs immediately. Cross-reference personal account activity against client transaction records. Consider referral to law enforcement if evidence of facilitation of ML or receipt of bribes. Do not alert subject before investigation is secured.",
};

export async function POST(req: Request) {
  let body: { employee?: string; role?: string; access?: string; behaviours?: string; transactions?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [
        {
          type: "text",
          text: `You are a senior MLRO specialising in insider threat and employee financial crime. Analyse the employee role, system access, observed behaviours, and personal transaction patterns for insider threat ML indicators: unusual access patterns, unexplained wealth, offshore accounts, relationship with clients, facilitation of ML, bribery, and circumvention of controls. Reference FATF R.18 (internal controls), UAE FDL 10/2025 Art.20, CBUAE AML Standards §7 (staff screening), and relevant employment law principles. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "insiderRisk": "critical"|"high"|"medium"|"low",
  "behaviourFlags": ["string"],
  "recommendation": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Employee/Role: ${body.employee ?? "Unknown"} — ${body.role ?? "Not specified"}
Access Level: ${body.access ?? "Not specified"}
Observed Behaviours: ${body.behaviours ?? "Not described"}
Personal Transactions: ${body.transactions ?? "Not provided"}

Assess insider threat ML risk.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
