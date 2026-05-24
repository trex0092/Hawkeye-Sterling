export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import {
  searchTypologies,
  type Typology,
  type TypologyCategory,
  type RiskLevel,
} from "@/lib/intelligence/typologyData";

export interface TypologyResult {
  id: string;
  name: string;
  /** "ML" | "TF" | "PF" — FATF category */
  category: string;
  description: string;
  redFlags: string[];
  realWorldExample: string;
  fatfRef: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  sectors: string[];
  jurisdictions: string[];
  relatedTypologies: string[];
  detectionMethods: string[];
  regulatoryResponse: string;
}

export interface TypologySearchResponse {
  results: TypologyResult[];
  totalFound: number;
  relatedCategories: string[];
  /** True when serving results from the static library (no AI). */
  staticLibrary?: boolean;
}

/** Convert a static Typology into the API TypologyResult shape. */
function toResult(t: Typology): TypologyResult {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    redFlags: t.redFlags,
    realWorldExample: "",
    fatfRef: t.fatfReference,
    riskLevel: t.riskLevel,
    sectors: t.sectors,
    jurisdictions: t.jurisdictions,
    relatedTypologies: t.relatedTypologies,
    detectionMethods: t.indicators,
    regulatoryResponse: t.fatfReference,
  };
}

const TYPOLOGY_KNOWLEDGE_BASE = `
You are an expert AML/CFT typology analyst with deep knowledge of over 500 money laundering and financial crime typologies. You have comprehensive knowledge of the following typology categories and specific typologies within them:

## TRADE-BASED MONEY LAUNDERING (TBML)
- Over-invoicing of goods and services
- Under-invoicing of goods and services
- Multiple invoicing for single shipment
- Falsely described goods and services
- Trade invoice fraud and phantom shipments
- Round-tripping through trade transactions
- Commodity price manipulation
- False documentation for trade finance
- Import/export manipulation through free zones (especially UAE JAFZA, DMCC)
- Gold and precious metals TBML

## REAL ESTATE MONEY LAUNDERING
- All-cash purchases to avoid bank scrutiny
- Use of shell companies and SPVs to purchase property
- PEP-linked real estate transactions
- Rapid buy-sell of properties at inflated prices
- Mortgage fraud and over-valuation
- Dubai luxury property ML (common typology in UAE)
- Rent-back arrangements for cash injection

## PROFESSIONAL MONEY LAUNDERING NETWORKS (PMLN)
- Complicit lawyers and legal professionals
- Accountant-facilitated ML through client accounts
- Company formation agent abuse
- Trust and company service provider (TCSP) networks
- Money mule recruitment and management

## CRYPTOCURRENCY AND VIRTUAL ASSET ML
- Bitcoin tumbling and mixing services
- Privacy coin (Monero, Zcash) layering
- DeFi protocol exploitation for layering
- NFT wash trading and price manipulation
- Crypto ATM structuring and smurfing
- Ransomware proceeds laundering
- Dark web marketplace proceeds

## CASINO AND GAMING ML
- Casino chip purchase and redemption
- VIP room cash-to-chip conversion

## INSURANCE FRAUD AND ML
- Life insurance policy purchase with illicit funds
- Policy loan exploitation

## HAWALA AND INFORMAL VALUE TRANSFER
- Classic hawala networks (Middle East, South Asia)
- Gold-based hawala in UAE
- Unregistered money remittance operators

## STRUCTURING AND SMURFING
- Classic smurfing below reporting thresholds
- Multiple account structuring
- Cash structuring across multiple financial institutions

## LAYERING THROUGH SHELL COMPANIES
- British Virgin Islands (BVI) shell company chains
- UAE offshore company structures
- Nominee director and shareholder arrangements

## LOAN-BACK SCHEMES
- Self-lending through offshore entity
- Back-to-back loan arrangements

## CARBON CREDIT FRAUD
- Phantom carbon credit creation
- Carousel fraud using carbon credits

## SANCTIONS EVASION TYPOLOGIES
- Front company networks for sanctioned parties
- Ship-to-ship transfers in international waters
- Flag hopping and vessel identity fraud
- Crypto used for DPRK sanctions evasion

## TERRORIST FINANCING (TF)
- Charitable organization exploitation
- Crypto crowdfunding for terrorism
- Hawala for terrorist fund movement
- Foreign terrorist fighter self-funding
- Online crowdfunding for TF
- Return from conflict zone financing
- Procurement networks for weapons

## PROLIFERATION FINANCING (PF)
- Front company procurement for dual-use goods
- Ship-to-ship transfer for sanctions evasion
- False end-user certificates
- Offshore shell company procurement chains

## UAE-SPECIFIC TYPOLOGIES
- DMCC gold trader cash placement
- Dubai real estate PEP purchases
- UAE free zone company misuse
- Dubai gold souk cash transactions
- UAE-based hawaladar networks
- Dhow boat informal trade
- Real estate developer payment structuring UAE

Your task is to search this knowledge base and return the most relevant typologies matching the user's query and filters. For each typology, provide comprehensive detail including red flags, detection methods, real-world examples, and regulatory references.

Return ONLY valid JSON (no markdown fences) matching the exact structure requested.
`;


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    query?: string;
    filters?: {
      sector?: string;
      jurisdictionType?: string;
      riskLevel?: string;
      fatfCategory?: string;
      category?: string;
    };
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  // ── Resolve category and riskLevel filters ──────────────────────────────
  const rawCategory = sanitizeField(
    body.filters?.category ?? body.filters?.fatfCategory ?? "",
    20,
  ).toUpperCase();
  const resolvedCategory: TypologyCategory | undefined =
    rawCategory === "ML" || rawCategory === "TF" || rawCategory === "PF"
      ? rawCategory
      : undefined;

  const rawRisk = sanitizeField(body.filters?.riskLevel ?? "", 20).toLowerCase();
  const resolvedRisk: RiskLevel | undefined =
    rawRisk === "low" || rawRisk === "medium" || rawRisk === "high" || rawRisk === "critical"
      ? rawRisk
      : undefined;

  const cleanQuery = sanitizeField(body.query ?? "", 500);

  // ── Primary path: static library search ────────────────────────────────
  const staticMatches = searchTypologies({
    query: cleanQuery,
    category: resolvedCategory,
    riskLevel: resolvedRisk,
    limit: 20,
  });

  const staticRelatedCategories = Array.from(
    new Set(staticMatches.map((t) => t.category)),
  );

  const SHORT_TERMS = new Set([
    "ml", "tf", "pf", "all", "any",
    "money laundering", "terrorist financing", "proliferation",
    "most common", "show", "list",
  ]);
  const hasFreetextQuery = Boolean(
    cleanQuery &&
    cleanQuery.trim().length > 3 &&
    !SHORT_TERMS.has(cleanQuery.trim().toLowerCase()),
  );

  const hasEnoughStaticResults = staticMatches.length >= 3;

  if (hasEnoughStaticResults && !hasFreetextQuery) {
    const staticResults: TypologyResult[] = staticMatches.map(toResult);
    const response: TypologySearchResponse = {
      results: staticResults,
      totalFound: staticMatches.length,
      relatedCategories: staticRelatedCategories,
      staticLibrary: true,
    };
    return NextResponse.json({ ok: true, ...response }, { headers: gate.headers });
  }

  // ── Fallback / augmentation: AI search ─────────────────────────────────
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    const staticResults: TypologyResult[] = staticMatches.map(toResult);
    return NextResponse.json({
      ok: true,
      results: staticResults,
      totalFound: staticMatches.length,
      relatedCategories: staticRelatedCategories,
      staticLibrary: true,
      degraded: staticMatches.length === 0,
      degradedReason: staticMatches.length === 0
        ? "ANTHROPIC_API_KEY not configured — typology-library AI search disabled. Set the key on the deployment to enable."
        : undefined,
    }, { headers: gate.headers });
  }

  const buildFallback = (): TypologySearchResponse => ({
    results: staticMatches.map(toResult),
    totalFound: staticMatches.length,
    relatedCategories: staticRelatedCategories,
    staticLibrary: true,
  });

  try {
    const client = getAnthropicClient(apiKey, 4_500);

    const filterParts = [
      resolvedCategory ? `category=${resolvedCategory}` : "",
      resolvedRisk ? `riskLevel=${resolvedRisk}` : "",
      body.filters?.sector ? `sector=${sanitizeField(body.filters.sector, 100)}` : "",
      body.filters?.jurisdictionType
        ? `jurisdiction=${sanitizeField(body.filters.jurisdictionType, 100)}`
        : "",
    ].filter(Boolean);
    const filterStr = filterParts.length > 0 ? `Filters: ${filterParts.join(", ")}` : "";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text:
            TYPOLOGY_KNOWLEDGE_BASE +
            `\n\nReturn ONLY valid JSON with this exact structure (no markdown fences):\n{\n  "results": [\n    {\n      "id": "CATEGORY-NNN",\n      "name": "string",\n      "category": "ML"|"TF"|"PF",\n      "description": "string",\n      "redFlags": ["string"],\n      "realWorldExample": "string",\n      "fatfRef": "string",\n      "riskLevel": "low"|"medium"|"high"|"critical",\n      "sectors": ["string"],\n      "jurisdictions": ["string"],\n      "relatedTypologies": ["string"],\n      "detectionMethods": ["string"],\n      "regulatoryResponse": "string"\n    }\n  ],\n  "totalFound": number,\n  "relatedCategories": ["string"]\n}\n\nFor the category field use ONLY "ML", "TF", or "PF" (FATF categories).\nReturn 5-10 most relevant typologies. Be comprehensive and expert-level.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Search query: "${cleanQuery}"
${filterStr}

Find the most relevant AML/CFT typologies matching this search. Use category "ML" for money laundering, "TF" for terrorist financing, "PF" for proliferation financing. Return comprehensive detail for each typology.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
    const aiResult = JSON.parse(jsonStr) as TypologySearchResponse;
    if (!Array.isArray(aiResult.results)) aiResult.results = [];
    if (!Array.isArray(aiResult.relatedCategories)) aiResult.relatedCategories = [];

    // Merge: static library first (deduplicated), then AI results
    const aiResultNames = new Set(aiResult.results.map((r) => r.name.toLowerCase()));
    const staticNotInAi = staticMatches
      .filter((s) => !aiResultNames.has(s.name.toLowerCase()))
      .map(toResult);
    const mergedResults = [...staticNotInAi, ...aiResult.results].slice(0, 15);
    const mergedRelated = Array.from(
      new Set([...staticRelatedCategories, ...aiResult.relatedCategories]),
    );

    return NextResponse.json({
      ok: true,
      results: mergedResults,
      totalFound: mergedResults.length,
      relatedCategories: mergedRelated,
    }, { headers: gate.headers });
  } catch (err) {
    console.warn("[typology-library/search] LLM failed:", err);
    return NextResponse.json({
      ok: true,
      ...buildFallback(),
      degraded: staticMatches.length === 0,
      degradedReason: "Typology search AI call failed — using static library results.",
    }, { headers: gate.headers });
  }
}
