export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface EddChecklistResult {
  documents: string[];
  questions: string[];
  verifications: string[];
  redFlagsToMonitor: string[];
  regulatoryBasis: string[];
  estimatedDays: number;
}

const FALLBACK: EddChecklistResult = {
  documents: [
    "Certified copy of valid passport (all pages) and UAE residence visa",
    "Recent utility bill or bank statement (within 3 months) as address proof",
    "Source-of-wealth declaration — signed and notarised",
    "Last 3 years' audited financial statements (corporate) or bank statements (individual)",
    "Corporate: Certificate of Incorporation, Memorandum & Articles of Association, shareholder register",
    "Corporate: Certified UBO register extract showing all beneficial owners ≥25%",
    "PEP: Public declaration of assets, salary slips, or official gazette appointment notice",
    "Adverse media search print-out from at least two independent databases",
  ],
  questions: [
    "What is the primary source of the funds being deposited or transacted through this account?",
    "Can you describe the nature and purpose of your business relationship with us?",
    "What is the expected volume and frequency of transactions on this account?",
    "Do you hold any public function, government role, or appointment as a state-owned enterprise executive?",
    "Have you or any associated entity been subject to regulatory investigation, prosecution, or sanction in the last 5 years?",
    "Who are the ultimate beneficial owners of the funds being transacted?",
    "Are there any third parties who have authority over or interest in the funds in this account?",
  ],
  verifications: [
    "Sanctions screening: OFAC SDN, UN Consolidated, EU, UK HMT, EOCN — all named individuals and entities",
    "PEP screening: World-Check, Refinitiv, or equivalent — first degree associates included",
    "Adverse media: Google News, Dow Jones Factiva, local Arabic-language press",
    "Corporate: Company registry verification in jurisdiction of incorporation",
    "UBO verification: Cross-check UAE MoE UBO Register and DIFC/ADGM entity registers if applicable",
    "Financial: Bank reference letter from principal banker confirming satisfactory conduct",
  ],
  redFlagsToMonitor: [
    "Sudden large cash deposits inconsistent with declared source of wealth",
    "Transactions to or from high-risk or FATF grey-listed jurisdictions",
    "Payments to third parties not disclosed during onboarding",
    "Rapid movement of funds through the account (in-and-out within 24 hours)",
    "New counterparties appearing without advance notification",
    "PEP: Government contracts awarded to entities with ownership links to client",
  ],
  regulatoryBasis: [
    "UAE FDL 10/2025 Art.11 — enhanced CDD obligation for high-risk customers",
    "UAE FDL 10/2025 Art.17 — senior management approval and EDD for PEPs",
    "CBUAE AML Standards §4 — customer due diligence requirements",
    "FATF R.12 — politically exposed persons",
    "FATF R.20 — reporting of suspicious transactions",
  ],
  estimatedDays: 14,
};

export async function POST(req: Request) {
  let body: {
    clientName?: string;
    clientType?: string;
    jurisdiction?: string;
    riskScore?: number;
    sourceOfWealth?: string;
    pep?: boolean;
    adverseMedia?: boolean;
    transactionPatterns?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT Enhanced Due Diligence specialist with deep expertise in UAE Federal Decree-Law 10/2025, CBUAE AML Standards, FATF Recommendations, and DPMS/DNFBP sector EDD requirements. You generate tailored EDD checklists for high-risk customer relationships.

For each EDD checklist request you must provide:
1. Documents to obtain — specific, named documents appropriate to the client type and risk factors.
2. Questions to ask the client — direct, open-ended questions an analyst should ask.
3. Third-party verifications needed — specific databases, registries, and third-party checks required.
4. Red flags to monitor during the ongoing relationship.
5. Regulatory basis — cite the specific article or section of UAE FDL 10/2025, CBUAE AML Standards, or FATF Recommendation for each material requirement (list as strings, one per cited provision).
6. Estimated completion time in business days — realistic estimate based on document complexity and jurisdiction.

Be specific and practical. Tailor the checklist to the exact client type, jurisdiction, risk score, and risk factors provided. For PEPs include Art.17 FDL 10/2025 requirements explicitly. For adverse media hits include enhanced monitoring steps.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "documents": ["string"],
  "questions": ["string"],
  "verifications": ["string"],
  "redFlagsToMonitor": ["string"],
  "regulatoryBasis": ["string"],
  "estimatedDays": number
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate a tailored EDD checklist for the following client:

Client Name: ${body.clientName ?? "Undisclosed"}
Client Type: ${body.clientType ?? "Individual"}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Risk Score: ${body.riskScore ?? 75}/100
Source of Wealth: ${body.sourceOfWealth ?? "Not declared"}
PEP: ${body.pep ? "Yes" : "No"}
Adverse Media Hits: ${body.adverseMedia ? "Yes" : "No"}
Transaction Patterns: ${body.transactionPatterns ?? "Not provided"}

Generate a comprehensive, tailored EDD checklist with documents, client questions, third-party verifications, red flags to monitor, regulatory basis, and estimated completion time.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EddChecklistResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
