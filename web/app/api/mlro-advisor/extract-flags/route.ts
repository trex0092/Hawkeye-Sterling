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

function ruleBasedExtract(text: string): ExtractFlagsResult {
  const t = text.toLowerCase();
  const flags: Flag[] = [];
  if (/structur|smurfing|just.below|threshold|aed.5[0-4]/.test(t))
    flags.push({ indicator: "Transactions near reporting threshold", category: "structuring", severity: "high", fatfReference: "FATF R.20, Interpretive Note", uaeReference: "FDL Art.18(1)(a), MoE Circular 08/2021", actionRequired: "Review transaction pattern; consider STR if structuring confirmed" });
  if (/sanction|ofac|sdn|un.1267|eu.cfsp|eocn|freeze|designated/.test(t))
    flags.push({ indicator: "Sanctions / watchlist exposure", category: "sanctions", severity: "critical", fatfReference: "FATF R.6, R.7", uaeReference: "FDL Art.19, Cabinet Res 134/2025 Art.6", actionRequired: "Immediate freeze and STR filing required" });
  if (/pep|politic|minister|government|official/.test(t))
    flags.push({ indicator: "Politically exposed person (PEP) indicators", category: "pep", severity: "high", fatfReference: "FATF R.12", uaeReference: "FDL Art.12, CBUAE Guidelines 2021", actionRequired: "Apply enhanced due diligence; senior management approval required" });
  if (/terror|extremi|isis|al.qaeda|daesh|tf\b|terrorist.financ/.test(t))
    flags.push({ indicator: "Terrorist financing indicators", category: "proliferation", severity: "critical", fatfReference: "FATF R.5, R.8", uaeReference: "Federal Law 7/2014, FDL Art.20", actionRequired: "Immediate STR and goAML filing; freeze pending investigation" });
  if (/shell|nominee|beneficial.own|layering|offshore|complex.structure/.test(t))
    flags.push({ indicator: "Opaque ownership / layering indicators", category: "layering", severity: "high", fatfReference: "FATF R.24, R.25", uaeReference: "FDL Art.14, Cabinet Res 58/2020", actionRequired: "Obtain UBO documentation; escalate if ownership cannot be verified" });
  if (/crypto|virtual.asset|bitcoin|usdt|tether|defi|wallet/.test(t))
    flags.push({ indicator: "Virtual asset / cryptocurrency exposure", category: "other", severity: "high", fatfReference: "FATF R.15, Guidance on VASPs 2021", uaeReference: "VARA Regulations 2023, CBUAE VASP Rules", actionRequired: "Apply VASP-specific EDD; verify travel rule compliance" });
  if (/gold|precious|jewel|diamond|metal|dpms/.test(t))
    flags.push({ indicator: "Precious metals/stones (DPMS) transaction", category: "placement", severity: "medium", fatfReference: "FATF Guidance on DPMS 2008", uaeReference: "MoE Circular 2/2024, FDL Art.4(h)", actionRequired: "Verify cash transaction threshold compliance; file CTR if applicable" });
  if (/adverse|negative.news|fraud|corruption|bribe|money.launder/.test(t))
    flags.push({ indicator: "Adverse media / negative news", category: "adverse_media", severity: "medium", fatfReference: "FATF Guidance on Beneficial Ownership", uaeReference: "CBUAE AML Guidelines 2021", actionRequired: "Document adverse media findings; consider enhanced monitoring" });
  if (flags.length === 0)
    flags.push({ indicator: "General suspicious activity requiring review", category: "other", severity: "medium", fatfReference: "FATF R.20", uaeReference: "FDL Art.18", actionRequired: "MLRO review required to determine appropriate action" });
  const hasCritical = flags.some((f) => f.severity === "critical");
  const hasHigh = flags.some((f) => f.severity === "high");
  const overallRisk: ExtractFlagsResult["overallRisk"] = hasCritical ? "critical" : hasHigh ? "high" : "medium";
  const recommendedDisposition: ExtractFlagsResult["recommendedDisposition"] = hasCritical ? "FILE_STR" : hasHigh ? "ESCALATE" : "ENHANCED_CDD";
  return { flags, overallRisk, recommendedDisposition, summary: `Rule-based analysis: ${flags.length} indicator(s) detected. ${hasCritical ? "Critical risk — immediate action required." : hasHigh ? "High risk — escalation recommended." : "Medium risk — enhanced monitoring required."}` };
}

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
      result = ruleBasedExtract(truncatedText);
    } else {
      const data = (await res.json()) as {
        content?: { type: string; text: string }[];
      };
      const raw = data?.content?.[0]?.text ?? "";
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        result = JSON.parse(cleaned) as ExtractFlagsResult;
      } catch {
        result = ruleBasedExtract(truncatedText);
      }
    }
  } catch {
    result = ruleBasedExtract(truncatedText);
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
