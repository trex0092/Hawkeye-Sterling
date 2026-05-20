export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface EddChecklistResult {
  documents: Array<{ item: string; regulatoryBasis: string }>;
  questions: Array<{ item: string; regulatoryBasis: string }>;
  verifications: Array<{ item: string; regulatoryBasis: string }>;
  redFlagsToMonitor: Array<{ item: string; regulatoryBasis: string }>;
  estimatedDays: number;
}


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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "cdd-review/edd-checklist temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
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

Client Name: ${sanitizeField(body.clientName, 200) || "Undisclosed"}
Client Type: ${sanitizeField(body.clientType, 100) || "Individual"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "UAE"}
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
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "cdd-review/edd-checklist temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
