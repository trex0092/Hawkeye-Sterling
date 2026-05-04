import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  subject: string;
  country: string;
  counterpartyName?: string;
  counterpartyCountry?: string;
  transactionType?: string;
  amount?: number;
  currency?: string;
  ownershipChain?: string;
  bankingRelationships?: string;
  jurisdiction?: string;
  context?: string;
}

interface IndirectRisk {
  riskType: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  sanctionsRegime: string;
  regulatoryBasis: string;
}

interface SanctionsNexusResult {
  directExposure: "none" | "possible" | "likely" | "confirmed";
  indirectExposure: "none" | "possible" | "likely" | "confirmed";
  overallSanctionsRisk: "critical" | "high" | "medium" | "low" | "clear";
  exposureNarrative: string;
  directRisks: string[];
  indirectRisks: IndirectRisk[];
  jurisdictionalExposure: string[];
  fiftyPercentRuleApplicable: boolean;
  fiftyPercentAnalysis: string;
  recommendedAction: "block" | "escalate_to_mlro" | "enhanced_dd" | "file_str" | "monitor" | "clear";
  requiredChecks: string[];
  regulatoryBasis: string;
}

const FALLBACK: SanctionsNexusResult = {
  directExposure: "none",
  indirectExposure: "possible",
  overallSanctionsRisk: "medium",
  exposureNarrative: "API key not configured — manual review required.",
  directRisks: [],
  indirectRisks: [],
  jurisdictionalExposure: [],
  fiftyPercentRuleApplicable: false,
  fiftyPercentAnalysis: "",
  recommendedAction: "enhanced_dd",
  requiredChecks: ["Manual sanctions review required"],
  regulatoryBasis: "",
};

const SYSTEM_PROMPT = `You are a UAE AML/CFT sanctions compliance specialist with deep expertise in OFAC, UN, EU, UK, and UAE sanctions regimes. Assess indirect sanctions exposure beyond direct name hits — including beneficial ownership chains, jurisdiction-based exposure, correspondent banking risks, and 50% ownership rule applications under FATF R.6 and UAE Cabinet Resolution 134/2025.

Output ONLY valid JSON (no markdown, no fences) in this exact shape:
{
  "directExposure": "none" | "possible" | "likely" | "confirmed",
  "indirectExposure": "none" | "possible" | "likely" | "confirmed",
  "overallSanctionsRisk": "critical" | "high" | "medium" | "low" | "clear",
  "exposureNarrative": "string — comprehensive sanctions exposure assessment",
  "directRisks": ["string array — direct name/entity match risks"],
  "indirectRisks": [
    {
      "riskType": "string — e.g. '50% Ownership Rule', 'Jurisdiction Nexus', 'Correspondent Bank', 'Beneficial Owner'",
      "description": "string",
      "severity": "critical" | "high" | "medium" | "low",
      "sanctionsRegime": "string — OFAC/UN/EU/UAE/UK etc",
      "regulatoryBasis": "string"
    }
  ],
  "jurisdictionalExposure": ["string array — sanctioned jurisdictions in the transaction chain"],
  "fiftyPercentRuleApplicable": boolean,
  "fiftyPercentAnalysis": "string — if applicable, explain the ownership chain and 50% rule application",
  "recommendedAction": "block" | "escalate_to_mlro" | "enhanced_dd" | "file_str" | "monitor" | "clear",
  "requiredChecks": ["string array — specific additional screening steps"],
  "regulatoryBasis": "string — Cabinet Resolution 134/2025, OFAC guidance, etc"
}`;

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "sanctions-indirect temporarily unavailable - please retry." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const subject = body?.subject?.trim();
  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
  }

  const parts: string[] = [
    `Subject: ${subject}`,
    `Country: ${body.country?.trim() ?? "unknown"}`,
  ];
  if (body.counterpartyName?.trim()) parts.push(`Counterparty: ${body.counterpartyName.trim()}`);
  if (body.counterpartyCountry?.trim()) parts.push(`Counterparty Country: ${body.counterpartyCountry.trim()}`);
  if (body.transactionType?.trim()) parts.push(`Transaction Type: ${body.transactionType.trim()}`);
  if (body.amount != null) parts.push(`Amount: ${body.amount}${body.currency ? ` ${body.currency}` : ""}`);
  if (body.ownershipChain?.trim()) parts.push(`Ownership Chain: ${body.ownershipChain.trim()}`);
  if (body.bankingRelationships?.trim()) parts.push(`Banking Relationships: ${body.bankingRelationships.trim()}`);
  if (body.jurisdiction?.trim()) parts.push(`Jurisdiction: ${body.jurisdiction.trim()}`);
  if (body.context?.trim()) parts.push(`Additional Context: ${body.context.trim()}`);

  const userContent = [
    ...parts,
    "",
    "Assess the indirect sanctions exposure for this subject and transaction, reasoning about all possible indirect vectors including ownership chains, jurisdiction nexus, correspondent banking, and the 50% ownership rule.",
  ].join("\n");

  let result: SanctionsNexusResult;

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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      console.error("[sanctions-indirect] Anthropic API error", res.status);
      return NextResponse.json({ ok: false, error: "sanctions-indirect temporarily unavailable - please retry." }, { status: 503 });
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const raw = data?.content?.[0]?.text ?? "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      result = JSON.parse(cleaned) as SanctionsNexusResult;
    } catch {
      console.error("[sanctions-indirect] failed to parse AI response");
      return NextResponse.json({ ok: false, error: "sanctions-indirect temporarily unavailable - please retry." }, { status: 503 });
    }
  } catch (err) {
    console.error("[sanctions-indirect] fetch failed", err);
    return NextResponse.json({ ok: false, error: "sanctions-indirect temporarily unavailable - please retry." }, { status: 503 });
  }

  try {
    writeAuditEvent("mlro", "sanctions.ai-indirect-exposure", subject);
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
