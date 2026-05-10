export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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

const FALLBACK: SanctionsEvasionResult = {
  evasionRiskScore: 67,
  evasionTier: "probable",
  detectedPatterns: [
    {
      pattern: "front_company",
      evidence:
        "Entity incorporated 3 months after OFAC designation of related party. Shared registered address with designated entity. No identifiable business operations.",
      confidence: 82,
      fatfRef: "FATF Guidance on Proliferation Financing (2021) §4.2",
    },
    {
      pattern: "jurisdiction_layering",
      evidence:
        "3-layer corporate structure: UAE → BVI → Marshall Islands. No commercial rationale for offshore chain. Marshall Islands entity has no beneficial ownership registry disclosure.",
      confidence: 75,
      fatfRef: "FATF Recommendation 24 — Transparency and beneficial ownership",
    },
    {
      pattern: "third_party_intermediary",
      evidence:
        "Payments routed through Turkish intermediary company with no apparent role in the underlying transaction. Intermediary director previously associated with sanctioned entity.",
      confidence: 68,
      fatfRef: "UNSCR 2094 — Implementation guidance on DPRK sanctions",
    },
  ],
  frontCompanyIndicators: [
    "Incorporated 90 days after OFAC designation of beneficial owner",
    "No physical presence — virtual office only",
    "Director has no LinkedIn or professional profile",
    "Business activity description does not match actual transactions",
    "Bank account opened at institution with weak sanctions screening",
  ],
  jurisdictionLayering: [
    { layer: 1, jurisdiction: "UAE (JAFZA)", risk: "Medium", purpose: "Customer-facing entity — trade invoicing" },
    { layer: 2, jurisdiction: "British Virgin Islands", risk: "High", purpose: "Intermediate holding — obscures UBO" },
    {
      layer: 3,
      jurisdiction: "Marshall Islands",
      risk: "High",
      purpose: "Ultimate holding — no public beneficial ownership registry",
    },
  ],
  nameVariationFlags: [
    "Submitted name: 'Russ-Intl Trading LLC' — possible variation of designated 'Russo International Trading JSC'",
    "Director name 'Ivanov, Aleksei' — possible transliteration of designated 'Иванов Алексей'",
  ],
  splitPaymentPatterns: [
    "3 payments of USD 33,000 within 5 days (below USD 100K OFAC reporting threshold)",
    "Payments split across 2 beneficiary banks in different jurisdictions",
    "Identical payment references suggest coordination despite apparent separation",
  ],
  ultimateBeneficiary:
    "Probable connection to Aleksandr Ivanov (OFAC SDN designation date: 15 Feb 2023, SSI programme). Full UBO chain not yet confirmed — investigation required.",
  sanctionedPartyConnection:
    "Medium-high confidence connection to OFAC SDN list entity via shared directorship and address. Russian national director matches partial name variant of designated individual. Recommend formal screening confirmation.",
  recommendation: "freeze_pending_investigation",
  immediateActions: [
    "Freeze any pending transactions with this entity immediately pending investigation",
    "Submit preliminary STR to UAE FIU via goAML within 24 hours",
    "Conduct enhanced name screening with fuzzy-match across OFAC, EU, UN, and UAE TFS lists",
    "Request full UBO declaration and corporate registry documents from entity",
    "Escalate to MLRO and Senior Management for decision on relationship continuation",
    "Notify correspondent banks in transaction chain if applicable",
  ],
  summary:
    "Analysis of the submitted entity profile reveals a probable (67/100) sanctions evasion risk. Three evasion patterns were detected: front company characteristics, multi-jurisdiction layering through BVI and Marshall Islands, and third-party intermediary usage with a previously sanctioned-connected director. The payment splitting pattern (3 × USD 33K) is consistent with deliberate threshold avoidance. Immediate action is required — freeze pending transactions and file a preliminary STR with UAE FIU. Full investigation should confirm whether the beneficial owner is the OFAC SDN-listed individual before any transaction proceeds.",
};

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sanctions-evasion temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
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

Entity Name: ${body.entity ?? "Unknown Entity"}
Jurisdiction: ${body.jurisdiction ?? "Unknown"}
Ownership Structure: ${body.ownershipStructure ?? "Not provided"}
Counterparties: ${body.counterparties ?? "Not provided"}
Commodities/Products: ${body.commodities ?? "Not provided"}
Transaction Summary: ${body.transactions ?? "Not provided"}

Conduct a comprehensive sanctions evasion risk assessment. Identify all evasion patterns, calculate risk score, and provide immediate action recommendations.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SanctionsEvasionResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "sanctions-evasion temporarily unavailable - please retry." }, { status: 503 });
  }
}
