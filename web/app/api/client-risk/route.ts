import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

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


export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
    }

  const { entity, shareholders } = body;
  if (!entity?.name) {
    return NextResponse.json({ ok: false, error: "entity.name is required" }, { status: 400 , headers: gate.headers });
  }

  try { writeAuditEvent("analyst", "client-portal.ai-risk-assessment", entity.name); }
  catch (err) { console.warn("[hawkeye] client-risk writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "client-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  const sanitizedEntity = {
    name: sanitizeField(entity.name, 300),
    alternateNames: sanitizeField(entity.alternateNames, 300),
    countryOfIncorporation: sanitizeField(entity.countryOfIncorporation, 100),
    tradeLicence: sanitizeField(entity.tradeLicence, 100),
    email: sanitizeField(entity.email, 200),
    phone: sanitizeField(entity.phone, 50),
  };
  const sanitizedShareholders = shareholders.map((s) => ({
    designation: sanitizeField(s.designation, 100),
    name: sanitizeField(s.name, 300),
    sharesPct: sanitizeField(s.sharesPct, 10),
    kind: sanitizeField(s.kind, 50),
    nationality: sanitizeField(s.nationality, 100),
    pepStatus: sanitizeField(s.pepStatus, 50),
    emiratesId: sanitizeField(s.emiratesId, 50),
    idNumber: sanitizeField(s.idNumber, 100),
  }));

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance analyst specializing in entity onboarding and CDD risk assessment for licensed DPMS/VASP under FDL 10/2025 Art.10, Cabinet Decision 58/2020, and FATF Recommendation 10. Assess this entity onboarding submission for ML/FT risk. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Entity: ${JSON.stringify(sanitizedEntity)}. Shareholders: ${JSON.stringify(sanitizedShareholders)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low", "riskNarrative": "string", "jurisdictionalRisk": "string", "ownershipRisk": "string", "pepExposure": { "detected": boolean, "pepNames": ["string"], "mitigants": "string" }, "cddRequirements": ["string"], "eddRequired": boolean, "eddReason": "string", "enhancedMeasures": ["string"], "recommendedAction": "onboard_standard"|"onboard_with_edd"|"refer_to_mlro"|"reject"|"pending_docs", "regulatoryBasis": "string", "riskRating": "string" }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as ClientRiskResult;
    if (!Array.isArray(parsed.pepExposure?.pepNames)) { if (parsed.pepExposure) parsed.pepExposure.pepNames = []; }
    if (!Array.isArray(parsed.cddRequirements)) parsed.cddRequirements = [];
    if (!Array.isArray(parsed.enhancedMeasures)) parsed.enhancedMeasures = [];
    void writeAuditChainEntry(
      {
        event: "client.risk_assessed",
        actor: gate.keyId,
        overallRisk: parsed.overallRisk,
        recommendedAction: parsed.recommendedAction,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[client-risk] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "client-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
