export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface TypologyResult {
  id: string;
  name: string;
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
- Diamond and gemstone TBML
- Crude oil and petroleum TBML
- Pharmaceutical TBML
- Textile and garment sector TBML

## REAL ESTATE MONEY LAUNDERING
- All-cash purchases to avoid bank scrutiny
- Use of shell companies and SPVs to purchase property
- PEP-linked real estate transactions
- Rapid buy-sell of properties at inflated prices
- Mortgage fraud and over-valuation
- Real estate as collateral for loans
- Commercial real estate layering
- Offshore property holding structures
- Dubai luxury property ML (common typology in UAE)
- Rent-back arrangements for cash injection
- Construction project over-invoicing
- Property management company front
- Title deed manipulation

## PROFESSIONAL MONEY LAUNDERING NETWORKS (PMLN)
- Complicit lawyers and legal professionals
- Accountant-facilitated ML through client accounts
- Estate agent networks for property ML
- Company formation agent abuse
- Trust and company service provider (TCSP) networks
- Gatekeepers enabling complex ML structures
- TBML facilitated by freight forwarders
- Money mule recruitment and management
- Professional enablers in high-risk jurisdictions

## CRYPTOCURRENCY AND VIRTUAL ASSET ML
- Bitcoin tumbling and mixing services
- Peer-to-peer exchange exploitation
- Unregulated crypto exchange use
- Privacy coin (Monero, Zcash) layering
- DeFi protocol exploitation for layering
- NFT wash trading and price manipulation
- NFT ML through artificial value inflation
- Crypto ATM structuring and smurfing
- Crypto lending and margin trading ML
- Exchange hopping across jurisdictions
- Ransomware proceeds laundering
- Dark web marketplace proceeds
- Crypto-to-crypto swaps avoiding KYC
- Cross-chain bridge exploitation
- Play-to-earn game exploitation for ML

## CASINO AND GAMING ML
- Casino chip purchase and redemption
- Online gaming account exploitation
- Sports betting structuring
- Poker tournament proceeds
- Casino junket arrangements
- VIP room cash-to-chip conversion
- Slot machine ML (buy-in with cash, collect winnings)
- Casino loan-back schemes
- Online casino multi-account layering

## INSURANCE FRAUD AND ML
- Life insurance policy purchase with illicit funds
- Premium payment with criminal proceeds
- Policy loan exploitation
- Surrender value extraction
- Insurance company capture
- Annuity and pension product ML
- Marine insurance fraud (vessel over-valuation)
- Trade credit insurance fraud

## HAWALA AND INFORMAL VALUE TRANSFER
- Classic hawala networks (Middle East, South Asia)
- Fei-ch'ien (Chinese flying money)
- Hundi systems (South Asian)
- Digital hawala through mobile payments
- Hybrid hawala-crypto systems
- Commodity-based value transfer
- Gold-based hawala in UAE
- Unregistered money remittance operators
- Hawala networks financing terrorism

## STRUCTURING AND SMURFING
- Classic smurfing below reporting thresholds
- Multiple account structuring
- Cash structuring across multiple financial institutions
- Time-based structuring (spreading over days/weeks)
- Geographic structuring across branches
- Currency exchange structuring
- Wire transfer structuring
- Reverse structuring (withdrawals below thresholds)
- Structuring using money mules

## LAYERING THROUGH SHELL COMPANIES
- British Virgin Islands (BVI) shell company chains
- Panama shell companies (post-Panama Papers)
- UAE offshore company structures
- Delaware LLC exploitation
- Nominee director and shareholder arrangements
- Circular ownership structures
- Layered trust arrangements
- Orphan structures with no identifiable UBO
- Foundation-based layering
- Partnership and LP structures for ML

## LOAN-BACK SCHEMES
- Self-lending through offshore entity
- False loan documentation to justify cash
- Back-to-back loan arrangements
- Mortgage fraud for placement
- Property loan-back using inflated collateral
- Director loans from controlled entities
- Loan repayment as placement mechanism

## MIRROR TRADING
- Deutsche Bank-style mirror trading
- Stock exchange mirror trading
- FX mirror trading (buy in one currency, sell in another)
- Bond mirror trading across jurisdictions
- Commodity futures mirror trading

## CARBON CREDIT FRAUD
- Phantom carbon credit creation
- Double-counting of carbon offsets
- Carousel fraud using carbon credits
- Carbon market price manipulation
- False certification of green projects
- Nature-based solution fraud
- Voluntary carbon market manipulation

## SANCTIONS EVASION TYPOLOGIES
- Front company networks for sanctioned parties
- Jurisdiction layering to obscure origin
- Name variation and transliteration exploitation
- Bulk cash smuggling to avoid sanctions
- Correspondent banking exploitation
- Oil-for-goods sanctions evasion (North Korea, Iran)
- Ship-to-ship transfers in international waters
- Flag hopping and vessel identity fraud
- Petroleum sector sanctions evasion
- Precious metals used for sanctions evasion
- Crypto used for DPRK sanctions evasion
- Third-country intermediary use

## CORPORATE FRAUD ML
- Round-tripping through related party transactions
- Transfer pricing manipulation
- Ponzi and pyramid scheme proceeds
- Corporate account takeover
- Invoice fraud (CEO/BEC fraud proceeds)
- Fictitious employee payroll ML
- Expense account manipulation
- Corporate credit card abuse ML
- Dividend stripping and tax fraud ML

## CASH-INTENSIVE BUSINESS ML
- Restaurant and food service cash ML
- Car wash and parking ML
- Retail business cash commingling
- Construction company cash payments
- Night club and entertainment venue ML
- Taxi and ride-share cash ML
- Market stall and bazaar cash ML
- UAE gold souk cash transactions

## DIGITAL PAYMENT AND FINTECH ML
- E-wallet exploitation and mule accounts
- Payment processor exploitation
- BNPL (buy now pay later) fraud
- Mobile payment structuring
- Prepaid card layering
- Digital bank account farming
- KYC arbitrage across digital platforms

## HUMAN TRAFFICKING PROCEEDS ML
- Escort/sex work proceeds commingling
- Labor trafficking wage theft ML
- Shell service companies for HT proceeds
- Property purchased with HT proceeds
- Cash-intensive business fronts for HT

## DRUG TRAFFICKING PROCEEDS ML
- Bulk cash conversion
- Cocaine proceeds through Latin American structures
- Heroin proceeds through South Asian hawala
- Cannabis dispensary proceeds (legal gray market)
- Synthetic drug (fentanyl) proceeds
- Cryptocurrency used for drug marketplace payments

## TERRORIST FINANCING
- Small-value fundraising across many donors
- Charitable organization exploitation
- Social media fundraising for terrorism
- Crypto crowdfunding for terrorism
- Hawala for terrorist fund movement
- Self-financing through crime
- State-sponsored terrorism financing
- ISIL/Daesh financing typologies

## UAE-SPECIFIC TYPOLOGIES
- DMCC gold trader cash placement
- Dubai real estate PEP purchases
- UAE free zone company misuse
- Emirati nominee arrangements
- Dubai luxury goods (watches, jewelry) ML
- Gold refinery TBML in UAE
- UAE offshore company (RAK ICC, ADGM) misuse
- Precious stones TBML through Dubai
- UAE remittance operator exploitation
- Dubai Expo 2020 contractor fraud
- Camel trade invoicing manipulation

## EMERGING TYPOLOGIES
- Deepfake KYC bypass
- AI-generated synthetic identity ML
- Metaverse property and asset ML
- Social token and fan token ML
- Decentralized exchange (DEX) exploitation
- Cross-border CBDC ML risks
- IoT device payment exploitation
- Satellite-based communication for ML coordination

Your task is to search this knowledge base and return the most relevant typologies matching the user's query and filters. For each typology, provide comprehensive detail including red flags, detection methods, real-world examples, and regulatory references.

Return ONLY valid JSON (no markdown fences) matching the exact structure requested.
`;

const FALLBACK: TypologySearchResponse = {
  results: [
    {
      id: "TBML-001",
      name: "Over-Invoicing of Goods",
      category: "Trade-Based Money Laundering",
      description:
        "A trade-based money laundering technique where the price of goods or services on an invoice is intentionally inflated above their true market value. The excess payment transfers value from the buyer's country to the seller's country, allowing illicit funds to be integrated into the trade finance system.",
      redFlags: [
        "Invoice price significantly above or below market price for similar goods",
        "Transactions with high-risk or sanctioned counterparties",
        "Frequent amendments to letters of credit",
        "Shipments routed through third countries without commercial logic",
        "Use of free trade zones with weak oversight",
      ],
      realWorldExample:
        "A UAE-based gold trader invoiced Hong Kong counterpart USD 2.3M for gold bullion worth USD 1.8M. The excess USD 500K represented criminal proceeds from a drug trafficking network. Detected via DMCC trade data cross-referencing.",
      fatfRef: "FATF Report on Trade-Based Money Laundering (2020), Rec. 14",
      riskLevel: "high",
      sectors: ["Trade Finance", "Commodities", "Shipping", "Banking"],
      jurisdictions: ["UAE", "Hong Kong", "Panama", "Singapore"],
      relatedTypologies: ["Under-Invoicing", "Multiple Invoicing", "Phantom Shipments"],
      detectionMethods: [
        "Price benchmarking against market data",
        "Trade data cross-referencing (DP World, DMCC)",
        "STR filing analysis",
        "TBML red flag monitoring",
      ],
      regulatoryResponse:
        "UAE: Report to UAE FIU via goAML. FATF Recommendation 14 requires monitoring of trade finance. CBUAE AML Standards §8 applies to DNFBP trade participants.",
    },
  ],
  totalFound: 1,
  relatedCategories: ["TBML", "Sanctions Evasion", "Shell Companies"],
};

export async function POST(req: Request) {
  let body: {
    query?: string;
    filters?: {
      sector?: string;
      jurisdictionType?: string;
      riskLevel?: string;
      fatfCategory?: string;
    };
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = getAnthropicClient(apiKey);

    const filterStr = body.filters
      ? `Filters: sector=${body.filters.sector ?? "any"}, jurisdiction=${body.filters.jurisdictionType ?? "any"}, riskLevel=${body.filters.riskLevel ?? "any"}, fatfCategory=${body.filters.fatfCategory ?? "any"}`
      : "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text:
            TYPOLOGY_KNOWLEDGE_BASE +
            `\n\nReturn ONLY valid JSON with this exact structure (no markdown fences):\n{\n  "results": [\n    {\n      "id": "CATEGORY-NNN",\n      "name": "string",\n      "category": "string",\n      "description": "string",\n      "redFlags": ["string"],\n      "realWorldExample": "string",\n      "fatfRef": "string",\n      "riskLevel": "low"|"medium"|"high"|"critical",\n      "sectors": ["string"],\n      "jurisdictions": ["string"],\n      "relatedTypologies": ["string"],\n      "detectionMethods": ["string"],\n      "regulatoryResponse": "string"\n    }\n  ],\n  "totalFound": number,\n  "relatedCategories": ["string"]\n}\n\nReturn 5-10 most relevant typologies. Be comprehensive and expert-level.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Search query: "${body.query ?? ""}"
${filterStr}

Find the most relevant AML/CFT typologies matching this search. Return comprehensive detail for each typology.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TypologySearchResponse;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
