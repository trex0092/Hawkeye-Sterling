import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EntityBody {
  name: string;
  alternateNames: string;
  countryOfIncorporation: string;
  tradeLicence: string;
  email: string;
  phone: string;
}

interface ShareholderBody {
  designation: string;
  name: string;
  sharesPct: string;
  kind: string;
  nationality: string;
  pepStatus: string;
  emiratesId: string;
  idNumber: string;
}

interface RequestBody {
  entity: EntityBody;
  shareholders: ShareholderBody[];
}

interface PepExposure {
  detected: boolean;
  pepNames: string[];
  mitigants: string;
}

interface ClientRiskResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  jurisdictionalRisk: string;
  ownershipRisk: string;
  pepExposure: PepExposure;
  cddRequirements: string[];
  eddRequired: boolean;
  eddReason: string;
  enhancedMeasures: string[];
  recommendedAction: "onboard_standard" | "onboard_with_edd" | "refer_to_mlro" | "reject" | "pending_docs";
  regulatoryBasis: string;
  riskRating: string;
}

const FALLBACK: ClientRiskResult = {
  overallRisk: "medium",
  riskNarrative: "API key not configured — manual assessment required.",
  jurisdictionalRisk: "",
  ownershipRisk: "",
  pepExposure: { detected: false, pepNames: [], mitigants: "" },
  cddRequirements: [],
  eddRequired: false,
  eddReason: "",
  enhancedMeasures: [],
  recommendedAction: "pending_docs",
  regulatoryBasis: "",
  riskRating: "medium",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const { entity, shareholders } = body;
  if (!entity?.name) {
    return NextResponse.json({ ok: false, error: "entity.name is required" }, { status: 400 , headers: gate.headers});
  }

  try { writeAuditEvent("analyst", "client-portal.ai-risk-assessment", entity.name); }
  catch (err) { console.warn("[hawkeye] client-risk writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "client-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system:
          "You are a UAE AML/CFT compliance analyst specializing in entity onboarding and CDD risk assessment for licensed DPMS/VASP under FDL 10/2025 Art.10, Cabinet Decision 58/2020, and FATF Recommendation 10. Assess this entity onboarding submission for ML/FT risk. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Entity: ${JSON.stringify(entity)}. Shareholders: ${JSON.stringify(shareholders)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low", "riskNarrative": "string", "jurisdictionalRisk": "string", "ownershipRisk": "string", "pepExposure": { "detected": boolean, "pepNames": ["string"], "mitigants": "string" }, "cddRequirements": ["string"], "eddRequired": boolean, "eddReason": "string", "enhancedMeasures": ["string"], "recommendedAction": "onboard_standard"|"onboard_with_edd"|"refer_to_mlro"|"reject"|"pending_docs", "regulatoryBasis": "string", "riskRating": "string" }`,
          },
        ],
      });

    }

    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as ClientRiskResult;
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "client-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
