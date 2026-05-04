import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Transaction {
  id: string;
  ref: string;
  counterparty: string;
  amount: string;
  currency: string;
  channel: string;
  direction: string;
  counterpartyCountry: string;
  behaviouralFlags: string[];
  notes: string;
}

interface Body {
  transaction: Transaction;
}

interface ExplanationResult {
  explanation: string;
  disposition: "dismiss" | "monitor" | "escalate" | "report";
  dispositionReason: string;
  regulatoryBasis: string;
  typologies: string[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      explanation: "API key not configured",
      disposition: "monitor",
      dispositionReason: "Manual review required",
      regulatoryBasis: "",
      typologies: [],
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const t = body?.transaction;
  if (!t?.id || !t?.ref) {
    return NextResponse.json(
      { ok: false, error: "transaction.id and ref are required" },
      { status: 400 },
    );
  }

  const flagCount = t.behaviouralFlags.length;
  const dispositionHint =
    flagCount === 0
      ? "lean toward dismiss or monitor"
      : flagCount > 2
        ? "lean toward escalate"
        : "consider monitor or escalate";

  const userContent = [
    `Transaction ref: ${t.ref}`,
    `Counterparty: ${t.counterparty}`,
    t.counterpartyCountry ? `Counterparty country: ${t.counterpartyCountry}` : null,
    `Amount: ${t.currency} ${t.amount}`,
    `Channel: ${t.channel}`,
    `Direction: ${t.direction}`,
    flagCount > 0 ? `Behavioural flags (${flagCount}): ${t.behaviouralFlags.join(", ")}` : `Behavioural flags: none`,
    t.notes ? `Analyst notes: ${t.notes}` : null,
    `Disposition hint: ${dispositionHint}`,
  ]
    .filter(Boolean)
    .join("\n");

  let result: ExplanationResult;
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
        max_tokens: 500,
        system:
          'You are a UAE DPMS transaction monitoring analyst. You are analyzing a single financial transaction for a UAE-licensed DPMS/VASP under MoE Circular 08/AML/2021 and FATF Rec. 20. Explain in plain English WHY this transaction fired compliance alerts, what specific typologies are present (e.g. structuring, rapid in-out, third-party payment), and recommend a disposition: dismiss (no concern), monitor (watch for pattern), escalate (internal MLRO review needed), or report (STR/SAR should be filed). Be concise — max 3 sentences for explanation. Return ONLY this JSON: { "explanation": "string", "disposition": "dismiss"|"monitor"|"escalate"|"report", "dispositionReason": "string", "regulatoryBasis": "string", "typologies": ["string"] }',
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: true,
        explanation: "AI explanation unavailable — manual review required.",
        disposition: "monitor" as const,
        dispositionReason: "Manual review required",
        regulatoryBasis: "",
        typologies: [],
      });
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    result = JSON.parse(stripped) as ExplanationResult;
  } catch {
    return NextResponse.json({
      ok: true,
      explanation: "AI explanation unavailable — manual review required.",
      disposition: "monitor" as const,
      dispositionReason: "Manual review required",
      regulatoryBasis: "",
      typologies: [],
    });
  }

  try {
    writeAuditEvent("analyst", "tm.explain", `${t.ref} → ${result.disposition}`);
  } catch { /* non-blocking */ }

  return NextResponse.json({
    ok: true,
    explanation: result.explanation,
    disposition: result.disposition,
    dispositionReason: result.dispositionReason,
    regulatoryBasis: result.regulatoryBasis,
    typologies: result.typologies,
  });
}
