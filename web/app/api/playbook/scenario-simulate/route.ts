export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface ScenarioSimulateResult {
  chapters: string[];
  redFlags: string[];
  actions: string[];
  regulatoryRefs: string[];
  recommendation: "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO";
  urgency: "immediate" | "24h" | "7d";
}

const FALLBACK: ScenarioSimulateResult = {
  chapters: ["PEP Enhanced Due Diligence (FATF R.12)", "Wire Transfer Screening (FATF R.16)"],
  redFlags: [
    "Transaction inconsistent with declared business profile",
    "Funds routed through multiple jurisdictions without commercial rationale",
    "Client reluctant to provide source of funds documentation",
  ],
  actions: [
    "1. Freeze the transaction pending MLRO review — do not process until cleared.",
    "2. Obtain certified source-of-funds documentation from the client within 48 hours.",
    "3. Run comprehensive sanctions screening across OFAC, UN, EU, and EOCN lists.",
    "4. Perform adverse media search covering the past 5 years.",
    "5. Escalate to MLRO with a full case summary and supporting documentation.",
    "6. Await MLRO determination on whether to file an STR within the 35-day FDL deadline.",
  ],
  regulatoryRefs: [
    "UAE FDL 10/2025 Art.15 (STR obligation)",
    "UAE FDL 10/2025 Art.11 (CDD requirements)",
    "FATF R.16 (Wire transfer due diligence)",
    "CBUAE AML Standards §4.3 (EDD triggers)",
  ],
  recommendation: "Escalate to MLRO",
  urgency: "24h",
};

export async function POST(req: Request) {
  let body: {
    scenario?: string;
    clientType?: string;
    jurisdiction?: string;
    riskLevel?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scenario?.trim()) {
    return NextResponse.json({ error: "scenario is required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
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
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
