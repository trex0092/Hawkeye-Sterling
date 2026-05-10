import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

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
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body.narrative?.trim()) {
    return NextResponse.json({ ok: false, error: "narrative is required" }, { status: 400 });
  }

  writeAuditEvent(
    "mlro",
    "goaml.ai-narrative-validated",
    `reportCode=${body.reportCode} subject=${body.subjectName}`,
  );

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "goaml-validate-ai temporarily unavailable - please retry." }, { status: 503 });
  }

  const userContent = [
    `Report code: ${body.reportCode}`,
    `Subject name: ${body.subjectName}`,
    `Subject entity type: ${body.subjectEntityType}`,
    body.amountAed ? `Amount (AED): ${body.amountAed}` : null,
    "",
    "Narrative to validate:",
    body.narrative,
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:
          "You are a UAE FIU goAML submission quality reviewer. Check whether this STR/SAR narrative meets all requirements under FDL 10/2025 Art.26, FATF R.20, and goAML submission standards. A valid narrative must answer Who/What/When/Where/Why, document the specific suspicion, avoid tipping-off language, and include enough detail for the FIU to act. Return ONLY valid JSON — no markdown fences, no commentary.",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "goaml-validate-ai temporarily unavailable - please retry." }, { status: 503 });
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    result = JSON.parse(stripped) as ValidationResult;
  } catch {
    return NextResponse.json({ ok: false, error: "goaml-validate-ai temporarily unavailable - please retry." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, ...result });
}
