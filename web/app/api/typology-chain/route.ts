// POST /api/typology-chain
//
// FATF Typology Chain Mapper.
// Given a set of transactions, entities, or a narrative description,
// maps the activity to known FATF money laundering / terrorist financing
// typology patterns and generates a compliance-grade risk narrative.
//
// Coverage:
//   - FATF ML/TF typologies (40 Recommendations basis)
//   - UAE DPMS-specific typologies (gold/precious metals)
//   - Virtual asset / crypto typologies
//   - Trade-based money laundering (TBML)
//   - Real estate ML
//   - Hawala / informal value transfer
//   - Shell company / beneficial owner concealment
//   - Structuring / smurfing
//   - Professional money laundering networks
//
// Regulatory basis: FATF R.29; FDL 10/2025 Art.15

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

interface Transaction {
  date?: string;
  amount?: number;
  currency?: string;
  type?: string;             // cash_in | cash_out | wire | crypto | trade
  counterparty?: string;
  description?: string;
  jurisdiction?: string;
}

interface TypologyChainRequest {
  narrative?: string;          // free-text description of activity
  transactions?: Transaction[];
  entities?: string[];         // entity names involved
  redFlags?: string[];         // operator-observed red flags
  industry?: string;           // dpms | real_estate | vasp | bank | other
  jurisdiction?: string;
}

interface TypologyMatch {
  typologyId: string;
  typologyName: string;
  fatfReference: string;
  confidence: "high" | "medium" | "low";
  matchedIndicators: string[];
  riskRating: "critical" | "high" | "medium" | "low";
  description: string;
  typicalPattern: string;
  uaeSpecificNote?: string;
}

