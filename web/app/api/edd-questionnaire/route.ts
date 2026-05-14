export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface EddQuestion {
  id: string;
  category: string;
  question: string;
  rationale: string;
  regulatoryBasis: string;
  mandatory: boolean;
  followUp?: string;
}

export interface EddQuestionnaire {
  eddLevel: "standard" | "enhanced" | "intensive";
  eddBasis: string;
  totalQuestions: number;
  mandatoryCount: number;
  categories: string[];
  questions: EddQuestion[];
  documentationRequired: string[];
  seniorApprovalRequired: boolean;
  reviewFrequency: string;
  regulatoryBasis: string;
}

const FALLBACK: EddQuestionnaire = {
  eddLevel: "enhanced",
  eddBasis: "PEP exposure / High-risk jurisdiction / DPMS gold trader — EDD mandatory under FDL 10/2025 Art.13",
  totalQuestions: 12,
  mandatoryCount: 8,
  categories: ["Identity & Ownership", "Source of Funds", "Business Purpose", "PEP Declarations", "Sanctions"],
  questions: [
    { id: "1", category: "Identity & Ownership", question: "Provide certified UBO declaration identifying all beneficial owners holding ≥25% (FATF threshold) or ≥25% effective control.", rationale: "Beneficial ownership verification mandatory for all DPMS clients.", regulatoryBasis: "FDL 10/2025 Art.8; Cabinet Resolution 134/2025 §3.2", mandatory: true, followUp: "For each UBO: passport copy, proof of address, source of wealth." },
    { id: "2", category: "Source of Funds", question: "Provide documentary evidence of the source of funds for all transactions (e.g., audited accounts, bank statements, trade invoices).", rationale: "SoF verification mandatory for DPMS high-risk clients.", regulatoryBasis: "FDL 10/2025 Art.11; FATF R.10", mandatory: true },
    { id: "3", category: "Source of Funds", question: "Explain the origin of the physical gold or precious metals — mine of origin, chain of custody, and RMAP/LBMA certification status.", rationale: "Conflict minerals risk under OECD CAHRA 5-step guidance.", regulatoryBasis: "OECD CAHRA Step 3; LBMA RGG; RMI RMAP", mandatory: true },
    { id: "4", category: "Business Purpose", question: "Describe the nature of business and primary revenue-generating activities including geographic markets served.", rationale: "Business relationship purpose documented for AML risk assessment.", regulatoryBasis: "FDL 10/2025 Art.8(1)(c)", mandatory: true },
    { id: "5", category: "PEP Declarations", question: "Confirm whether the entity or any UBO, director, or senior officer is a Politically Exposed Person (PEP) or a family member / close associate of a PEP.", rationale: "PEP screening is mandatory and triggers EDD per FATF R.12.", regulatoryBasis: "FATF R.12; FDL 10/2025 Art.10", mandatory: true },
    { id: "6", category: "Sanctions", question: "Confirm that none of the UBOs, counterparties, or correspondent relationships are subject to UAE EOCN, UN, US OFAC, EU, or UK OFSI sanctions.", rationale: "Sanctions nexus check required before onboarding.", regulatoryBasis: "FDL 10/2025 Art.14; EOCN Cabinet Decision 74/2020", mandatory: true },
    { id: "7", category: "Identity & Ownership", question: "Provide corporate structure chart showing all layers of ownership up to the ultimate parent and all entities with >10% shareholding.", rationale: "Complex structures may indicate layering risk.", regulatoryBasis: "FDL 10/2025 Art.8; FATF R.24", mandatory: true },
    { id: "8", category: "Business Purpose", question: "Provide last 3 years of audited financial statements or tax filings to evidence business scale and financial position.", rationale: "Expected transaction volumes must be proportionate to stated business.", regulatoryBasis: "FDL 10/2025 Art.8(1)(d)", mandatory: true },
  ],
  documentationRequired: [
    "Certified UBO declaration (notarised)",
    "Passport copies for all UBOs and directors",
    "Proof of registered address (utility bill / bank statement, <3 months)",
    "Certificate of incorporation and constitutional documents",
    "Audited financial statements (3 years)",
    "Bank reference letter",
    "RMAP/LBMA/CMRT certificates (if applicable)",
    "Trade licence / regulatory licence",
  ],
  seniorApprovalRequired: true,
  reviewFrequency: "Annual, or immediately upon material change in risk profile",
  regulatoryBasis: "FDL 10/2025 Art.10, Art.13; Cabinet Resolution 134/2025; FATF R.10, R.12",
};

const LEVEL_RANK: Record<"standard" | "enhanced" | "intensive", number> = { standard: 0, enhanced: 1, intensive: 2 };

