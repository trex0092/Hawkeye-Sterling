export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { assessCorrespondentBank } from "@/lib/intelligence/correspondent-bank";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

// ── LLM-based result type (existing) ─────────────────────────────────────────
export interface CorrespondentBankResult {
  riskRating: "critical" | "high" | "medium" | "low";
  kycStatus: "pass" | "conditional" | "fail";
  amlProgrammeAssessment: string;
  shellBankRisk: boolean;
  payableThrough: boolean;
  requiredEnhancements: string[];
  regulatoryBasis: string;
}

// ── BIC-based scoring handler ─────────────────────────────────────────────────
//
// POST { bic: string }        → single BIC assessment (static scoring)
// POST { bics: string[] }     → batch BIC assessments (max 20)
//
// Falls through to the LLM-based route when neither bic nor bics is present.

function isBicRequest(body: unknown): body is { bic: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "bic" in body &&
    typeof (body as Record<string, unknown>)["bic"] === "string" &&
    !("bics" in body) &&
    !("bankName" in body)
  );
}

function isBicBatchRequest(body: unknown): body is { bics: string[] } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b["bics"]) &&
    (b["bics"] as unknown[]).every((x) => typeof x === "string")
  );
}

export async function POST(req: Request) {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  // ── BIC batch ──────────────────────────────────────────────────────────────
  if (isBicBatchRequest(body)) {
    const { bics } = body;
    if (bics.length === 0) {
      return NextResponse.json(
        { ok: false, error: "bics array must not be empty" },
        { status: 400, headers: gate.headers }
      );
    }
    if (bics.length > 20) {
      return NextResponse.json(
        { ok: false, error: "batch limit exceeded — max 20 BICs per request" },
        { status: 400, headers: gate.headers }
      );
    }
    const results = bics.map((bic) => assessCorrespondentBank(bic));
    return NextResponse.json(
      { ok: true, count: results.length, results },
      { headers: gate.headers }
    );
  }

  // ── Single BIC ─────────────────────────────────────────────────────────────
  if (isBicRequest(body)) {
    const result = assessCorrespondentBank(body.bic);
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  }

  // ── LLM-based assessment (existing behaviour) ──────────────────────────────
  const llmBody = body as {
    bankName: string;
    country: string;
    regulatoryBody: string;
    lastKycDate: string;
    amlProgrammeStatus: string;
    context: string;
  };

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey)
    return NextResponse.json(
      { ok: false, error: "correspondent-bank temporarily unavailable - please retry." },
      { status: 503, headers: gate.headers }
    );

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in correspondent banking due diligence under FATF R.13 and UAE Federal Decree-Law No. 10 of 2025. Assess correspondent banking relationships and return a JSON object with exactly these fields: { "riskRating": "critical"|"high"|"medium"|"low", "kycStatus": "pass"|"conditional"|"fail", "amlProgrammeAssessment": string, "shellBankRisk": boolean, "payableThrough": boolean, "requiredEnhancements": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Assess the following correspondent banking relationship:
- Bank Name: ${sanitizeField(llmBody.bankName, 500)}
- Country: ${sanitizeField(llmBody.country, 100)}
- Regulatory Body: ${sanitizeField(llmBody.regulatoryBody, 200)}
- Last KYC Date: ${sanitizeField(llmBody.lastKycDate, 50)}
- AML Programme Status: ${sanitizeField(llmBody.amlProgrammeStatus, 200)}
- Additional Context: ${sanitizeText(llmBody.context, 2000)}`,
        },
      ],
    });
    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return NextResponse.json(
        { ok: false, error: "correspondent-bank temporarily unavailable - please retry." },
        { status: 503, headers: gate.headers }
      );

    const parsed = JSON.parse(jsonMatch[0]) as CorrespondentBankResult;
    if (!Array.isArray(parsed.requiredEnhancements))
      parsed.requiredEnhancements = [];
    void writeAuditChainEntry(
      { event: "correspondent_bank.assessed", actor: gate.keyId, riskRating: parsed.riskRating, kycStatus: parsed.kycStatus, shellBankRisk: parsed.shellBankRisk },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn(
      "[hawkeye] route handler failed:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { ok: false, error: "correspondent-bank temporarily unavailable - please retry." },
      { status: 503, headers: gate.headers }
    );
  }
}
