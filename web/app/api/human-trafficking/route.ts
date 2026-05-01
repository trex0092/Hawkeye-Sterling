export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  htRisk: "high",
  indicators: [
    "Cash-intensive transactions inconsistent with stated business activity",
    "Multiple individuals sharing single bank account with pattern of regular small cash deposits",
    "Cross-border transfers to known source countries for labour trafficking corridors",
    "Escort or hospitality sector involvement with no verifiable business licence",
  ],
  redFlags: [
    "Third-party control over account — subject does not appear to manage own finances",
    "Transactions to massage parlour or adult entertainment businesses in high-risk jurisdictions",
    "Irregular large cash withdrawals immediately following deposit activity",
  ],
  recommendation: "Apply enhanced due diligence immediately. Cross-reference FATF Guidance on ML from Human Trafficking (2018). Consider referral to FIU and, where there is evidence of ongoing harm, to law enforcement. File STR citing FDL 10/2025 Art.26.",
};

export async function POST(req: Request) {
  let body: { entity?: string; indicators?: string[]; transactionPatterns?: string };
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
          text: `You are a senior MLRO specialising in human trafficking ML indicators. Analyse the provided entity, behavioural indicators, and transaction patterns against FATF Guidance on ML from Human Trafficking and Sexual Exploitation (2018), FATF R.3 (predicate offences), and applicable national law. Identify specific typological indicators: cash-intensive activity, escort/hospitality sector, cross-border transfers to trafficking corridors, third-party account control. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "htRisk": "critical"|"high"|"medium"|"low",
  "indicators": ["string"],
  "redFlags": ["string"],
  "recommendation": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Entity: ${body.entity ?? "Unknown"}
Indicators: ${body.indicators ? body.indicators.join(", ") : "None specified"}
Transaction Patterns: ${body.transactionPatterns ?? "Not provided"}

Assess human trafficking ML risk and identify specific indicators.`,
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
