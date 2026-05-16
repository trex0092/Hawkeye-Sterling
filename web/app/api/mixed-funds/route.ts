export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface MixedFundsResult {
  taintPercentage: number;
  taintRating: "critical" | "high" | "medium" | "low";
  taintedAmount: number;
  cleanAmount: number;
  tracingMethod: "FIFO" | "proportional" | "lowest_intermediate_balance";
  legalAnalysis: string;
  confiscationRisk: boolean;
  evidenceStrength: "strong" | "moderate" | "weak";
  investigativeSteps: string[];
  regulatoryBasis: string;
}

const FALLBACK: MixedFundsResult = {
  taintPercentage: 47,
  taintRating: "high",
  taintedAmount: 2350000,
  cleanAmount: 2650000,
  tracingMethod: "proportional",
  legalAnalysis:
    "Applying the proportionality method under UAE FDL 10/2025 Art.26 tracing principles, AED 2.35M of the AED 5M pooled account balance is attributable to proceeds of the predicate offence. The FIFO method would yield a higher taint estimate (61%); courts typically accept the method most favourable to the prosecution unless clean funds were demonstrably deposited first.",
  confiscationRisk: true,
  evidenceStrength: "moderate",
  investigativeSteps: [
    "Obtain complete account statements for the full layering period",
    "Forensic accountant engagement to reconstruct fund flows",
    "Identify and segregate legitimate business income streams",
    "Prepare confiscation schedule for CBUAE/Public Prosecutor",
  ],
  regulatoryBasis:
    "UAE FDL 10/2025 Art.26 (tracing), FATF R.4 (confiscation), UAE AML Law Art.2",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    accountHolder: string;
    totalBalance: string;
    suspectedProceedsAmount: string;
    legitimateFundsAmount: string;
    mixingPeriod: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "mixed-funds temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT forensic finance expert specialising in mixed funds tracing under UAE FDL 10/2025 Art.26 and FATF R.4. Analyse mixed funds scenarios and return a JSON object with exactly these fields: { "taintPercentage": number (0-100), "taintRating": "critical"|"high"|"medium"|"low", "taintedAmount": number, "cleanAmount": number, "tracingMethod": "FIFO"|"proportional"|"lowest_intermediate_balance", "legalAnalysis": string, "confiscationRisk": boolean, "evidenceStrength": "strong"|"moderate"|"weak", "investigativeSteps": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following mixed funds scenario:
- Account Holder: ${body.accountHolder}
- Total Balance: ${body.totalBalance}
- Suspected Proceeds Amount: ${body.suspectedProceedsAmount}
- Legitimate Funds Amount: ${body.legitimateFundsAmount}
- Mixing Period: ${body.mixingPeriod}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "mixed-funds temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as MixedFundsResult;
    if (!Array.isArray(parsed.investigativeSteps)) parsed.investigativeSteps = [];
    return NextResponse.json({ ok: true, ...parsed , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "mixed-funds temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
