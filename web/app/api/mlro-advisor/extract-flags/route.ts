import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  text: string;
  subjectName?: string;
}

interface Flag {
  indicator: string;
  category:
    | "structuring"
    | "layering"
    | "placement"
    | "pep"
    | "sanctions"
    | "trade_ml"
    | "proliferation"
    | "adverse_media"
    | "ownership_opacity"
    | "jurisdiction_risk"
    | "other";
  severity: "critical" | "high" | "medium" | "low";
  fatfReference: string;
  uaeReference: string;
  actionRequired: string;
}

interface ExtractFlagsResult {
  flags: Flag[];
  overallRisk: "critical" | "high" | "medium" | "low";
  recommendedDisposition: "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR";
  summary: string;
}

const FALLBACK: ExtractFlagsResult = {
  flags: [],
  overallRisk: "low",
  recommendedDisposition: "MONITOR",
  summary: "API key not configured",
};

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body?.text?.trim()) {
    return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  const truncatedText = body.text.trim().slice(0, 3000);
  const subjectLine = body.subjectName?.trim()
    ? `Subject: ${body.subjectName.trim()}\n\n`
    : "";

  const userContent = `${subjectLine}ANALYST NOTES:\n${truncatedText}\n\nExtract all FATF red flags from the notes above and output the structured JSON.`;

  const systemPrompt = [
    "You are a UAE DPMS/VASP AML analyst extracting structured FATF red flags from compliance case notes. For each red flag you detect, classify it precisely.",
    "",
    "Output ONLY valid JSON in this exact shape:",
    `{
  "flags": [
    {
      "indicator": "string — specific red flag observed e.g. 'Cash transactions just below AED 55,000 threshold'",
      "category": "structuring" | "layering" | "placement" | "pep" | "sanctions" | "trade_ml" | "proliferation" | "adverse_media" | "ownership_opacity" | "jurisdiction_risk" | "other",
      "severity": "critical" | "high" | "medium" | "low",
      "fatfReference": "string — e.g. 'FATF R.20, Interpretive Note para 3'",
      "uaeReference": "string — e.g. 'FDL Art.18(1)(c), MoE Circular 08/2021'",
      "actionRequired": "string — what the MLRO should do about this flag"
    }
  ],
  "overallRisk": "critical" | "high" | "medium" | "low",
  "recommendedDisposition": "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR",
  "summary": "string — 1-sentence summary of the overall risk picture"
}`,
  ].join("\n");

  let result: ExtractFlagsResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Anthropic API error ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const raw = data?.content?.[0]?.text ?? "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    result = JSON.parse(cleaned) as ExtractFlagsResult;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to extract flags",
      },
      { status: 502 },
    );
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.extract-flags",
      `${body.subjectName?.trim() ?? "unknown"} → ${result.flags.length} flag(s), overallRisk: ${result.overallRisk}, disposition: ${result.recommendedDisposition}`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
