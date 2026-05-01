export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });
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
    return NextResponse.json(FALLBACK);
  }
}

export type FeedRiskTheme =
  | "financial crime"
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
  snippet: string;
  date: string; // ISO
  riskThemes: FeedRiskTheme[];
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  jurisdiction: string;
  entities: string[];
}

export interface NewsFeedResult {
  ok: true;
  items: FeedItem[];
  generatedAt: string;
}

const FALLBACK: NewsFeedResult = {
  ok: true,
  generatedAt: new Date().toISOString(),
  items: [
    {
      id: "feed-001",
      source: "Financial Times",
      headline: "Deutsche Bank pays $1.3bn to settle US sanctions violations investigation",
      snippet: "US DoJ and OFAC reach landmark settlement with German lender over historical Iranian correspondent banking channels that bypassed SWIFT message stripping controls.",
      date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["sanctions", "financial crime"],
      sentiment: "negative",
      sentimentScore: -81,
      jurisdiction: "USA / Germany",
      entities: ["Deutsche Bank", "OFAC", "DoJ"],
    },
    {
      id: "feed-002",
      source: "Reuters",
      headline: "FATF plenary adds Pakistan and Cameroon to enhanced monitoring",
      snippet: "At the June plenary, FATF grey-listed Pakistan and Cameroon following mutual evaluation deficiencies in beneficial ownership transparency and STR filing rates.",
      date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["regulatory", "financial crime"],
      sentiment: "negative",
      sentimentScore: -65,
      jurisdiction: "Global / Pakistan / Cameroon",
      entities: ["FATF", "Pakistan", "Cameroon"],
    },
    {
      id: "feed-003",
      source: "Bloomberg",
      headline: "UAE CBUAE fines five exchange houses for CDD deficiencies totalling AED 18m",
      snippet: "Central Bank of UAE issued enforcement orders against five licensed exchange houses following a thematic review of their customer due diligence frameworks and high-risk customer identification procedures.",
      date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["regulatory", "financial crime"],
      sentiment: "negative",
      sentimentScore: -74,
      jurisdiction: "UAE",
      entities: ["CBUAE", "UAE"],
    },
    {
      id: "feed-004",
      source: "Global Witness",
      headline: "Report links Dubai gold trade to artisanal mining corruption in DRC",
      snippet: "Investigative report documents financial flows connecting artisanal gold miners in DRC conflict zones through UAE-based refiners to international commodity markets, raising TBML and corruption concerns.",
      date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["corruption", "financial crime", "reputational"],
      sentiment: "negative",
      sentimentScore: -88,
      jurisdiction: "UAE / DRC",
      entities: ["Dubai", "DRC"],
    },
    {
      id: "feed-005",
      source: "Wall Street Journal",
      headline: "Goldman Sachs compliance chief testifies on 1MDB controls breakdown",
      snippet: "Former Goldman compliance officers gave congressional testimony on how layered shell company structures obscured beneficial ownership of 1MDB-linked bond proceeds, highlighting due diligence failures.",
      date: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["corruption", "financial crime", "litigation"],
      sentiment: "negative",
      sentimentScore: -79,
      jurisdiction: "USA / Malaysia",
      entities: ["Goldman Sachs", "1MDB"],
    },
    {
      id: "feed-006",
      source: "OCCRP",
      headline: "Pandora Papers follow-up: three politicians' offshore assets frozen",
      snippet: "Authorities in three jurisdictions executed asset freeze orders against politicians whose offshore holdings were exposed in the Pandora Papers leak, citing unexplained wealth and beneficial ownership gaps.",
      date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["corruption", "political", "financial crime"],
      sentiment: "negative",
      sentimentScore: -83,
      jurisdiction: "Multiple",
      entities: ["Pandora Papers"],
    },
    {
      id: "feed-007",
      source: "Compliance Week",
      headline: "FinCEN finalises beneficial ownership reporting rule under CTA",
      snippet: "FinCEN published final guidance on the Corporate Transparency Act beneficial ownership information reporting requirements, setting a 30-day filing window for newly formed US entities effective immediately.",
      date: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["regulatory"],
      sentiment: "neutral",
      sentimentScore: -12,
      jurisdiction: "USA",
      entities: ["FinCEN", "FinCEN BOI"],
    },
    {
      id: "feed-008",
      source: "The Guardian",
      headline: "Binance ordered to pay $4.3bn — largest ever crypto AML settlement",
      snippet: "US DoJ reached a historic settlement with Binance, the world's largest cryptocurrency exchange, over failures to implement adequate AML controls and knowingly processing transactions for sanctioned entities.",
      date: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["financial crime", "sanctions", "regulatory"],
      sentiment: "negative",
      sentimentScore: -91,
      jurisdiction: "USA / Global",
      entities: ["Binance", "DoJ", "FinCEN"],
    },
    {
      id: "feed-009",
      source: "Middle East Eye",
      headline: "Kuwait-based real estate firm linked to Iranian sanctions evasion network",
      snippet: "Investigative findings allege a Kuwaiti property developer channelled funds through UAE shell companies to purchase commercial real estate on behalf of Iranian nationals subject to US secondary sanctions.",
      date: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["sanctions", "financial crime"],
      sentiment: "negative",
      sentimentScore: -86,
      jurisdiction: "Kuwait / UAE / Iran",
      entities: ["Kuwait", "UAE", "Iran"],
    },
    {
      id: "feed-010",
      source: "Law360",
      headline: "Rabobank agrees $369m forfeiture over Mexican drug cartel money laundering",
      snippet: "Dutch bank Rabobank's California subsidiary pled guilty to conspiring to impede the OCC and agreed to forfeit $369m for processing transactions for entities linked to Mexican narcotics trafficking organisations.",
      date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["financial crime", "litigation"],
      sentiment: "negative",
      sentimentScore: -77,
      jurisdiction: "USA / Netherlands / Mexico",
      entities: ["Rabobank", "OCC"],
    },
    {
      id: "feed-011",
      source: "EUobserver",
      headline: "EU AMLA headquarters confirmed in Frankfurt — mandate expanded",
      snippet: "European Anti-Money Laundering Authority will be headquartered in Frankfurt with direct supervisory powers over highest-risk credit institutions effective 2026, marking the EU's most significant AML reform in 20 years.",
      date: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["regulatory"],
      sentiment: "neutral",
      sentimentScore: 15,
      jurisdiction: "EU",
      entities: ["AMLA", "EU"],
    },
    {
      id: "feed-012",
      source: "Al Jazeera Investigative Unit",
      headline: "Arms embargo violations: weapons traced to sanctioned parties via UAE trading company",
      snippet: "Investigative unit documents how weapons subject to UN arms embargo reached conflict zones via falsely-labelled commercial shipments routed through Dubai free-zone trading entities.",
      date: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["sanctions", "financial crime", "political"],
      sentiment: "negative",
      sentimentScore: -93,
      jurisdiction: "UAE / Global",
      entities: ["Dubai", "UAE", "UN"],
    },
    {
      id: "feed-013",
      source: "Transparency International",
      headline: "CPI 2025: Sub-Saharan Africa scores worsen as kleptocracy networks expand",
      snippet: "Annual Corruption Perceptions Index shows deterioration across 11 Sub-Saharan African jurisdictions, with researchers citing state capture, grand corruption, and erosion of judicial independence as primary drivers.",
      date: new Date(Date.now() - 42 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["corruption", "political"],
      sentiment: "negative",
      sentimentScore: -61,
      jurisdiction: "Sub-Saharan Africa",
      entities: ["Transparency International"],
    },
    {
      id: "feed-014",
      source: "Swift Institute",
      headline: "SWIFT Payments Crime Compliance report: correspondent banking fraud rises 34%",
      snippet: "Annual SWIFT intelligence report reveals a 34% year-on-year increase in correspondent banking fraud, driven by business email compromise, synthetic identity networks, and insider threat vectors.",
      date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["financial crime"],
      sentiment: "negative",
      sentimentScore: -68,
      jurisdiction: "Global",
      entities: ["SWIFT"],
    },
    {
      id: "feed-015",
      source: "Oxford Analytica",
      headline: "Russia sanctions evasion: secondary market for dual-use goods emerges via Central Asia",
      snippet: "Intelligence brief documents emergence of a shadow procurement network routing dual-use electronics and machinery through Kazakhstan and Uzbekistan intermediaries to circumvent Russia export controls and OFAC sanctions.",
      date: new Date(Date.now() - 54 * 60 * 60 * 1000).toISOString(),
      riskThemes: ["sanctions", "financial crime", "political"],
      sentiment: "negative",
      sentimentScore: -85,
      jurisdiction: "Russia / Kazakhstan / Uzbekistan",
      entities: ["Russia", "Kazakhstan", "Uzbekistan", "OFAC"],
    },
  ],
};

// Cache feed for 10 minutes
let cachedFeed: NewsFeedResult | null = null;
let cacheExpiry = 0;

export async function GET() {
  const now = Date.now();
  if (cachedFeed && now < cacheExpiry) {
    return NextResponse.json(cachedFeed);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    cachedFeed = FALLBACK;
    cacheExpiry = now + 10 * 60 * 1000;
    return NextResponse.json(FALLBACK);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `You are a financial crime intelligence analyst. Generate a curated live news intelligence feed of 15 realistic recent financial crime, AML, sanctions, and regulatory news items. These should be plausible, realistic news items that could appear in financial crime compliance publications. Use real institution names, regulators, and jurisdictions where plausible.

Return ONLY valid JSON (no markdown fences):
{
  "ok": true,
  "generatedAt": "ISO timestamp",
  "items": [
    {
      "id": "feed-XXX",
      "source": "publication name",
      "headline": "news headline",
      "snippet": "2-3 sentence summary",
      "date": "ISO timestamp (within last 72 hours)",
      "riskThemes": ["financial crime"|"sanctions"|"corruption"|"regulatory"|"litigation"|"reputational"|"political"],
      "sentiment": "positive"|"negative"|"neutral",
      "sentimentScore": -100..100,
      "jurisdiction": "country/region",
      "entities": ["named entities mentioned"]
    }
  ]
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate 15 realistic financial crime intelligence news items dated within the last 72 hours. Include a variety of risk themes: financial crime, sanctions, corruption, regulatory enforcement, litigation, reputational risk, and political risk. Include items from multiple jurisdictions including UAE, USA, EU, Asia, and Africa.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NewsFeedResult;
    cachedFeed = result;
    cacheExpiry = now + 10 * 60 * 1000;
    return NextResponse.json(result);
  } catch {
    cachedFeed = FALLBACK;
    cacheExpiry = now + 10 * 60 * 1000;
    return NextResponse.json(FALLBACK);
  }
}
