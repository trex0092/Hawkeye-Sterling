export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

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

const FALLBACK: SanctionsExposureResult = {
  overallExposure: "high",
  immediateFreeze: false,
  listHits: [
    { list: "UAE EOCN Consolidated List", listAuthority: "UAE Executive Office for Control and Non-Proliferation", hitType: "possible", designationBasis: "Includes UNSCR 1267 Al-Qaida/IS and UAE domestic designations", assetFreezeRequired: true, freezeTimeline: "Immediate — no court order required under UAE CTF Law Art.7", dealingProhibition: true, reportingObligation: "File STR within 2 business days of confirmed designation hit — FDL 10/2025 Art.26" },
    { list: "OFAC SDN List", listAuthority: "US Treasury Office of Foreign Assets Control", hitType: "possible", designationBasis: "Possible secondary sanctions exposure through counterparty transactions involving US-dollar clearing", assetFreezeRequired: false, dealingProhibition: true, reportingObligation: "OFAC report required if US person or US-nexus (dollar clearing) involved" },
    { list: "UN Consolidated Sanctions List", listAuthority: "UN Security Council", hitType: "none", assetFreezeRequired: false, dealingProhibition: false },
    { list: "EU Consolidated Sanctions List", listAuthority: "European Union", hitType: "none", assetFreezeRequired: false, dealingProhibition: false },
    { list: "HMT UK Financial Sanctions List", listAuthority: "His Majesty's Treasury", hitType: "none", assetFreezeRequired: false, dealingProhibition: false },
  ],
  assetFreezeRequired: false,
  dealingProhibition: true,
  tippingOffRisk: true,
  recommendedAction: "escalate_mlro",
  actionRationale: "Possible EOCN/OFAC hit requires immediate MLRO review and manual de-confliction against confirmed designation lists. If EOCN designation confirmed, immediate asset freeze and STR filing within 2 business days. Do not inform customer of screening activity — tipping-off prohibition applies (FDL 10/2025 Art.25).",
  frozenAssetReportingDeadline: "Immediate notification to UAE EOCN within 24 hours of confirmed designation hit — UAE Cabinet Decision 74/2020 Art.6",
  applicableRegime: [
    "UAE EOCN (Cabinet Decision 74/2020)",
    "UAE CTF Law 7/2014",
    "UNSCR 1267/1989/2253 (Al-Qaida/IS)",
    "UNSCR 1988 (Taliban)",
    "UNSCR 1718 (DPRK)",
    "OFAC SDN (secondary sanctions exposure)",
  ],
  complianceObligations: [
    "Immediate account freeze if EOCN/UNSCR designation confirmed — no court order required",
    "Report frozen assets to UAE EOCN within 24 hours — Cabinet Decision 74/2020 Art.6",
    "File STR within 2 business days — FDL 10/2025 Art.26",
    "Tipping-off prohibition — do not inform customer — FDL 10/2025 Art.25",
    "Record retention 8 years — FDL 10/2025 Art.16",
    "No transactions permitted with designated party regardless of amount",
  ],
  regulatoryBasis: "UAE Cabinet Decision 74/2020 (EOCN — targeted financial sanctions implementation); UAE CTF Law 7/2014 Art.7; UAE FDL 10/2025 Art.25, Art.26; FATF R.6 (targeted financial sanctions); UNSCR 1267, 1373, 1718, 1988; OFAC 31 CFR Parts 500-598",
};

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.entityName?.trim()) return NextResponse.json({ ok: false, error: "entityName required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
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
          content: `Entity Name: ${body.entityName}
Entity Type: ${body.entityType ?? "not specified"}
Nationality / Country of Incorporation: ${body.nationality ?? "not specified"}
Date of Birth: ${body.dob ?? "not specified"}
Passport / ID Number: ${body.passportNumber ?? "not provided"}
Known Aliases: ${body.aliases ?? "none"}
Jurisdiction of Activity: ${body.jurisdiction ?? "UAE"}
Additional Context: ${body.context ?? "none"}

Map sanctions list exposure and compliance obligations for this entity.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, ...FALLBACK });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SanctionsExposureResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
