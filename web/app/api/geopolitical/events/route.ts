export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface GeopoliticalEvent {
  id: string;
  country: string;
  region: "Middle East" | "Europe" | "Asia" | "Africa" | "Americas";
  eventType:
    | "conflict"
    | "sanctions"
    | "coup"
    | "election"
    | "financial-crisis"
    | "diplomatic";
  riskLevel: "critical" | "high" | "medium";
  headline: string;
  impact: string;
  affectedSectors: string[];
  date: string;
  recommendation: string;
}

const FALLBACK_EVENTS: GeopoliticalEvent[] = [
  {
    id: "GEO-001",
    country: "Sudan",
    region: "Africa",
    eventType: "conflict",
    riskLevel: "critical",
    headline: "RSF-SAF Conflict Escalates — Khartoum Financial District Seized",
    impact:
      "Major disruption to banking and cross-border trade. Correspondent banking relationships suspended by 4 UAE banks.",
    affectedSectors: ["Banking", "Trade Finance", "Gold & Metals"],
    date: "2025-04-29",
    recommendation:
      "Freeze all pending wire transfers to Sudanese counterparties. Escalate existing client reviews to EDD. Notify CBUAE within 24 hours.",
  },
  {
    id: "GEO-002",
    country: "Iran",
    region: "Middle East",
    eventType: "sanctions",
    riskLevel: "critical",
    headline: "OFAC Expands Iran SDN List — 47 New Entities Including Gold Traders",
    impact:
      "Direct exposure risk for UAE-based gold refiners and traders. Three previously cleared entities now designated.",
    affectedSectors: ["Gold & Metals", "Commodities", "Shipping"],
    date: "2025-04-28",
    recommendation:
      "Re-screen all active clients and counterparties against updated SDN list immediately. Suspend transactions pending review.",
  },
  {
    id: "GEO-003",
    country: "Myanmar",
    region: "Asia",
    eventType: "coup",
    riskLevel: "critical",
    headline: "Military Junta Seizes Central Bank — Foreign Reserves Frozen",
    impact:
      "All Myanmar kyat transactions blocked. Junta-linked entities proliferating in Singapore and Thailand as cutouts.",
    affectedSectors: ["Banking", "Real Estate", "Trade Finance"],
    date: "2025-04-27",
    recommendation:
      "Flag all Myanmar-origin funds for enhanced scrutiny. Review beneficial ownership of Southeast Asian SPVs for junta links.",
  },
  {
    id: "GEO-004",
    country: "Venezuela",
    region: "Americas",
    eventType: "financial-crisis",
    riskLevel: "high",
    headline: "Bolívar Hyperinflation Hits 4,200% — Capital Flight to Crypto",
    impact:
      "Significant increase in crypto-to-fiat conversion attempts through UAE exchanges. Sanctions evasion risk elevated.",
    affectedSectors: ["Cryptocurrency", "Banking", "Real Estate"],
    date: "2025-04-26",
    recommendation:
      "Enhance monitoring of Venezuelan-origin funds. Apply EDD to all cryptocurrency transactions above AED 10,000.",
  },
  {
    id: "GEO-005",
    country: "Turkey",
    region: "Europe",
    eventType: "financial-crisis",
    riskLevel: "high",
    headline: "Turkish Lira Falls 18% — Central Bank Emergency Intervention",
    impact:
      "Turkish HNW individuals accelerating capital transfers to UAE. Gold purchases surging as inflation hedge.",
    affectedSectors: ["Banking", "Gold & Metals", "Real Estate"],
    date: "2025-04-25",
    recommendation:
      "Flag large Turkish lira conversions for source-of-funds review. Monitor gold purchase patterns from Turkish nationals.",
  },
  {
    id: "GEO-006",
    country: "Pakistan",
    region: "Asia",
    eventType: "election",
    riskLevel: "high",
    headline: "Pakistan Elections Disputed — PTI Supporters Block Lahore Airport",
    impact:
      "Political instability increasing hawala activity. Remittance corridors under stress. IMF bailout negotiations stalled.",
    affectedSectors: ["Remittances", "Banking", "Trade Finance"],
    date: "2025-04-24",
    recommendation:
      "Heighten scrutiny on Pakistan-originating remittances. Monitor for unusual hawala patterns in UAE-Pakistan corridors.",
  },
  {
    id: "GEO-007",
    country: "Russia",
    region: "Europe",
    eventType: "sanctions",
    riskLevel: "high",
    headline: "EU Adopts 15th Sanctions Package — Adds 200 Vessels to Shadow Fleet List",
    impact:
      "UAE ports identified as transshipment hub for sanctioned cargo. Shipping companies under increased scrutiny.",
    affectedSectors: ["Shipping", "Trade Finance", "Oil & Gas"],
    date: "2025-04-23",
    recommendation:
      "Screen all vessel ownership chains for Russian beneficial interest. Flag transactions involving listed shadow fleet vessels.",
  },
  {
    id: "GEO-008",
    country: "Ethiopia",
    region: "Africa",
    eventType: "conflict",
    riskLevel: "high",
    headline: "Tigray Conflict Reignites — UN Reports Mass Displacement",
    impact:
      "Humanitarian crisis driving illicit gold smuggling from Ethiopian artisanal mines through Djibouti to UAE.",
    affectedSectors: ["Gold & Metals", "Remittances", "Trade Finance"],
    date: "2025-04-22",
    recommendation:
      "Apply enhanced origin verification for Ethiopian gold. Review supply chain documentation for Tigray-region sourcing.",
  },
  {
    id: "GEO-009",
    country: "Lebanon",
    region: "Middle East",
    eventType: "financial-crisis",
    riskLevel: "high",
    headline: "Lebanese Banks Reopen — Depositors Limited to USD 400/Month Withdrawal",
    impact:
      "Lebanese diaspora accelerating UAE asset purchases. Cash-intensive real estate transactions increasing.",
    affectedSectors: ["Real Estate", "Banking", "Gold & Metals"],
    date: "2025-04-21",
    recommendation:
      "Apply source-of-funds EDD to all Lebanese-national transactions above AED 50,000. Monitor real estate cash purchases.",
  },
  {
    id: "GEO-010",
    country: "Nigeria",
    region: "Africa",
    eventType: "financial-crisis",
    riskLevel: "medium",
    headline: "CBN Forex Crisis — Naira Black Market Premium Reaches 45%",
    impact:
      "Nigerian businesses routing USD through UAE to avoid CBN restrictions. Trade invoice manipulation risk elevated.",
    affectedSectors: ["Trade Finance", "Banking", "Commodities"],
    date: "2025-04-20",
    recommendation:
      "Review Nigerian trade finance transactions for over/under-invoicing. Apply TBML typology checks.",
  },
  {
    id: "GEO-011",
    country: "Georgia",
    region: "Europe",
    eventType: "diplomatic",
    riskLevel: "medium",
    headline: "Georgia Suspends EU Accession — Pro-Russia Shift Triggers Protests",
    impact:
      "Georgian banking sector vulnerable to capital flight. Russian business rerouting through Georgian entities to UAE.",
    affectedSectors: ["Banking", "Real Estate", "Trade Finance"],
    date: "2025-04-19",
    recommendation:
      "Enhanced scrutiny on Georgian-incorporated entities with Russian beneficial ownership. Review new account openings.",
  },
  {
    id: "GEO-012",
    country: "Bangladesh",
    region: "Asia",
    eventType: "election",
    riskLevel: "medium",
    headline: "Bangladesh Interim Government — Awami League Assets Under Investigation",
    impact:
      "Former ruling party assets being moved through Dubai real estate and gold markets. PEP exposure elevated.",
    affectedSectors: ["Real Estate", "Gold & Metals", "Banking"],
    date: "2025-04-18",
    recommendation:
      "Screen Bangladeshi PEPs and their associates against updated lists. Apply EDD to Bangladeshi HNW clients.",
  },
];

