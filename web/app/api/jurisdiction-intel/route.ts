import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  country: string;
  context?: string;
}

interface SanctionsExposure {
  uae: string;
  un: string;
  ofac: string;
  eu: string;
  uk: string;
}

interface JurisdictionIntelResult {
  countryName: string;
  overallRisk: "critical" | "high" | "medium" | "low";
  fatfStatus: string;
  fatfDetail: string;
  sanctionsExposure: SanctionsExposure;
  cahraStatus: string;
  keyRisks: string[];
  dpmsSpecificRisks: string[];
  typologiesPrevalent: string[];
  cddImplications: string;
  transactionRisks: string;
  recentDevelopments: string;
  uaeRegulatoryRequirement: string;
  riskMitigation: string[];
}

const FALLBACK: JurisdictionIntelResult = {
  countryName: "country",
  overallRisk: "medium",
  fatfStatus: "AI analysis unavailable.",
  fatfDetail: "",
  sanctionsExposure: { uae: "", un: "", ofac: "", eu: "", uk: "" },
  cahraStatus: "",
  keyRisks: [],
  dpmsSpecificRisks: [],
  typologiesPrevalent: [],
  cddImplications: "",
  transactionRisks: "",
  recentDevelopments: "",
  uaeRegulatoryRequirement: "",
  riskMitigation: [],
};

const SYSTEM_PROMPT = `You are a UAE AML/CFT geopolitical intelligence analyst specializing in jurisdiction risk assessment for DPMS/VASP entities. Provide a comprehensive intelligence brief covering FATF status, sanctions regimes, typology risks, and UAE-specific regulatory implications for this jurisdiction.

Output ONLY valid JSON, no markdown fences, in this exact shape:
{
  "countryName": "string",
  "overallRisk": "critical" | "high" | "medium" | "low",
  "fatfStatus": "string — e.g. 'FATF Grey List (since 2022)', 'FATF Black List', 'FATF Member - compliant', 'Non-member'",
  "fatfDetail": "string — specific FATF mutual evaluation findings",
  "sanctionsExposure": {
    "uae": "string — UAE Cabinet Resolution 134/2025 / MOFA designations",
    "un": "string — UN Security Council sanctions",
    "ofac": "string — US OFAC exposure",
    "eu": "string — EU sanctions",
    "uk": "string — UK OFSI sanctions"
  },
  "cahraStatus": "string — Conflict-Affected and High-Risk Area assessment",
  "keyRisks": ["string array — top ML/TF/PF risks for this jurisdiction"],
  "dpmsSpecificRisks": ["string array — risks specific to gold/precious metals/DPMS sector"],
  "typologiesPrevalent": ["string array — common ML typologies in this jurisdiction"],
  "cddImplications": "string — what enhanced CDD measures are required for clients from this country",
  "transactionRisks": "string — specific risks for transactions involving this jurisdiction",
  "recentDevelopments": "string — any recent regulatory changes, enforcement actions, or typology alerts",
  "uaeRegulatoryRequirement": "string — specific UAE FDL/MoE requirements for this jurisdiction",
  "riskMitigation": ["string array — specific mitigating controls recommended"]
}`;

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

  if (!body?.country?.trim()) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400 });
  }

  const lines: string[] = [`Country: ${body.country.trim()}`];
  if (body.context) lines.push(`Exposure context: ${body.context.slice(0, 300)}`);

  const userContent = `${lines.join("\n")}\n\nProvide a comprehensive jurisdiction intelligence brief and output the structured JSON.`;

  let result: JurisdictionIntelResult;

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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
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
    result = JSON.parse(cleaned) as JurisdictionIntelResult;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to generate jurisdiction intel",
      },
      { status: 502 },
    );
  }

  try {
    writeAuditEvent("analyst", "jurisdiction.ai-intelligence", body.country.trim());
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
