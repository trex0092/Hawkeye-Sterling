export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { enforce } from "@/lib/server/enforce";
export interface AssetTracerResult {
  tracingRisk: "critical" | "high" | "medium" | "low";
  tracingStages: Array<{
    stage: number;
    description: string;
    accountsInvolved: string[];
    jurisdictions: string[];
    amountAed: number;
    evidenceType: string;
    legalBasis: string;
  }>;
  assetRecoveryBasis: string;
  confiscationPotential: boolean;
  confiscationBasis?: string;
  internationalCooperationRequired: boolean;
  mutualLegalAssistanceRequired: boolean;
  evidenceGaps: string[];
  investigativeSteps: string[];
  regulatoryBasis: string;
}

const FALLBACK: AssetTracerResult = {
  tracingRisk: "critical",
  tracingStages: [
    {
      stage: 1,
      description: "Cash placement — structured cash deposits across three UAE bank accounts in amounts of AED 45,000–54,900 over 30-day period. Total placed: AED 1,620,000. Deposits made at different branches by multiple individuals (smurfs) matching account holder's known associates.",
      accountsInvolved: ["UAE Account A (subject)", "UAE Account B (associate 1)", "UAE Account C (associate 2)"],
      jurisdictions: ["UAE"],
      amountAed: 1620000,
      evidenceType: "Bank transaction records, CCTV footage at deposit branches, CTR filings with goAML",
      legalBasis: "UAE FDL 10/2025 Art.2 (ML offence); CR 134/2025 Art.14 (CTR obligation)",
    },
    {
      stage: 2,
      description: "Layering — consolidated funds wire transferred from UAE Account A to BVI-registered entity (Al-Baraka Holdings Ltd) within 48 hours of placement completion. Described as 'investment capital' with no supporting investment agreement. Funds then split across two Seychelles shell company accounts within 7 days.",
      accountsInvolved: ["UAE Account A", "BVI Account — Al-Baraka Holdings Ltd", "Seychelles Account X", "Seychelles Account Y"],
      jurisdictions: ["UAE", "British Virgin Islands", "Seychelles"],
      amountAed: 1580000,
      evidenceType: "SWIFT MT103 records, correspondent bank records, MLA request to BVI FSC pending, Seychelles FIU notification sent",
      legalBasis: "UAE Federal Law 4/2002 Art.2; FATF R.3; Egmont Group information sharing",
    },
    {
      stage: 3,
      description: "Secondary layering — AED 820,000 returned from Seychelles Account X to a UAE LLC (Gulf Star General Trading LLC) as a 'loan repayment' — creating an apparent legitimate UAE corporate liability to justify the funds. Remaining AED 760,000 transferred to a Cyprus-registered entity.",
      accountsInvolved: ["Seychelles Account X", "UAE Account — Gulf Star General Trading LLC", "Cyprus Account — Meridian Trade Partners Ltd"],
      jurisdictions: ["Seychelles", "UAE", "Cyprus"],
      amountAed: 1580000,
      evidenceType: "Bank statements, company registry searches (Gulf Star LLC — director is subject's wife), CBUAE UAR order",
      legalBasis: "UAE FDL 10/2025 Art.17; UAE Federal Law 4/2002 Art.8 (asset restraint)",
    },
    {
      stage: 4,
      description: "Integration — AED 780,000 of funds ultimately used to purchase off-plan apartment in Dubai Marina (Emaar development) in name of Gulf Star General Trading LLC. DLD registration completed. Property value has appreciated to estimated AED 1,100,000 at current market.",
      accountsInvolved: ["Gulf Star General Trading LLC operating account", "Developer escrow account (Emaar)", "DLD registration"],
      jurisdictions: ["UAE"],
      amountAed: 780000,
      evidenceType: "DLD title deed records, SPA (sales and purchase agreement), developer payment receipts, Emaar escrow confirmation",
      legalBasis: "UAE Federal Law 4/2002 Art.9 (confiscation); UAE Federal Law 35/1992 Art.42 (criminal proceeds)",
    },
  ],
  assetRecoveryBasis: "Asset recovery proceedings can be initiated under UAE Federal Law 4/2002 (Anti-Money Laundering Law) and UAE Federal Law 35/1992 (Penal Procedures Code). The traced funds satisfy the evidentiary standard of 'proceeds of crime' for the purposes of confiscation. The DLD-registered property constitutes a traceable criminal asset subject to confiscation under Art.9 of Federal Law 4/2002. International asset recovery for the Cyprus-held funds requires MLAT with Cyprus (EU MLAT framework applies).",
  confiscationPotential: true,
  confiscationBasis: "UAE Federal Law 4/2002 Art.9 — confiscation of proceeds, instruments, and property equivalent in value to ML proceeds. The Dubai Marina apartment (registered in Gulf Star General Trading LLC, beneficial owner: subject) is directly traceable to criminal funds and is subject to confiscation order. Estimated confiscable value: AED 1,100,000 (current market value). Restraint order should be sought from Public Prosecution to prevent disposal pending criminal proceedings.",
  internationalCooperationRequired: true,
  mutualLegalAssistanceRequired: true,
  evidenceGaps: [
    "BVI corporate registry records for Al-Baraka Holdings Ltd — MLA request submitted but not yet responded to (estimated 3-6 month timeline)",
    "Seychelles Account Y ultimate disposition — AED 760,000 transferred to Cyprus not yet fully traced",
    "Identity of 'smurfs' conducting cash deposits — CCTV obtained but facial recognition analysis pending",
    "Documentary evidence of predicate offence — investigation into source of original cash (suspected customs fraud) ongoing",
    "Cyprus Meridian Trade Partners Ltd — beneficial owner not yet confirmed; request to Cyprus competent authority required",
  ],
  investigativeSteps: [
    "Obtain restraint/freezing order from UAE Public Prosecution for Dubai Marina property (DLD registration) — priority within 5 days",
    "Submit formal MLAT request to BVI for Al-Baraka Holdings Ltd records and account information",
    "Submit MLAT request to Cyprus for Meridian Trade Partners Ltd account records",
    "Request Seychelles FIU for Account Y transaction records via Egmont Group secure channel",
    "Submit STR to UAE FIU (Central Bank) covering all traced stages with full transaction map",
    "Obtain all UAE bank records via Production Order under Federal Law 35/1992",
    "Analyse Gulf Star General Trading LLC corporate file for full director/shareholder history",
    "Trace predicate offence (customs fraud) through UAE Customs Authority records",
    "Coordinate with INTERPOL Asset Recovery and Money Laundering Unit (ARIS) for international asset tracing",
  ],
  regulatoryBasis: "UAE Federal Law 4/2002 (Anti-Money Laundering and Combating Terrorist Financing); UAE Federal Law 35/1992 (Penal Procedures Code — Art.42 confiscation); UAE FDL 10/2025 Art.17 (STR); UNCAC Art.53-57 (asset recovery); UN Convention against Transnational Organised Crime (UNTOC) Art.12-14; Egmont Group information sharing; FATF R.38 (mutual legal assistance)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    initialFunds: string;
    suspectedSource?: string;
    tracingPeriod?: string;
    subjectName?: string;
    jurisdictions?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.initialFunds?.trim()) return NextResponse.json({ ok: false, error: "initialFunds required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "asset-tracer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE asset tracing and recovery specialist with expertise in UAE Federal Law 4/2002 (Anti-Money Laundering), Federal Law 35/1992 (Penal Procedures), mutual legal assistance treaties (MLATs), confiscation law, and international asset recovery. Trace fund flows through ML stages (placement, layering, integration), identify traceable assets, assess confiscation potential, and outline investigative and MLAT requirements. Reference UAE domestic law, UNCAC asset recovery provisions, and Egmont Group cooperation. Respond ONLY with valid JSON matching the AssetTracerResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Initial Funds Description: ${sanitizeText(body.initialFunds, 2000)}
Suspected Criminal Source: ${sanitizeText(body.suspectedSource ?? "not specified", 2000)}
Tracing Period: ${sanitizeField(body.tracingPeriod ?? "not specified", 100)}
Subject Name: ${sanitizeField(body.subjectName ?? "not identified", 500)}
Jurisdictions Involved: ${sanitizeField(body.jurisdictions ?? "not specified", 500)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Trace these funds through money laundering stages and assess asset recovery potential. Return complete AssetTracerResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as AssetTracerResult;
    if (!Array.isArray(result.tracingStages)) result.tracingStages = [];
    else for (const s of result.tracingStages) { if (!Array.isArray(s.accountsInvolved)) s.accountsInvolved = []; if (!Array.isArray(s.jurisdictions)) s.jurisdictions = []; }
    if (!Array.isArray(result.evidenceGaps)) result.evidenceGaps = [];
    if (!Array.isArray(result.investigativeSteps)) result.investigativeSteps = [];
    return NextResponse.json({ ok: true, ...result , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "asset-tracer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
