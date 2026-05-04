export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  let body: { customerType: string; riskFactors: string[]; jurisdiction?: string; productTypes?: string[]; context?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { customerType, riskFactors, jurisdiction, productTypes, context } = body;
  if (!customerType?.trim()) {
    return NextResponse.json({ ok: false, error: "customerType required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "edd-questionnaire temporarily unavailable - please retry." }, { status: 503 });
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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Customer Type: ${customerType}
Risk Factors: ${riskFactors.join(", ")}${jurisdiction ? `\nJurisdiction: ${jurisdiction}` : ""}${productTypes?.length ? `\nProducts/Services: ${productTypes.join(", ")}` : ""}${context ? `\nAdditional Context: ${context}` : ""}

Generate the EDD questionnaire.`,
        }],
      }),
    });

    if (!response.ok) return NextResponse.json({ ok: false, error: "edd-questionnaire temporarily unavailable - please retry." }, { status: 503 });

    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as EddQuestionnaire;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "edd-questionnaire temporarily unavailable - please retry." }, { status: 503 });
  }
}