export async function GET() {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, events: FALLBACK_EVENTS });

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a geopolitical risk intelligence analyst specialising in AML/CFT implications for UAE-based financial institutions. Generate 12 current, realistic geopolitical risk events that are relevant to compliance teams in the UAE. Each event should have direct AML/CFT or sanctions implications.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "events": [
    {
      "id": "GEO-001",
      "country": "string",
      "region": "Middle East"|"Europe"|"Asia"|"Africa"|"Americas",
      "eventType": "conflict"|"sanctions"|"coup"|"election"|"financial-crisis"|"diplomatic",
      "riskLevel": "critical"|"high"|"medium",
      "headline": "string (concise news-style headline)",
      "impact": "string (AML/CFT impact for UAE firms, 1-2 sentences)",
      "affectedSectors": ["string"],
      "date": "YYYY-MM-DD",
      "recommendation": "string (specific compliance action, 1-2 sentences)"
    }
  ]
}

Include a mix of: 2-3 critical events, 5-6 high events, 3-4 medium events. Make events realistic and topical for 2025.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Generate 12 current geopolitical risk events with AML/CFT implications for UAE compliance teams. Focus on conflicts, sanctions updates, financial crises, elections with risk implications, and diplomatic developments affecting trade and finance.",
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as { ok: boolean; events: GeopoliticalEvent[] };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: true, events: FALLBACK_EVENTS });
  }
}
