export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface EvasionPattern {
  pattern:
    | "front_company"
    | "jurisdiction_layering"
    | "shelf_company"
    | "name_variation"
    | "split_payments"
    | "third_party_intermediary"
    | "vessel_flag_hopping"
    | "commodity_substitution"
    | "crypto_conversion"
    | "correspondent_banking_exploitation";
  evidence: string;
  confidence: number;
  fatfRef: string;
}

export interface JurisdictionLayer {
  layer: number;
  jurisdiction: string;
  risk: string;
  purpose: string;
}

export interface SanctionsEvasionResult {
  evasionRiskScore: number;
  evasionTier: "unlikely" | "possible" | "probable" | "confirmed";
  detectedPatterns: EvasionPattern[];
  frontCompanyIndicators: string[];
  jurisdictionLayering: JurisdictionLayer[];
  nameVariationFlags: string[];
  splitPaymentPatterns: string[];
  ultimateBeneficiary: string;
  sanctionedPartyConnection: string;
  recommendation: "clear" | "flag_for_review" | "freeze_pending_investigation" | "file_str" | "report_to_regulator";
  immediateActions: string[];
  summary: string;
}

const SANCTIONS_EVASION_SYSTEM = `You are a world-class sanctions compliance expert with deep expertise in identifying sanctions evasion typologies. You have worked with OFAC, EU sanctions authorities, UAE TFS authorities, UN Panels of Experts, and major international banks' financial crime teams.

You have comprehensive knowledge of all major sanctions evasion techniques including:

## FRONT COMPANY INDICATORS
- Shell companies with no apparent business purpose
- Companies incorporated shortly before sanctioned entity's designation
- Identical business addresses, phone numbers, or email domains
- Directors/officers who are also connected to sanctioned entities
- Unusual capitalization or ownership structure
- Business name that is a variation or translation of sanctioned entity name
- Rapid changes in ownership or directorship after designation
- Companies in high-risk free zones (UAE JAFZA, BVI, Caymans) with no clear purpose

## JURISDICTION LAYERING PATTERNS
- Multi-hop corporate structures through non-FATF countries
- Use of jurisdictions with weak beneficial ownership registries
- Transactions routed through countries with no sanctions framework
- Offshore financial centres in layering chains
- Free zone companies used as intermediaries
- Transactions through correspondent banks in non-sanctioned jurisdictions
- Use of third-country entities to obscure origin/destination

## NAME VARIATION TECHNIQUES
- Transliteration differences (Cyrillic to Latin, Arabic to Latin)
- Abbreviations and acronyms
- Translation into different languages
- Adding/removing generic terms (LLC, Ltd, Co, Trading, International)
- Common name substitutions (e.g., for North Korean entities)
- Romanization variations (Kim Jong-un / Kim Chong-un)
- Entity name plus geographic modifier changes
- Historical vs current names post-rebranding

## PAYMENT SPLITTING PATTERNS
- Multiple sub-threshold transactions
- Payments through multiple intermediary banks
- Split across multiple currencies
- Use of escrow or holdback arrangements
- Structured over multiple time periods
- Correspondent chain splitting
- Netting arrangements to obscure individual transactions

## THIRD-PARTY INTERMEDIARY USE
- Trusted business partners acting as conduits
- Family members as beneficial owners
- Nominee directors with no actual control
- Professional enablers (lawyers, accountants)
- State-owned enterprises acting as intermediaries for sanctioned states
- Trade intermediaries adding opacity to transactions
- Petroleum trading intermediaries (common for Iran, Russia, Venezuela)

## SANCTIONS EVASION SPECIFIC TO UAE
- Precious metals used to move value for sanctioned parties
- Dubai property used to park sanctioned funds
- UAE-registered vessels in flag-hopping schemes
- Gold refinery exploitation for Iranian/Russian proceeds
- Hawala networks linked to sanctioned jurisdictions
- DMCC gold trader connections to sanctioned parties
- UAE bank correspondent relationships exploited

## CRYPTOCURRENCY EVASION
- Crypto wallets controlled by sanctioned entities
- Mixers and tumblers for DPRK proceeds
- Crypto exchanges in non-sanctioned jurisdictions
- Stablecoin usage to avoid detection
- DPRK Lazarus Group crypto theft and laundering
- Russian oligarch crypto asset parking

Analyse the submitted entity information and identify all evasion indicators. Calculate a risk score (0-100).

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "evasionRiskScore": number (0-100),
  "evasionTier": "unlikely"|"possible"|"probable"|"confirmed",
  "detectedPatterns": [
    {
      "pattern": "front_company"|"jurisdiction_layering"|"shelf_company"|"name_variation"|"split_payments"|"third_party_intermediary"|"vessel_flag_hopping"|"commodity_substitution"|"crypto_conversion"|"correspondent_banking_exploitation",
      "evidence": "string",
      "confidence": number (0-100),
      "fatfRef": "string"
    }
  ],
  "frontCompanyIndicators": ["string"],
  "jurisdictionLayering": [
    {
      "layer": number,
      "jurisdiction": "string",
      "risk": "High"|"Medium"|"Low",
      "purpose": "string"
    }
  ],
  "nameVariationFlags": ["string"],
  "splitPaymentPatterns": ["string"],
  "ultimateBeneficiary": "string",
  "sanctionedPartyConnection": "string",
  "recommendation": "clear"|"flag_for_review"|"freeze_pending_investigation"|"file_str"|"report_to_regulator",
  "immediateActions": ["string"],
  "summary": "string"
}

Score guidance:
- 0-25: unlikely
- 26-50: possible
- 51-75: probable
- 76-100: confirmed

Be thorough, expert-level, and conservative — err on the side of caution for sanctions risk.`;


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entity?: string;
    jurisdiction?: string;
    transactions?: string;
    ownershipStructure?: string;
    counterparties?: string;
    commodities?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sanctions-evasion temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: SANCTIONS_EVASION_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse this entity for sanctions evasion indicators:

Entity Name: ${sanitizeField(body.entity, 500) || "Unknown Entity"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "Unknown"}
Ownership Structure: ${sanitizeText(body.ownershipStructure, 2000) || "Not provided"}
Counterparties: ${sanitizeText(body.counterparties, 2000) || "Not provided"}
Commodities/Products: ${sanitizeField(body.commodities, 500) || "Not provided"}
Transaction Summary: ${sanitizeText(body.transactions, 3000) || "Not provided"}

Conduct a comprehensive sanctions evasion risk assessment. Identify all evasion patterns, calculate risk score, and provide immediate action recommendations.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SanctionsEvasionResult;
    if (!Array.isArray(result.detectedPatterns)) result.detectedPatterns = [];
    if (!Array.isArray(result.frontCompanyIndicators)) result.frontCompanyIndicators = [];
    if (!Array.isArray(result.jurisdictionLayering)) result.jurisdictionLayering = [];
    if (!Array.isArray(result.nameVariationFlags)) result.nameVariationFlags = [];
    if (!Array.isArray(result.splitPaymentPatterns)) result.splitPaymentPatterns = [];
    if (!Array.isArray(result.immediateActions)) result.immediateActions = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "sanctions-evasion temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
