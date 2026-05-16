import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ValidateBody {
  narrative: string;
  reportCode: string;
  subjectName: string;
  subjectEntityType: string;
  amountAed?: string;
}

interface ValidationResult {
  score: number;
  grade: "PASS" | "CONDITIONAL_PASS" | "FAIL";
  missingElements: string[];
  tippingOffRisk: boolean;
  tippingOffFlags: string[];
  suggestions: string[];
  fatalIssues: string[];
  fiuReadiness: string;
}

const FALLBACK: ValidationResult = {
  score: 0,
  grade: "FAIL",
  missingElements: ["API key not configured"],
  tippingOffRisk: false,
  tippingOffFlags: [],
  suggestions: [],
  fatalIssues: ["Manual review required"],
  fiuReadiness: "Cannot assess",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ValidateBody;
  try {
    body = (await req.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.narrative?.trim()) {
    return NextResponse.json({ ok: false, error: "narrative is required" }, { status: 400 , headers: gate.headers });
  }
  if (body.narrative.length > 10_000) {
    return NextResponse.json({ ok: false, error: "narrative exceeds 10,000-character limit" }, { status: 400, headers: gate.headers });
  }

  writeAuditEvent(
    "mlro",
    "goaml.ai-narrative-validated",
    `reportCode=${body.reportCode} subject=${body.subjectName}`,
  );

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "goaml-validate-ai temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  const userContent = [
    `Report code: ${sanitizeField(body.reportCode, 50)}`,
    `Subject name: ${sanitizeField(body.subjectName, 500)}`,
    `Subject entity type: ${sanitizeField(body.subjectEntityType, 50)}`,
    body.amountAed ? `Amount (AED): ${sanitizeField(body.amountAed, 50)}` : null,
    "",
    "Narrative to validate:",
    sanitizeText(body.narrative, 10000),
    "",
    "Return ONLY valid JSON matching this exact schema (score ≥75 → PASS, ≥50 → CONDITIONAL_PASS, <50 → FAIL):",
    `{`,
    `  "score": 0-100,`,
    `  "grade": "PASS" | "CONDITIONAL_PASS" | "FAIL",`,
    `  "missingElements": ["string"],`,
    `  "tippingOffRisk": boolean,`,
    `  "tippingOffFlags": ["string"],`,
    `  "suggestions": ["string"],`,
    `  "fatalIssues": ["string"],`,
    `  "fiuReadiness": "string"`,
    `}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  let result: ValidationResult;
  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system:
          "You are a UAE FIU goAML submission quality reviewer. Check whether this STR/SAR narrative meets all requirements under FDL 10/2025 Art.26, FATF R.20, and goAML submission standards. A valid narrative must answer Who/What/When/Where/Why, document the specific suspicion, avoid tipping-off language, and include enough detail for the FIU to act. Return ONLY valid JSON — no markdown fences, no commentary.",
        messages: [{ role: "user", content: userContent }],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    result = JSON.parse(stripped) as ValidationResult;
    if (!Array.isArray(result.missingElements)) result.missingElements = [];
    if (!Array.isArray(result.suggestions)) result.suggestions = [];
    if (!Array.isArray(result.fatalIssues)) result.fatalIssues = [];
  } catch {
    return NextResponse.json({ ok: false, error: "goaml-validate-ai temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
