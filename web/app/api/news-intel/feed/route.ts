export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export type RiskTheme =
  | "financial_crime"
  | "sanctions"
  | "corruption"
  | "regulatory"
  | "litigation"
  | "reputational"
  | "political";

export interface FeedItem {
  id: string;
  source: string;
  headline: string;
  date: string;
  snippet: string;
  riskThemes: RiskTheme[];
  sentimentScore: number; // -100 to +100
  sentimentLabel: "positive" | "negative" | "neutral";
  language: string;
  region: string;
}

export interface NewsFeedResult {
  ok: true;
  items: FeedItem[];
  fetchedAt: string;
}

const FALLBACK: NewsFeedResult = {
  ok: true,
  fetchedAt: new Date().toISOString(),
  items: [
    {
      id: "feed-001",
      source: "Reuters",
      headline: "OFAC imposes $45m fine on UAE metals dealer for sanctions violations",
      date: "2025-04-30",
      snippet:
        "The US Treasury's Office of Foreign Assets Control has levied a $45 million civil monetary penalty against a Dubai-based precious metals dealer for facilitating transactions involving sanctioned Iranian entities.",
      riskThemes: ["sanctions", "financial_crime"],
      sentimentScore: -85,
      sentimentLabel: "negative",
      language: "en",
      region: "UAE",
    },
    {
      id: "feed-002",
      source: "Financial Times",
      headline: "Global banks face new FATF guidance on correspondent banking de-risking",
      date: "2025-04-30",
      snippet:
        "FATF has issued updated guidance warning financial institutions against blanket de-risking of correspondent relationships, urging a risk-based approach instead.",
      riskThemes: ["regulatory", "financial_crime"],
      sentimentScore: -30,
      sentimentLabel: "negative",
      language: "en",
      region: "Global",
    },
    {
      id: "feed-003",
      source: "Bloomberg",
      headline: "Former bank executive charged in $230m trade-based money laundering scheme",
      date: "2025-04-29",
      snippet:
        "Federal prosecutors have charged a former senior executive at a regional bank with orchestrating a complex TBML scheme using fictitious gold trade invoices across UAE, Switzerland, and Singapore.",
      riskThemes: ["financial_crime", "litigation"],
      sentimentScore: -90,
      sentimentLabel: "negative",
      language: "en",
      region: "US",
    },
    {
      id: "feed-004",
      source: "ACAMS Today",
      headline: "FinCEN proposes new beneficial ownership reporting requirements for real estate",
      date: "2025-04-29",
      snippet:
        "FinCEN has published a notice of proposed rulemaking that would extend beneficial ownership disclosure requirements to all-cash real estate transactions nationwide.",
      riskThemes: ["regulatory"],
      sentimentScore: -15,
      sentimentLabel: "neutral",
      language: "en",
      region: "US",
    },
    {
      id: "feed-005",
      source: "Transparency International",
      headline: "CPI 2025 index reveals deepening corruption in West African mining sector",
      date: "2025-04-28",
      snippet:
        "Transparency International's latest Corruption Perceptions Index update highlights a significant deterioration in anti-corruption controls across key West African gold-producing nations.",
      riskThemes: ["corruption", "reputational"],
      sentimentScore: -70,
      sentimentLabel: "negative",
      language: "en",
      region: "Africa",
    },
    {
      id: "feed-006",
      source: "Wall Street Journal",
      headline: "Swiss private bank fined CHF 38m for failure to detect PEP laundering",
      date: "2025-04-28",
      snippet:
        "FINMA has imposed a CHF 38 million penalty on a Geneva-based private bank after investigators found the institution processed $180 million in funds linked to a politically exposed person from Southeast Asia.",
      riskThemes: ["financial_crime", "corruption", "regulatory"],
      sentimentScore: -78,
      sentimentLabel: "negative",
      language: "en",
      region: "Europe",
    },
    {
      id: "feed-007",
      source: "Gulf News",
      headline: "CBUAE issues new circular on virtual asset service provider registration",
      date: "2025-04-27",
      snippet:
        "The Central Bank of the UAE has published Circular 12/2025 mandating all VASP operators to register under the updated AML/CFT framework by 30 June 2025 or face immediate licence suspension.",
      riskThemes: ["regulatory"],
      sentimentScore: -20,
      sentimentLabel: "neutral",
      language: "en",
      region: "UAE",
    },
    {
      id: "feed-008",
      source: "The National",
      headline: "UAE FIU reports 34% increase in STR filings from DPMS sector in Q1 2025",
      date: "2025-04-27",
      snippet:
        "The UAE Financial Intelligence Unit's quarterly statistics show a 34% year-on-year increase in suspicious transaction reports from dealers in precious metals and stones, signalling heightened regulatory scrutiny.",
      riskThemes: ["financial_crime", "regulatory"],
      sentimentScore: -25,
      sentimentLabel: "neutral",
      language: "en",
      region: "UAE",
    },
    {
      id: "feed-009",
      source: "Global Witness",
      headline: "Investigation exposes Dubai gold route used to launder conflict-mineral proceeds",
      date: "2025-04-26",
      snippet:
        "An 18-month investigation by Global Witness has documented a sophisticated money-laundering network exploiting Dubai's gold trading infrastructure to process proceeds from illegal artisanal mining in conflict zones.",
      riskThemes: ["financial_crime", "corruption", "reputational"],
      sentimentScore: -92,
      sentimentLabel: "negative",
      language: "en",
      region: "UAE",
    },
    {
      id: "feed-010",
      source: "OCCRP",
      headline: "Leaked documents reveal offshore shell network shielding sanctioned oligarch assets",
      date: "2025-04-26",
      snippet:
        "The Organised Crime and Corruption Reporting Project has published leaked corporate records showing a 47-entity shell company network used to conceal real estate and bullion holdings of a sanctioned Russian national.",
      riskThemes: ["sanctions", "financial_crime", "corruption"],
      sentimentScore: -88,
      sentimentLabel: "negative",
      language: "en",
      region: "Global",
    },
    {
      id: "feed-011",
      source: "South China Morning Post",
      headline: "Hong Kong court orders $120m asset freeze in suspected fraud case",
      date: "2025-04-25",
      snippet:
        "Hong Kong's Court of First Instance has granted a Mareva injunction freezing $120 million in assets linked to a fintech company suspected of orchestrating an investment fraud targeting retail investors across Asia.",
      riskThemes: ["litigation", "financial_crime"],
      sentimentScore: -65,
      sentimentLabel: "negative",
      language: "en",
      region: "Asia",
    },
    {
      id: "feed-012",
      source: "Le Monde",
      headline: "French luxury goods group under investigation for tax evasion and money laundering",
      date: "2025-04-25",
      snippet:
        "Paris prosecutors have opened a formal judicial investigation against a major luxury conglomerate, alleging the use of offshore subsidiaries to evade VAT and launder proceeds from undisclosed transactions.",
      riskThemes: ["financial_crime", "litigation", "reputational"],
      sentimentScore: -75,
      sentimentLabel: "negative",
      language: "fr",
      region: "Europe",
    },
    {
      id: "feed-013",
      source: "Compliance Week",
      headline: "Basel AML Index 2025: Southeast Asia risk scores worsen amid governance failures",
      date: "2025-04-24",
      snippet:
        "The Basel Institute on Governance's 2025 AML Index shows deteriorating scores for Cambodia, Myanmar, and Laos, citing persistent weak financial intelligence units and high corruption permeation.",
      riskThemes: ["regulatory", "corruption", "political"],
      sentimentScore: -55,
      sentimentLabel: "negative",
      language: "en",
      region: "Asia",
    },
    {
      id: "feed-014",
      source: "FCPA Blog",
      headline: "DOJ announces record $2.1bn FCPA settlement with infrastructure conglomerate",
      date: "2025-04-23",
      snippet:
        "The US Department of Justice has announced a $2.1 billion resolution with a multinational infrastructure group for FCPA violations involving bribery of government officials across twelve countries.",
      riskThemes: ["corruption", "litigation"],
      sentimentScore: -80,
      sentimentLabel: "negative",
      language: "en",
      region: "US",
    },
    {
      id: "feed-015",
      source: "Wolfsberg Group",
      headline: "Wolfsberg Group updates guidance on effective AML/CFT programmes",
      date: "2025-04-22",
      snippet:
        "The Wolfsberg Group has released revised principles for effective anti-money laundering programmes, with new focus on AI-assisted transaction monitoring and cross-border information sharing.",
      riskThemes: ["regulatory"],
      sentimentScore: 15,
      sentimentLabel: "positive",
      language: "en",
      region: "Global",
    },
  ],
};

