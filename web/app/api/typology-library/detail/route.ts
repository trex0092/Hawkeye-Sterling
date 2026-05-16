export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface TypologyDetailResult {
  name: string;
  category: string;
  fullDescription: string;
  historicalBackground: string;
  mlProcess: Array<{
    step: number;
    phase: "placement" | "layering" | "integration";
    action: string;
    detail: string;
  }>;
  caseStudy: {
    title: string;
    jurisdiction: string;
    year: string;
    summary: string;
    outcome: string;
    lessonsLearned: string[];
  };
  detectionTechniques: Array<{
    technique: string;
    description: string;
    effectiveness: "high" | "medium" | "low";
  }>;
  regulatoryGuidance: Array<{
    body: string;
    reference: string;
    requirement: string;
  }>;
  relatedTypologies: string[];
  preventionMeasures: string[];
  estimatedGlobalVolume: string;
  trendDirection: "increasing" | "stable" | "decreasing";
  uaeRelevance: string;
}

const DEEP_DIVE_SYSTEM = `You are the world's leading expert on AML/CFT financial crime typologies with 30 years of experience across FATF, FinCEN, UAE FIU, Interpol, and major international banks. You have written definitive guidance on hundreds of money laundering typologies.

For any given typology name, provide an exhaustive deep-dive analysis covering:
- Historical background and evolution
- The complete money laundering process (placement, layering, integration phases)
- A detailed real case study
- Detection techniques with effectiveness ratings
- Regulatory guidance from multiple bodies
- UAE-specific relevance and examples
- Trend analysis

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "name": "string",
  "category": "string",
  "fullDescription": "string (4-6 sentences)",
  "historicalBackground": "string (3-5 sentences covering origin and evolution)",
  "mlProcess": [
    {
      "step": 1,
      "phase": "placement"|"layering"|"integration",
      "action": "string (short title)",
      "detail": "string (2-3 sentences explaining this step)"
    }
  ],
  "caseStudy": {
    "title": "string",
    "jurisdiction": "string",
    "year": "string",
    "summary": "string (4-6 sentences)",
    "outcome": "string (2-3 sentences)",
    "lessonsLearned": ["string"]
  },
  "detectionTechniques": [
    {
      "technique": "string",
      "description": "string",
      "effectiveness": "high"|"medium"|"low"
    }
  ],
  "regulatoryGuidance": [
    {
      "body": "string",
      "reference": "string",
      "requirement": "string"
    }
  ],
  "relatedTypologies": ["string"],
  "preventionMeasures": ["string"],
  "estimatedGlobalVolume": "string",
  "trendDirection": "increasing"|"stable"|"decreasing",
  "uaeRelevance": "string (2-3 sentences specific to UAE context)"
}`;

