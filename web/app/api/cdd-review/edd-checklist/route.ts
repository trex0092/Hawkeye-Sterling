export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface EddChecklistResult {
  documents: Array<{ item: string; regulatoryBasis: string }>;
  questions: Array<{ item: string; regulatoryBasis: string }>;
  verifications: Array<{ item: string; regulatoryBasis: string }>;
  redFlagsToMonitor: Array<{ item: string; regulatoryBasis: string }>;
  estimatedDays: number;
}

const FALLBACK: EddChecklistResult = {
  documents: [
    { item: "Certified copy of valid passport or national ID", regulatoryBasis: "UAE FDL 10/2025 Art.6" },
    { item: "Proof of residential address (utility bill or bank statement, <3 months)", regulatoryBasis: "UAE FDL 10/2025 Art.6" },
    { item: "Source of wealth declaration — signed and notarised", regulatoryBasis: "CBUAE AML Standards §4.2" },
    { item: "Bank reference letter from a regulated financial institution", regulatoryBasis: "CBUAE AML Standards §4.3" },
    { item: "Tax returns or audited financial statements (last 2 years)", regulatoryBasis: "UAE FDL 10/2025 Art.11" },
    { item: "Corporate registration documents and UBO declaration (if applicable)", regulatoryBasis: "UAE FDL 10/2025 Art.7" },
    { item: "PEP declaration form (signed by client)", regulatoryBasis: "FATF R.12; UAE FDL 10/2025 Art.17" },
  ],
  questions: [
    { item: "What is the primary source of the wealth you are investing/depositing?", regulatoryBasis: "CBUAE AML Standards §4.2" },
    { item: "What is the expected volume and frequency of transactions through this account?", regulatoryBasis: "UAE FDL 10/2025 Art.11" },
    { item: "Do you hold or have you held any public office or government position in the last 5 years?", regulatoryBasis: "FATF R.12" },
    { item: "Are you subject to any ongoing legal proceedings, investigations, or enforcement actions?", regulatoryBasis: "CBUAE AML Standards §4.4" },
    { item: "What is the nature and purpose of this business relationship?", regulatoryBasis: "UAE FDL 10/2025 Art.6" },
    { item: "Do you control or have beneficial interest in any other entities through which funds may be transferred?", regulatoryBasis: "UAE FDL 10/2025 Art.7; FATF R.24" },
  ],
  verifications: [
    { item: "Sanctions screening: OFAC, UN, EU, UK, and EOCN consolidated lists", regulatoryBasis: "UAE FDL 10/2025 Art.14; FATF R.6" },
    { item: "PEP database check: World-Check, Dow Jones Risk & Compliance, or equivalent", regulatoryBasis: "FATF R.12; UAE FDL 10/2025 Art.17" },
    { item: "Adverse media screening: past 5 years, full name variations", regulatoryBasis: "CBUAE AML Standards §4.4" },
    { item: "Company registry verification for all associated corporate entities", regulatoryBasis: "UAE FDL 10/2025 Art.7; FATF R.24" },
    { item: "GLEIF LEI lookup for any entity claiming regulatory status", regulatoryBasis: "FATF R.16; CBUAE AML Standards §5" },
    { item: "Senior management sign-off (Board/CEO level) before relationship approval", regulatoryBasis: "UAE FDL 10/2025 Art.17; CBUAE AML Standards §4.3" },
  ],
  redFlagsToMonitor: [
    { item: "Transactions inconsistent with declared source of wealth or business profile", regulatoryBasis: "UAE FDL 10/2025 Art.15" },
    { item: "Rapid movement of large funds to or from high-risk jurisdictions", regulatoryBasis: "FATF R.16; CBUAE AML Standards §5.2" },
    { item: "Third-party payments without documented commercial rationale", regulatoryBasis: "UAE FDL 10/2025 Art.12" },
    { item: "Structuring of transactions below reporting thresholds (AED 55,000)", regulatoryBasis: "UAE FDL 10/2025 Art.15; MoE Circular 2/2024" },
    { item: "Unexplained changes in transaction patterns or sudden spikes in activity", regulatoryBasis: "CBUAE AML Standards §5.3" },
    { item: "New counterparties in high-risk jurisdictions without business justification", regulatoryBasis: "FATF R.10; CBUAE AML Standards §4.5" },
  ],
  estimatedDays: 14,
};

import { enforce } from "@/lib/server/enforce";

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "cdd-review/edd-checklist temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a UAE AML compliance specialist with expertise in Enhanced Due Diligence (EDD) requirements under UAE FDL 10/2025, CBUAE AML Standards, and FATF Recommendations. Generate tailored EDD checklists for high-risk customers based on their specific profile and risk factors.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "documents": [{"item": "document description", "regulatoryBasis": "specific regulatory citation"}],
  "questions": [{"item": "question to ask client", "regulatoryBasis": "specific regulatory citation"}],
  "verifications": [{"item": "third-party verification task", "regulatoryBasis": "specific regulatory citation"}],
  "redFlagsToMonitor": [{"item": "specific red flag to monitor", "regulatoryBasis": "specific regulatory citation"}],
  "estimatedDays": number
}

Guidelines:
- documents: 5-8 specific documents to obtain, tailored to client type and risk factors
- questions: 5-7 specific questions to ask the client during the EDD interview
- verifications: 4-6 third-party verification tasks (databases, registries, senior approvals)
- redFlagsToMonitor: 4-7 specific ongoing monitoring red flags for this client profile
- estimatedDays: realistic estimate of days to complete the full EDD process (typically 7-21 days)
- regulatoryBasis: always cite specific article/section (e.g. "UAE FDL 10/2025 Art.11", "CBUAE AML Standards §4.3", "FATF R.12")
- Tailor every item to the specific client type, jurisdiction, risk factors, and PEP/adverse media status
- For PEP clients: include Board/CEO sign-off requirement per FDL 10/2025 Art.17
- For VASPs: include blockchain analytics and Travel Rule verification
- For corporate clients: include UBO mapping per FATF R.24/25`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate a tailored EDD checklist for the following client profile:

Client Name: ${body.clientName ?? "Undisclosed"}
Client Type: ${body.clientType ?? "Individual"}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Risk Score: ${body.riskScore ?? 75}/100
Source of Wealth: ${body.sourceOfWealth ?? "Not declared"}
PEP Status: ${body.pep ? "YES — Politically Exposed Person" : "No"}
Adverse Media: ${body.adverseMedia ? "YES — adverse media identified" : "None identified"}
Transaction Patterns: ${body.transactionPatterns ?? "Not specified"}

Generate a comprehensive, tailored EDD checklist with specific documents to obtain, questions to ask, third-party verifications needed, and red flags to monitor. Each item must include the specific regulatory basis.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EddChecklistResult;
    if (!Array.isArray(result.documents)) result.documents = [];
    if (!Array.isArray(result.questions)) result.questions = [];
    if (!Array.isArray(result.verifications)) result.verifications = [];
    if (!Array.isArray(result.redFlagsToMonitor)) result.redFlagsToMonitor = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "cdd-review/edd-checklist temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
