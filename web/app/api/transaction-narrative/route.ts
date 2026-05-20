export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface TransactionAnalysis {
  typology: string;
  typologyFatfRef: string;
  strRequired: boolean;
  strBasis: string;
  strDeadline: string;
  riskVerdict: "critical" | "high" | "medium" | "low" | "clear";
  redFlags: Array<{ indicator: string; severity: "critical" | "high" | "medium"; fatfRef: string }>;
  recommendedAction: "file_str" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  regulatoryBasis: string;
  missingInformation: string[];
  investigativeQuestions: string[];
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { narrative: string; customerType?: string; jurisdiction?: string; amounts?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  const { narrative, customerType, jurisdiction, amounts } = body;
  if (!narrative?.trim()) {
    return NextResponse.json({ ok: false, error: "narrative required" }, { status: 400 , headers: gate.headers });
  }

  const safeNarrative = sanitizeText(narrative, 5000);
  const safeCustomerType = sanitizeField(customerType, 100);
  const safeJurisdiction = sanitizeField(jurisdiction, 100);
  const safeAmounts = sanitizeField(amounts, 200);

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "transaction-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  const systemPrompt = `You are a senior UAE AML/CFT analyst specialising in DPMS, gold trading, and transaction monitoring. You receive raw transaction narratives or monitoring alert text and produce a structured AML analysis.

Your analysis must be grounded in:
- UAE FDL 10/2025 (AML Law) and Cabinet Resolution 134/2025
- FATF 40 Recommendations — especially R.10, R.12, R.15, R.16, R.19, R.20, R.21, R.29
- UAE FIU goAML STR filing standards
- EOCN sanctions regime
- UAE DPMS/VASP MoE reporting obligations
- LBMA Responsible Gold / OECD CAHRA 5-step typologies for gold sector

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "typology": "<ML/TF typology name>",
  "typologyFatfRef": "<FATF/FDL citation>",
  "strRequired": <true|false>,
  "strBasis": "<one-sentence basis for STR determination>",
  "strDeadline": "<deadline per FDL 10/2025>",
  "riskVerdict": "critical"|"high"|"medium"|"low"|"clear",
  "redFlags": [{"indicator": "<flag>", "severity": "critical"|"high"|"medium", "fatfRef": "<ref>"}],
  "recommendedAction": "file_str"|"escalate_mlro"|"enhanced_dd"|"monitor"|"clear",
  "actionRationale": "<one-paragraph rationale>",
  "regulatoryBasis": "<full citation string>",
  "missingInformation": ["<item>"],
  "investigativeQuestions": ["<question>"]
}`;

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Transaction Narrative / Alert Text:\n${safeNarrative}${safeCustomerType ? `\n\nCustomer Type: ${safeCustomerType}` : ""}${safeJurisdiction ? `\nJurisdiction: ${safeJurisdiction}` : ""}${safeAmounts ? `\nAmount Details: ${safeAmounts}` : ""}`,
        }],
      });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as TransactionAnalysis;
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.missingInformation)) result.missingInformation = [];
    if (!Array.isArray(result.investigativeQuestions)) result.investigativeQuestions = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "transaction-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
