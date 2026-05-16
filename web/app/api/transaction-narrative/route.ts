export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

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

const FALLBACK: TransactionAnalysis = {
  typology: "Layering — cross-border wire structuring",
  typologyFatfRef: "FATF R.20, UAE FDL 10/2025 Art.21",
  strRequired: true,
  strBasis: "Multiple cross-border wires below AED 55,000 threshold — structuring pattern consistent with layering.",
  strDeadline: "2 business days from determination (FDL 10/2025 Art.26)",
  riskVerdict: "high",
  redFlags: [
    { indicator: "Structured transactions below reporting threshold", severity: "high", fatfRef: "FATF R.20 §4" },
    { indicator: "Cross-border wires to CAHRA jurisdiction", severity: "critical", fatfRef: "FATF R.19" },
    { indicator: "No apparent business rationale", severity: "high", fatfRef: "FATF R.10" },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "Pattern consistent with TBML layering; MLRO review required before STR determination.",
  regulatoryBasis: "UAE FDL 10/2025 Art.21(1)(b), Art.26; FATF R.20; Cabinet Resolution 134/2025",
  missingInformation: ["Ultimate beneficiary identity", "Source of funds documentation", "Business relationship purpose"],
  investigativeQuestions: [
    "What is the stated purpose of each wire transfer?",
    "Are there corresponding inbound flows from the same or related parties?",
    "Does the customer have a documented gold trading relationship that explains the volume?",
  ],
};

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
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Transaction Narrative / Alert Text:\n${narrative}${customerType ? `\n\nCustomer Type: ${customerType}` : ""}${jurisdiction ? `\nJurisdiction: ${jurisdiction}` : ""}${amounts ? `\nAmount Details: ${amounts}` : ""}`,
        }],
      });


    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as TransactionAnalysis;
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.missingInformation)) result.missingInformation = [];
    if (!Array.isArray(result.investigativeQuestions)) result.investigativeQuestions = [];
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "transaction-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
