export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface SanctionsListHit {
  list: string;
  listAuthority: string;
  hitType: "confirmed" | "possible" | "name_match" | "none";
  designationDate?: string;
  designationBasis?: string;
  assetFreezeRequired: boolean;
  freezeTimeline?: string;
  dealingProhibition: boolean;
  reportingObligation?: string;
}

export interface SanctionsExposureResult {
  overallExposure: "confirmed_hit" | "high" | "medium" | "low" | "none";
  immediateFreeze: boolean;
  freezeBasis?: string;
  listHits: SanctionsListHit[];
  assetFreezeRequired: boolean;
  dealingProhibition: boolean;
  tippingOffRisk: boolean;
  recommendedAction: "freeze_immediately" | "file_str" | "escalate_mlro" | "enhanced_screening" | "clear";
  actionRationale: string;
  frozenAssetReportingDeadline?: string;
  applicableRegime: string[];
  complianceObligations: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName: string;
    entityType?: string;
    nationality?: string;
    dob?: string;
    passportNumber?: string;
    aliases?: string;
    jurisdiction?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.entityName?.trim()) return NextResponse.json({ ok: false, error: "entityName required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "sanctions-exposure-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1300,
        system: `You are a UAE sanctions compliance specialist mapping multi-list exposure for a named entity. Analyse exposure across all major sanctions lists and produce a structured compliance output.

Lists to assess:
1. UAE EOCN — Executive Office for Control and Non-Proliferation (implements UNSCR 1267/1988 + UAE domestic designations)
   - Immediate freeze, no court order, report frozen assets within 24h — Cabinet Decision 74/2020
2. UN Consolidated Sanctions List — UNSCR 1267 (Al-Qaida/IS), 1988 (Taliban), 1718 (DPRK), 1737 (Iran), 1970 (Libya), 1591 (Sudan), 1572 (Côte d'Ivoire), 2048 (Guinea-Bissau)
3. OFAC SDN — US Treasury; also OFAC sector/country programs (IRAN, DPRK, RUSSIA, CUBA, VENEZUELA, SYRIA, UKRAINE-EO13685)
   - Secondary sanctions risk even without US nexus for correspondent banking
4. EU Consolidated List — includes sectoral Russia/Belarus/Iran/North Korea measures
5. HMT UK Financial Sanctions List — post-Brexit autonomous UK sanctions
6. DFAT Australia — Australian autonomous sanctions
7. UAE Cabinet Decision 59/2024 (domestic UAE designations, separate from EOCN)

Key rules:
- EOCN/UN hit = immediate freeze, no delay, no court order — UAE CTF Law Art.7
- OFAC SDN = US persons and USD transactions prohibited; secondary sanctions risk
- Tipping off prohibited — FDL 10/2025 Art.25
- STR within 2 business days of confirmed hit — FDL 10/2025 Art.26

Note: You are assessing RISK AND OBLIGATION — not conducting a live database search. Assess based on the entity's profile and provide guidance on compliance obligations.

Respond ONLY with valid JSON — no markdown fences matching SanctionsExposureResult interface.`,
        messages: [{
          role: "user",
          content: `Entity Name: ${sanitizeField(body.entityName, 500)}
Entity Type: ${sanitizeField(body.entityType, 100) ?? "not specified"}
Nationality / Country of Incorporation: ${sanitizeField(body.nationality, 100) ?? "not specified"}
Date of Birth: ${sanitizeField(body.dob, 50) ?? "not specified"}
Passport / ID Number: ${sanitizeField(body.passportNumber, 100) ?? "not provided"}
Known Aliases: ${sanitizeText(body.aliases, 1000) ?? "none"}
Jurisdiction of Activity: ${sanitizeField(body.jurisdiction, 100) ?? "UAE"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Map sanctions list exposure and compliance obligations for this entity.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SanctionsExposureResult;
    if (!Array.isArray(result.listHits)) result.listHits = [];
    if (!Array.isArray(result.applicableRegime)) result.applicableRegime = [];
    if (!Array.isArray(result.complianceObligations)) result.complianceObligations = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "sanctions-exposure-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
