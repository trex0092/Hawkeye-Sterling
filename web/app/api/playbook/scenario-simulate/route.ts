export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface ScenarioSimulateResult {
  chapters: string[];
  redFlags: string[];
  actions: string[];
  regulatoryRefs: string[];
  recommendation: "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO";
  urgency: "immediate" | "24h" | "7d";
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    scenario?: string;
    clientType?: string;
    jurisdiction?: string;
    riskLevel?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.scenario?.trim()) {
    return NextResponse.json({ error: "scenario is required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "playbook/scenario-simulate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML compliance expert with deep knowledge of UAE FDL 10/2025, CBUAE AML Standards, FATF Recommendations, LBMA Responsible Gold Guidance, and EOCN regulations. Your role is to analyse transaction scenarios or client behaviour descriptions and provide actionable AML guidance.

Available playbook chapters you may reference (use exact titles):
- Trade-Based Money Laundering (TBML)
- PEP Enhanced Due Diligence (FATF R.12)
- Correspondent Banking · Nested Relationship
- DPMS Retail (cash-intensive precious-metals)
- Proliferation Financing (FATF R.7 / UNSCR)
- Conflict Minerals — OECD 5-Step / EOCN
- VASP / Virtual-Asset Customer (FATF R.15)
- Shell Company / Complex Structure (FATF R.24/25)
- Real Estate & Property Transaction
- Trade Finance & Letters of Credit
- Wire Transfer Screening (FATF R.16)
- Digital Assets & NFT Transactions
- Hawala / Money Service Business (MSB)
- Bribery & Corruption (FCPA / UK Bribery Act)
- Human Trafficking & Modern Slavery
- Tax Evasion Red Flags
- Insider Threat & Internal Fraud
- Environmental Crime & Illegal Extraction
- High-Value Dealer (Non-Gold DPMS)

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "chapters": ["exact chapter title from the list above"],
  "redFlags": ["specific red flag present in the scenario"],
  "actions": ["1. First action step", "2. Second action step"],
  "regulatoryRefs": ["UAE FDL 10/2025 Art.X", "FATF R.XX", "CBUAE AML Standards §X.X"],
  "recommendation": "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO",
  "urgency": "immediate" | "24h" | "7d"
}

Guidelines:
- chapters: 1-3 most relevant playbook chapters (exact titles only)
- redFlags: 3-6 specific red flags identified in the scenario
- actions: 5-8 numbered step-by-step actions, specific and actionable
- regulatoryRefs: 3-5 specific regulatory citations with article/section numbers
- recommendation: single most appropriate action
- urgency: "immediate" if STR/freeze required now, "24h" if escalation needed today, "7d" if EDD can be completed within a week`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse this scenario and provide AML guidance:

Scenario: ${body.scenario}
Client Type: ${body.clientType ?? "Unknown"}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Risk Level: ${body.riskLevel ?? "Medium"}

Identify the relevant playbook chapters, red flags present, step-by-step recommended actions, specific regulatory citations, and determine the appropriate recommendation and urgency.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ScenarioSimulateResult;
    if (!Array.isArray(result.chapters)) result.chapters = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.actions)) result.actions = [];
    if (!Array.isArray(result.regulatoryRefs)) result.regulatoryRefs = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "playbook/scenario-simulate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