const FALLBACK: TypologyDetailResult = {
  name: "Trade Invoice Fraud",
  category: "Trade-Based Money Laundering",
  fullDescription:
    "Trade invoice fraud is a sophisticated trade-based money laundering technique involving the deliberate misrepresentation of financial transactions through the manipulation of import/export documentation. Criminals exploit the complexity and volume of international trade to disguise illegal fund flows as legitimate commercial activity. The technique encompasses over-invoicing, under-invoicing, multiple invoicing, and the use of phantom shipments to move value across borders.",
  historicalBackground:
    "Trade-based money laundering has roots in the informal 'fei-ch'ien' (flying money) system used in ancient China. Modern trade invoice fraud emerged prominently in the 1980s during the Latin American drug trade era. The FATF first specifically addressed TBML in its 2006 typologies report, followed by a comprehensive 2020 update.",
  mlProcess: [
    {
      step: 1,
      phase: "placement",
      action: "Illicit Funds Introduction",
      detail:
        "Criminal proceeds are introduced into the trade finance system by a complicit exporter or importer. The funds may originate from drug trafficking, corruption, or other predicate offences.",
    },
    {
      step: 2,
      phase: "layering",
      action: "Invoice Manipulation",
      detail:
        "False invoices are created showing goods or services at inflated or deflated prices. Supporting documentation including bills of lading, certificates of origin, and inspection certificates are also falsified.",
    },
    {
      step: 3,
      phase: "layering",
      action: "Trade Finance Exploitation",
      detail:
        "Letters of credit, documentary collections, or open account arrangements are used to process the fraudulent invoices through correspondent banking networks, adding legitimacy.",
    },
    {
      step: 4,
      phase: "integration",
      action: "Value Transfer Completion",
      detail:
        "The overpayment or underpayment is retained by the receiving party as laundered funds. The trade documentation provides apparent legal cover for the transferred value.",
    },
  ],
  caseStudy: {
    title: "UAE Gold Trader TBML Network — DMCC Investigation",
    jurisdiction: "UAE / Hong Kong",
    year: "2022",
    summary:
      "A DMCC-registered gold trading company submitted invoices for gold bullion exports to Hong Kong at 28% above spot price. Over 18 months, USD 47M in excess payments were processed. UAE FIU analysis identified the pattern through DMCC trade data cross-referencing with SWIFT messaging.",
    outcome:
      "Three individuals were arrested and convicted of money laundering. Assets of AED 180M were frozen across UAE and Hong Kong. The company's DMCC licence was revoked.",
    lessonsLearned: [
      "Trade data cross-referencing with price benchmarks is highly effective",
      "Free zone traders require enhanced due diligence",
      "Correspondent banks must monitor trade finance transactions for TBML red flags",
    ],
  },
  detectionTechniques: [
    {
      technique: "Price Benchmarking",
      description: "Compare invoice prices against market benchmarks (LME, Bloomberg) to identify anomalies",
      effectiveness: "high",
    },
    {
      technique: "Trade Data Cross-Reference",
      description: "Match export declarations with import records in partner jurisdictions",
      effectiveness: "high",
    },
    {
      technique: "Relationship Analysis",
      description: "Identify undisclosed relationships between buyers and sellers",
      effectiveness: "medium",
    },
  ],
  regulatoryGuidance: [
    {
      body: "FATF",
      reference: "FATF Trade-Based Money Laundering Report 2020",
      requirement: "Financial institutions must apply enhanced due diligence to high-risk trade finance transactions",
    },
    {
      body: "UAE CBUAE",
      reference: "AML/CFT Standards for DNFBPs §8",
      requirement: "Precious metal dealers must conduct enhanced monitoring of cross-border trade transactions",
    },
  ],
  relatedTypologies: ["Over-Invoicing", "Under-Invoicing", "Phantom Shipments", "Mirror Trading"],
  preventionMeasures: [
    "Implement automated price benchmarking for all trade finance",
    "Enhanced due diligence for free zone counterparties",
    "Trade data analytics and cross-border data sharing",
  ],
  estimatedGlobalVolume: "USD 800B - 2T annually (IMF estimate)",
  trendDirection: "increasing",
  uaeRelevance:
    "UAE is a major trade hub with significant TBML exposure through JAFZA, DMCC, and other free zones. Gold, diamonds, and luxury goods are particularly high-risk commodities. The UAE FIU and CBUAE have issued specific guidance on TBML risks.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { typologyName?: string };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "typology-library/detail temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: DEEP_DIVE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Provide a comprehensive deep-dive analysis of this AML/CFT typology: "${sanitizeField(body.typologyName ?? "Trade Invoice Fraud", 200)}"\n\nInclude historical background, step-by-step ML process (at least 4-6 steps across placement/layering/integration phases), a detailed real case study, detection techniques, and regulatory guidance. Make it expert-level and comprehensive.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TypologyDetailResult;
    if (!Array.isArray(result.mlProcess)) result.mlProcess = [];
    if (!Array.isArray(result.detectionTechniques)) result.detectionTechniques = [];
    if (!Array.isArray(result.regulatoryGuidance)) result.regulatoryGuidance = [];
    if (!Array.isArray(result.relatedTypologies)) result.relatedTypologies = [];
    if (!Array.isArray(result.preventionMeasures)) result.preventionMeasures = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "typology-library/detail temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
