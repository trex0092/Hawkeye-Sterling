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
  chapters: ["PEP Enhanced Due Diligence (FATF R.12)", "Shell Company / Complex Structure (FATF R.24/25)"],
  redFlags: [
    "Client unable to explain source of large cash deposits",
    "Transaction volume inconsistent with declared business turnover",
    "Use of multiple jurisdictions with no apparent commercial rationale",
  ],
  actions: [
    "1. Immediately freeze pending transactions and place account under enhanced review.",
    "2. Request source-of-funds documentation within 5 business days.",
    "3. Conduct adverse media screening across all identified entities and associates.",
    "4. Brief MLRO with preliminary findings and await determination to report.",
    "5. If documentation unsatisfactory, prepare STR and submit to goAML within 35 days of suspicion.",
  ],
  regulatoryRefs: [
    "UAE FDL 10/2025 Art.14 (STR obligation)",
    "UAE FDL 10/2025 Art.17 (PEP EDD)",
    "CBUAE AML Standards §4.3",
    "FATF R.12 (PEPs)",
    "FATF R.20 (Reporting of suspicious transactions)",
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
          text: `You are a senior UAE AML/CFT compliance expert and MLRO advisor. You specialise in UAE Federal Decree-Law 10/2025 (AML/CFT Law), CBUAE AML Standards, FATF Recommendations, and DPMS/DNFBP sector regulations. Your role is to analyse transaction scenarios and client behaviours to identify typologies, red flags, and required compliance actions.

When given a scenario, you must:
1. Identify which playbook chapter(s) apply from the list: Trade-Based Money Laundering (TBML), PEP Enhanced Due Diligence, Correspondent Banking, DPMS Retail, Proliferation Financing, Conflict Minerals, VASP/Virtual Asset, Shell Company/Complex Structure, Real Estate, Trade Finance, Wire Transfer, Digital Assets & NFT, Hawala/MSB, Bribery & Corruption, Human Trafficking, Tax Evasion.
2. List all red flags present in the scenario (specific, actionable observations).
3. Provide numbered step-by-step recommended actions (minimum 4 steps, maximum 8).
4. Cite specific regulatory articles from UAE FDL 10/2025, CBUAE AML Standards, or FATF Recommendations.
5. Give a single recommendation: "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO".
6. Set urgency: "immediate" (file within hours / freeze now), "24h" (action required within one business day), or "7d" (action within one week).

Return ONLY valid JSON with this exact structure (no markdown fences, no explanation outside JSON):
{
  "chapters": ["string"],
  "redFlags": ["string"],
  "actions": ["string"],
  "regulatoryRefs": ["string"],
  "recommendation": "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO",
  "urgency": "immediate" | "24h" | "7d"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following scenario and provide compliance guidance.

Client Type: ${body.clientType ?? "Unknown"}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Risk Level: ${body.riskLevel ?? "Medium"}

Scenario:
${body.scenario}

Identify all relevant playbook chapters, red flags, recommended actions, regulatory references, and provide a clear recommendation with urgency rating.`,
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
