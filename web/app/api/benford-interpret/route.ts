import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BenfordInterpretBody {
  label: string;
  n: number;
  mad: number;
  chiSquared: number;
  risk: string;
  riskDetail: string;
  flaggedDigits: number[];
  digits: Array<{ digit: number; observedPct: number; expectedPct: number; deviation: number }>;
}

interface BenfordInterpretation {
  interpretation: string;
  financialCrimeIndicators: string[];
  regulatoryRelevance: string;
  confidence: "high" | "medium" | "low";
  recommendedActions: string[];
  mlTypologies: string[];
  verdict: "refer_to_mlro" | "enhanced_review" | "monitor" | "clear";
}

const FALLBACK: BenfordInterpretation = {
  interpretation: "API key not configured",
  financialCrimeIndicators: [],
  regulatoryRelevance: "",
  confidence: "low",
  recommendedActions: [],
  mlTypologies: [],
  verdict: "monitor",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: BenfordInterpretBody;
  try {
    body = (await req.json()) as BenfordInterpretBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  writeAuditEvent(
    "analyst",
    "benford.ai-interpretation",
    `label=${body.label} n=${body.n} mad=${body.mad} risk=${body.risk}`,
  );

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "benford-interpret temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  const madCategory =
    body.mad < 0.006
      ? "close conformity (<0.006)"
      : body.mad < 0.012
        ? "acceptable (0.006–0.012)"
        : body.mad < 0.015
          ? "marginal (0.012–0.015)"
          : "non-conformity (>0.015)";

  const userContent = [
    `Dataset: ${body.label || "Unnamed"}`,
    `Sample size (n): ${body.n}`,
    `MAD: ${body.mad.toFixed(6)} — ${madCategory}`,
    `Chi-squared: ${body.chiSquared.toFixed(4)}`,
    `Risk tier: ${body.risk}`,
    `Risk detail: ${body.riskDetail}`,
    `Flagged digits: ${body.flaggedDigits.length > 0 ? body.flaggedDigits.join(", ") : "none"}`,
    "",
    "Per-digit breakdown:",
    body.digits
      .map(
        (d) =>
          `  Digit ${d.digit}: observed=${d.observedPct.toFixed(2)}%, expected=${d.expectedPct.toFixed(2)}%, deviation=${d.deviation > 0 ? "+" : ""}${d.deviation.toFixed(2)}%`,
      )
      .join("\n"),
    "",
    "Return ONLY valid JSON — no markdown fences, no commentary — matching this exact schema:",
    `{`,
    `  "interpretation": "string — 2-3 sentence plain-language explanation",`,
    `  "financialCrimeIndicators": ["string array — specific ML/fraud patterns suggested"],`,
    `  "regulatoryRelevance": "string — FATF/FDL/MoE framework context",`,
    `  "confidence": "high" | "medium" | "low",`,
    `  "recommendedActions": ["string array — next steps for the compliance officer"],`,
    `  "mlTypologies": ["string array — e.g. 'structuring', 'round-tripping', 'invoice manipulation'"],`,
    `  "verdict": "refer_to_mlro" | "enhanced_review" | "monitor" | "clear"`,
    `}`,
  ].join("\n");

  let result: BenfordInterpretation;
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
        max_tokens: 1500,
        system:
          "You are a UAE AML forensic accountant expert in Benford's Law analysis for financial crime detection. Interpret these statistical results and provide a compliance-focused assessment for the MLRO. MAD interpretation: <0.006 = close conformity, 0.006-0.012 = acceptable, 0.012-0.015 = marginal, >0.015 = nonconformity. Flagged digits: suppression of digit 1 or digit 9 → structuring; elevation of digit 5 → round-number bias; systematic deviation → potential invoice manipulation. Return ONLY valid JSON — no markdown fences, no commentary.",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "benford-interpret temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    result = JSON.parse(stripped) as BenfordInterpretation;
  } catch {
    return NextResponse.json({ ok: false, error: "benford-interpret temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