function maxLevel(
  a: "standard" | "enhanced" | "intensive",
  b: "standard" | "enhanced" | "intensive",
): "standard" | "enhanced" | "intensive" {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

interface SuperBrainSignals {
  pep?: { tier?: string; type?: string; salience?: number } | null;
  screen?: { topScore?: number } | null;
  jurisdiction?: { cahra?: boolean; name?: string; iso2?: string } | null;
  typologies?: { compositeScore?: number } | null;
  adverseMediaScored?: { severity?: string; compositeScore?: number } | null;
  composite?: { score?: number } | null;
}

function deriveEddContext(sb: SuperBrainSignals): { eddLevel: "standard" | "enhanced" | "intensive"; riskSignals: string[] } {
  const signals: string[] = [];
  let level: "standard" | "enhanced" | "intensive" = "standard";

  const pepTier = sb.pep?.tier ?? "";
  if (pepTier === "T1") { signals.push(`PEP Tier 1 (${sb.pep?.type ?? "senior official"})`); level = "intensive"; }
  else if (pepTier === "T2" || pepTier === "T3") { signals.push(`PEP Tier ${pepTier}`); level = maxLevel(level, "enhanced"); }

  const topScore = sb.screen?.topScore ?? 0;
  if (topScore >= 80) { signals.push(`Sanctions match score ${topScore}/100`); level = "intensive"; }
  else if (topScore >= 50) { signals.push(`Possible sanctions match score ${topScore}/100`); level = maxLevel(level, "enhanced"); }

  if (sb.jurisdiction?.cahra) { signals.push(`CAHRA jurisdiction: ${sb.jurisdiction.name ?? sb.jurisdiction.iso2 ?? "unknown"}`); level = "intensive"; }

  const typScore = sb.typologies?.compositeScore ?? 0;
  if (typScore >= 0.7) { signals.push(`High typology composite score ${Math.round(typScore * 100)}%`); level = "intensive"; }
  else if (typScore >= 0.4) { signals.push(`Moderate typology composite score ${Math.round(typScore * 100)}%`); level = maxLevel(level, "enhanced"); }

  const amSev = sb.adverseMediaScored?.severity;
  if (amSev === "critical") { signals.push("Critical adverse media severity"); level = "intensive"; }
  else if (amSev === "high") { signals.push("High adverse media severity"); level = maxLevel(level, "enhanced"); }

  const composite = sb.composite?.score ?? 0;
  if (composite >= 75 && level === "standard") { signals.push(`Composite risk score ${composite}/100`); level = "enhanced"; }

  return { eddLevel: level, riskSignals: signals };
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerType: string;
    riskFactors: string[];
    jurisdiction?: string;
    productTypes?: string[];
    context?: string;
    superBrainResult?: SuperBrainSignals;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  const { customerType, riskFactors, jurisdiction, productTypes, context, superBrainResult } = body;
  const sbContext = superBrainResult ? deriveEddContext(superBrainResult) : null;
  if (!customerType?.trim()) {
    return NextResponse.json({ ok: false, error: "customerType required" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    const fallback = { ...FALLBACK, ...(sbContext ? { eddLevel: sbContext.eddLevel, eddBasis: `${sbContext.eddLevel.toUpperCase()} EDD — screening signals: ${sbContext.riskSignals.join("; ") || "none"}` } : {}) };
    return NextResponse.json({ ok: true, degraded: true, ...fallback }, { headers: gate.headers });
  }

  const systemPrompt = `You are a UAE AML/CFT compliance expert generating tailored Enhanced Due Diligence (EDD) questionnaires for a UAE-licensed DPMS (gold trader / precious metals dealer) operating under FDL 10/2025 and supervised by MoE.

Generate a comprehensive, regulatory-grade EDD questionnaire specific to the customer profile provided. Questions must be:
- Actionable and specific (not generic)
- Grounded in UAE/FATF regulatory obligations
- Organised by category (Identity & Ownership, Source of Funds, Source of Wealth, Business Purpose, PEP Declarations, Sanctions & Restrictions, Trade Finance / Supply Chain, Transaction Patterns, Adverse Media)
- Each question includes: the question itself, why it's asked (rationale), regulatory basis, whether mandatory, and optional follow-up prompt

Respond ONLY with valid JSON — no markdown fences, no explanation:
{
  "eddLevel": "standard"|"enhanced"|"intensive",
  "eddBasis": "<one-sentence basis for this EDD level>",
  "totalQuestions": <number>,
  "mandatoryCount": <number>,
  "categories": ["<category>"],
  "questions": [
    {
      "id": "<n>",
      "category": "<category>",
      "question": "<full question text>",
      "rationale": "<why this is asked — AML grounding>",
      "regulatoryBasis": "<UAE/FATF citation>",
      "mandatory": <true|false>,
      "followUp": "<optional follow-up prompt>"
    }
  ],
  "documentationRequired": ["<document>"],
  "seniorApprovalRequired": <true|false>,
  "reviewFrequency": "<e.g. annual / quarterly>",
  "regulatoryBasis": "<full citation list>"
}

Generate 10–15 questions. Be specific to the UAE gold/DPMS context and the customer profile.`;

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Customer Type: ${customerType}
Risk Factors: ${riskFactors.join(", ")}${jurisdiction ? `\nJurisdiction: ${jurisdiction}` : ""}${productTypes?.length ? `\nProducts/Services: ${productTypes.join(", ")}` : ""}${context ? `\nAdditional Context: ${context}` : ""}${sbContext?.riskSignals.length ? `\nScreening Risk Signals (from super-brain): ${sbContext.riskSignals.join("; ")}` : ""}${sbContext ? `\nRecommended EDD Level (from screening): ${sbContext.eddLevel.toUpperCase()}` : ""}

Generate the EDD questionnaire. ${sbContext?.eddLevel === "intensive" ? "This subject has INTENSIVE EDD indicators — include all mandatory questions plus additional deep-dive questions on each risk signal identified." : sbContext?.eddLevel === "enhanced" ? "This subject has ENHANCED EDD indicators — include all mandatory questions and tailor additional questions to the specific risk signals identified." : ""}`,
        }],
      });


    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as EddQuestionnaire;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "edd-questionnaire temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
