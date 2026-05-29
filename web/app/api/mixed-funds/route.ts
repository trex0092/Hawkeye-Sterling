export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
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
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
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
- Account Holder: ${sanitizeField(body.accountHolder, 200)}
- Total Balance: ${sanitizeField(body.totalBalance, 50)}
- Suspected Proceeds Amount: ${sanitizeField(body.suspectedProceedsAmount, 50)}
- Legitimate Funds Amount: ${sanitizeField(body.legitimateFundsAmount, 50)}
- Mixing Period: ${body.mixingPeriod}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "mixed-funds temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as MixedFundsResult;
    if (!Array.isArray(parsed.investigativeSteps)) parsed.investigativeSteps = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "mixed-funds temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