// Static typology library — FATF-derived
const TYPOLOGY_LIBRARY: Array<{
  id: string;
  name: string;
  fatfRef: string;
  keywords: string[];
  dpmsSpecific: boolean;
  description: string;
  pattern: string;
  uaeNote?: string;
}> = [
  {
    id: "TYP-001", name: "Structuring / Smurfing", fatfRef: "FATF R.10",
    keywords: ["structured", "multiple", "threshold", "split", "below", "55000", "aed 50", "just under"],
    dpmsSpecific: true,
    description: "Dividing large cash transactions into smaller amounts to evade CTR reporting thresholds",
    pattern: "Multiple cash transactions below AED 55,000 threshold, same customer, same day or consecutive days, same or related counterparties",
    uaeNote: "UAE CTR threshold is AED 55,000; structuring below this triggers FDL Art.16 + Art.25",
  },
  {
    id: "TYP-002", name: "Trade-Based Money Laundering (TBML)", fatfRef: "FATF R.14",
    keywords: ["invoice", "trade", "under-invoiced", "over-invoiced", "fictitious", "import", "export", "shipment", "cargo"],
    dpmsSpecific: true,
    description: "Using international trade transactions to transfer value and obscure the origin of funds",
    pattern: "Discrepancies between declared and actual shipment values; multiple invoices; precious metals shipped via high-risk jurisdictions",
    uaeNote: "DPMS dealers in UAE must maintain trade documentation under FDL Art.8; OECD Step-5 audit trail required",
  },
  {
    id: "TYP-003", name: "Cash Placement — Gold Purchase", fatfRef: "FATF R.14 + R.10",
    keywords: ["cash", "gold", "purchase", "physical", "bullion", "coins", "scrap", "jewellery"],
    dpmsSpecific: true,
    description: "Large cash purchases of gold/precious metals to convert illegal cash into portable, liquid assets",
    pattern: "High-value cash purchases of gold bullion/coins; customer declines electronic payment; multiple partial payments; no source of wealth",
    uaeNote: "Dubai gold market is a known global ML risk vector; DPMS dealers must apply enhanced CDD per FDL Art.8",
  },
  {
    id: "TYP-004", name: "Hawala / Informal Value Transfer", fatfRef: "FATF R.14 + R.16",
    keywords: ["hawala", "informal", "value transfer", "hundi", "fei-chien", "unregistered", "remittance"],
    dpmsSpecific: false,
    description: "Moving value outside the formal financial system using trusted networks",
    pattern: "Regular transfers to/from countries with active hawala networks; no corresponding wire transfers; cash-intensive counterparties",
    uaeNote: "UAE has a significant hawala sector; unlicensed operators violate UAE Payment Systems Law",
  },
  {
    id: "TYP-005", name: "Shell Company Layering", fatfRef: "FATF R.24",
    keywords: ["shell", "nominee", "beneficial owner", "offshore", "cayman", "bvi", "panama", "bearer"],
    dpmsSpecific: false,
    description: "Using shell companies or nominees to obscure the true beneficial owner of funds",
    pattern: "Corporate structure with multiple offshore layers; nominee directors; no apparent business purpose; accounts in secrecy jurisdictions",
    uaeNote: "UAE requires UBO disclosure per FDL Art.8; failure to identify UBO = AED 100K-500K penalty",
  },
  {
    id: "TYP-006", name: "Crypto-Asset Layering", fatfRef: "FATF R.15",
    keywords: ["crypto", "bitcoin", "ethereum", "usdt", "blockchain", "wallet", "defi", "mixer", "privacy coin"],
    dpmsSpecific: false,
    description: "Using virtual assets to layer criminal proceeds before converting to fiat or physical assets",
    pattern: "Crypto-to-gold conversion; use of mixing services; high-risk VASP counterparties; no KYC on crypto origin",
    uaeNote: "UAE VARA requires VASP registration; cross-border crypto-to-physical-asset conversion is a DPMS red flag",
  },
  {
    id: "TYP-007", name: "Professional Money Laundering Network", fatfRef: "FATF R.22",
    keywords: ["lawyer", "accountant", "notary", "real estate agent", "professional", "facilitator", "dnfbp"],
    dpmsSpecific: false,
    description: "Using gatekeepers (lawyers, accountants, real estate agents) to facilitate ML",
    pattern: "Transactions involving multiple professional intermediaries; complex ownership structures; rapid movement of funds through multiple jurisdictions",
    uaeNote: "DNFBPs (including DPMS) under UAE AML supervision per FDL Art.3",
  },
  {
    id: "TYP-008", name: "Conflict-Mineral Sourcing / CAHRA", fatfRef: "OECD 5-Step",
    keywords: ["drc", "congo", "conflict", "cahra", "artisanal", "asm", "dore", "smuggled", "illicit"],
    dpmsSpecific: true,
    description: "Purchasing gold or minerals sourced from conflict-affected high-risk areas (CAHRA)",
    pattern: "Gold with opaque origin; dore bars from CAHRA countries; no LBMA/RMAP certification; artisanal mining notation",
    uaeNote: "UAE DPMS dealers must comply with OECD 5-Step Guidance and FDL Art.8 supply-chain due diligence",
  },
  {
    id: "TYP-009", name: "Real Estate ML", fatfRef: "FATF R.22",
    keywords: ["property", "real estate", "mortgage", "land", "apartment", "villa", "construction"],
    dpmsSpecific: false,
    description: "Using real estate transactions to launder proceeds of crime",
    pattern: "Cash purchases of high-value property; rapid resale; nominee purchasers; offshore corporate buyers",
    uaeNote: "Dubai real estate is a high-risk ML sector; RERA/DLD require AML compliance",
  },
  {
    id: "TYP-010", name: "PEP Corruption Proceeds", fatfRef: "FATF R.12",
    keywords: ["pep", "politician", "official", "minister", "corruption", "bribe", "kickback", "government contract"],
    dpmsSpecific: false,
    description: "Laundering proceeds of corruption, bribery, or abuse of public office by politically exposed persons",
    pattern: "Unexplained wealth inconsistent with public salary; purchases of luxury goods/gold; offshore accounts; family member nominees",
    uaeNote: "UAE FDL Art.12 mandates enhanced CDD for all PEPs; automatic senior management approval",
  },
];