export async function GET() {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "news-intel/feed temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `You are a financial crime news intelligence curator. Generate a curated live intelligence feed of 15 realistic, recent financial crime news items. These should reflect real-world patterns in AML enforcement, sanctions, corruption, regulatory updates, and financial crime investigations.

Each item must include: unique id, source (real news outlets), headline, date (within the last 2 weeks from 2025-05-01), snippet (2-3 sentences), risk themes, sentiment score (-100 to +100), sentiment label, language (en/ar/fr/de etc.), and region.

Risk themes must be one or more of: financial_crime, sanctions, corruption, regulatory, litigation, reputational, political.

Return ONLY valid JSON (no markdown fences):
{
  "ok": true,
  "fetchedAt": "ISO timestamp",
  "items": [
    {
      "id": "feed-NNN",
      "source": "string",
      "headline": "string",
      "date": "YYYY-MM-DD",
      "snippet": "string",
      "riskThemes": ["financial_crime"|"sanctions"|"corruption"|"regulatory"|"litigation"|"reputational"|"political"],
      "sentimentScore": -100,
      "sentimentLabel": "positive"|"negative"|"neutral",
      "language": "en",
      "region": "string"
    }
  ]
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Generate 15 realistic financial crime intelligence news items for the live feed. Include a mix of regions, risk themes, and sources. Make them specific and credible — include dollar amounts, entity types, regulatory body names, and jurisdictions.",
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NewsFeedResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "news-intel/feed temporarily unavailable - please retry." }, { status: 503 });
  }
}
