import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UboEntry {
  name: string;
  dob: string;
  nationality: string;
  gender: string;
  ownershipPct: string;
  role: string;
}

interface RequestBody {
  entity: string;
  registered: string;
  ubos: UboEntry[];
}

interface UboRiskResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  ownershipStructureRisk: string;
  pepRiskFlags: string[];
  nationalityRisks: string[];
  cddGaps: string[];
  recommendedActions: string[];
  regulatoryBasis: string;
  eddRequired: boolean;
  sanctionsScreeningRequired: boolean;
}

const FALLBACK: UboRiskResult = {
  overallRisk: "medium",
  riskNarrative: "API key not configured — manual review required.",
  ownershipStructureRisk: "",
  pepRiskFlags: [],
  nationalityRisks: [],
  cddGaps: [],
  recommendedActions: [],
  regulatoryBasis: "",
  eddRequired: false,
  sanctionsScreeningRequired: false,
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { entity, registered, ubos } = body;

  try { writeAuditEvent("analyst", "ubo.ai-risk-assessment", entity); } catch { /* non-fatal */ }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }

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
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT specialist in beneficial ownership and UBO risk assessment under FDL 10/2025 Art.10 and Cabinet Decision 58/2020. Assess this UBO declaration for money laundering risk, PEP exposure, ownership structure concerns, and CDD gaps. Output JSON (ONLY valid JSON, no markdown).",
        messages: [
          {
            role: "user",
            content: `Entity: ${entity}. Registered in: ${registered}. UBOs: ${JSON.stringify(ubos)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low", "riskNarrative": "string", "ownershipStructureRisk": "string", "pepRiskFlags": ["string"], "nationalityRisks": ["string"], "cddGaps": ["string"], "recommendedActions": ["string"], "regulatoryBasis": "string", "eddRequired": boolean, "sanctionsScreeningRequired": boolean }`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: true, ...FALLBACK });
    }

    const data = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as UboRiskResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