function detectTypologies(req: TypologyChainRequest): TypologyMatch[] {
  const text = [
    req.narrative ?? "",
    ...(req.redFlags ?? []),
    ...(req.transactions ?? []).map((t) => `${t.type ?? ""} ${t.description ?? ""} ${t.counterparty ?? ""}`),
    ...(req.entities ?? []),
  ].join(" ").toLowerCase();

  const matches: TypologyMatch[] = [];

  for (const typ of TYPOLOGY_LIBRARY) {
    const matched = typ.keywords.filter((kw) => text.includes(kw));
    if (matched.length === 0) continue;

    const confidence: TypologyMatch["confidence"] = matched.length >= 3 ? "high" : matched.length >= 2 ? "medium" : "low";
    const riskRating: TypologyMatch["riskRating"] = confidence === "high" ? "critical" : confidence === "medium" ? "high" : "medium";

    matches.push({
      typologyId: typ.id,
      typologyName: typ.name,
      fatfReference: typ.fatfRef,
      confidence,
      matchedIndicators: matched,
      riskRating,
      description: typ.description,
      typicalPattern: typ.pattern,
      ...(typ.uaeNote ? { uaeSpecificNote: typ.uaeNote } : {}),
    });
  }

  return matches.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.riskRating] - order[b.riskRating];
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: TypologyChainRequest;
  try { body = await req.json() as TypologyChainRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.narrative && (!body.transactions || body.transactions.length === 0) && (!body.redFlags || body.redFlags.length === 0)) {
    return NextResponse.json({ ok: false, error: "Provide narrative, transactions[], or redFlags[]" }, { status: 400, headers: gate.headers });
  }

  const staticMatches = detectTypologies(body);
  const criticalCount = staticMatches.filter((m) => m.riskRating === "critical").length;
  const highCount = staticMatches.filter((m) => m.riskRating === "high").length;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let aiNarrative = "";
  let strTrigger = false;
  let eddRequired = false;
  let typologyChain: string[] = [];

  if (apiKey && staticMatches.length > 0) {
    const client = getAnthropicClient(apiKey, 4_500, "typology-chain");
    try {
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `You are a UAE AML/CFT specialist analysing FATF money laundering typology patterns. Given a typology analysis, determine if STR filing is required, if EDD is required, and construct the most likely ML typology chain. Return JSON: { "strTrigger": bool, "strBasis": "string", "eddRequired": bool, "typologyChain": ["step1", "step2", ...], "narrative": "2-3 sentence compliance narrative", "keyRiskFactor": "string" }`,
        messages: [{
          role: "user",
          content: `Industry: ${sanitizeField(body.industry ?? "dpms", 100)}, Jurisdiction: ${sanitizeField(body.jurisdiction ?? "AE", 100)}
Narrative: ${sanitizeText(body.narrative ?? "Not provided", 2000)}
Red flags: ${sanitizeText((body.redFlags ?? []).join("; ") || "None listed", 1000)}
Matched typologies: ${staticMatches.slice(0, 5).map((m) => `${m.typologyId} ${m.typologyName} (${m.riskRating})`).join(", ")}
Transaction count: ${body.transactions?.length ?? 0}
Determine STR trigger, EDD requirement, typology chain, and risk narrative.`,
        }],
      });
      const raw = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "{}";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      strTrigger = parsed.strTrigger ?? criticalCount > 0;
      eddRequired = parsed.eddRequired ?? highCount > 0;
      typologyChain = Array.isArray(parsed.typologyChain) ? parsed.typologyChain : [];
      aiNarrative = parsed.narrative ?? "";
    } catch { /* non-blocking */ }
  } else {
    strTrigger = criticalCount > 0;
    eddRequired = highCount > 0;
  }

  return NextResponse.json({
    ok: true,
    matchedTypologies: staticMatches.length,
    criticalTypologies: criticalCount,
    highTypologies: highCount,
    strTrigger,
    eddRequired,
    typologyChain,
    matches: staticMatches,
    aiNarrative,
    regulatoryBasis: "FATF 40 Recommendations; FDL 10/2025 Art.15 (STR); Art.8 (EDD); CBUAE AML Standards §9",
    analysedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
