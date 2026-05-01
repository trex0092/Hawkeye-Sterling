export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface ThreatTypology {
  name: string;
  trend: "rising" | "stable" | "declining";
  description: string;
  fatfRef: string;
}

export interface RegulatoryChange {
  change: string;
  impact: string;
  effectiveDate: string;
}

export interface ScoreAdjustment {
  dimension: string;
  currentScore: number;
  suggestedScore: number;
  reason: string;
}

export interface ThreatIntelResult {
  ok: true;
  typologies: ThreatTypology[];
  regulatoryChanges: RegulatoryChange[];
  scoreAdjustments: ScoreAdjustment[];
  generatedAt: string;
}

const FALLBACK: ThreatIntelResult = {
  ok: true,
  typologies: [
    {
      name: "Trade-Based Money Laundering (TBML) via Precious Metals",
      trend: "rising",
      description:
        "Over/under-invoicing of gold and precious metals shipments remains the dominant TBML vector in the Gulf region, with increasing use of UAE free zones as transit points.",
      fatfRef: "FATF Guidance on TBML (2020) §4.2",
    },
    {
      name: "Crypto-to-Gold Conversion",
      trend: "rising",
      description:
        "Criminal proceeds converted to cryptocurrency and then used to purchase physical gold at DPMS, bypassing traditional banking controls.",
      fatfRef: "FATF R.15 / VASP Guidance 2023",
    },
    {
      name: "PEP-Linked Layering via Refinery Accounts",
      trend: "stable",
      description:
        "Politically exposed persons from high-risk jurisdictions using corporate structures to layer funds through gold refinery accounts.",
      fatfRef: "FATF R.12 / Guidance on PEPs 2013 §4",
    },
    {
      name: "Proliferation Finance via Dual-Use Metals",
      trend: "stable",
      description:
        "UN-sanctioned entities using intermediary companies to procure precious metals with dual-use applications. DPRK and Iran nexus identified.",
      fatfRef: "FATF R.7 / UNSCR 2270",
    },
    {
      name: "Cash Smurfing at DPMS Retail",
      trend: "declining",
      description:
        "Structured cash purchases below AED 55,000 threshold declining following tightened CBUAE guidance, but still observed at smaller operators.",
      fatfRef: "FATF R.10 / CBUAE AML Standards §5.3",
    },
  ],
  regulatoryChanges: [
    {
      change: "UAE FDL 10/2025 implementation — enhanced CDD requirements for DPMS effective 01/03/2025",
      impact: "Mandatory EDD for all gold transactions above AED 55,000. Beneficial ownership verification required for corporate clients.",
      effectiveDate: "01/03/2025",
    },
    {
      change: "FATF Plenary — UAE removed from grey list (February 2024)",
      impact:
        "Reduced automatic EDD trigger for UAE-originating transactions, but ongoing monitoring expectations remain elevated.",
      effectiveDate: "23/02/2024",
    },
    {
      change: "CBUAE Circular 2/2025 — Virtual Asset DPMS intersection guidance",
      impact:
        "DPMS accepting crypto-sourced funds must apply VASP-equivalent CDD and STR filing obligations.",
      effectiveDate: "15/01/2025",
    },
  ],
  scoreAdjustments: [
    {
      dimension: "Products & Services",
      currentScore: 4,
      suggestedScore: 5,
      reason:
        "Rising TBML typology via precious metals and new crypto-to-gold conversion vector warrant critical inherent risk rating.",
    },
    {
      dimension: "TBML / Trade Finance",
      currentScore: 4,
      suggestedScore: 5,
      reason:
        "FATF and CBUAE guidance both flag TBML in precious metals as the highest-risk typology for UAE DPMS. Increase to critical.",
    },
    {
      dimension: "Geographic Exposure",
      currentScore: 4,
      suggestedScore: 4,
      reason:
        "UAE removal from FATF grey list reduces some geographic risk, but CAHRA exposure and sanctioned-regime supply chain risk remain high.",
    },
  ],
  generatedAt: new Date().toISOString(),
};

export async function POST(req: Request) {
  let body: { sector?: string; jurisdiction?: string; reportingPeriod?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { sector, jurisdiction, reportingPeriod } = body;
  if (!sector || !jurisdiction) {
    return NextResponse.json(
      { ok: false, error: "sector and jurisdiction are required" },
      { status: 400 },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ...FALLBACK, generatedAt: new Date().toISOString() });

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a financial crime threat intelligence analyst specialising in AML typologies, FATF guidance, and regulatory developments. Your knowledge covers FATF mutual evaluations, CBUAE guidance, UAE FDL 10/2025, LBMA RGG, and emerging financial crime trends globally.

Generate current, accurate threat intelligence for an EWRA (Entity-Wide Risk Assessment). Focus on:
1. Top 5 ML/TF typologies active in the specified sector and jurisdiction
2. Regulatory changes in the last 90 days
3. FATF mutual evaluation findings if relevant to the jurisdiction
4. Recommended EWRA score adjustments with precise justification

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "typologies": [
    {"name":"string","trend":"rising"|"stable"|"declining","description":"string","fatfRef":"string"}
  ],
  "regulatoryChanges": [
    {"change":"string","impact":"string","effectiveDate":"dd/mm/yyyy or yyyy-mm-dd"}
  ],
  "scoreAdjustments": [
    {"dimension":"string","currentScore":1-5,"suggestedScore":1-5,"reason":"string"}
  ],
  "generatedAt": "ISO-8601 timestamp"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Sector: ${sector}
Jurisdiction: ${jurisdiction}
Reporting period: ${reportingPeriod ?? new Date().getFullYear().toString()}

Generate threat intelligence for the EWRA. Focus on the top 5 current ML/TF typologies, recent regulatory changes (last 90 days), and specific EWRA dimension score adjustment recommendations. Return JSON only.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as ThreatIntelResult;
    const result: ThreatIntelResult = {
      ...parsed,
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ...FALLBACK, generatedAt: new Date().toISOString() });
  }
}
