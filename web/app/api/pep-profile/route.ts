export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface PepProfileResult {
  ok: true;
  pepTier: "tier1" | "tier2" | "tier3" | "rca";
  riskScore: number;
  politicalExposure: {
    current: boolean;
    positions: string[];
    powerLevel: string;
  };
  networkMap: Array<{
    name: string;
    relationship: string;
    riskLevel: string;
  }>;
  sourceOfWealthAssessment: {
    plausibility: string;
    gaps: string[];
    redFlags: string[];
  };
  assetDisclosureRisk: string;
  adverseMediaSummary: string;
  sanctionsExposure: {
    listed: boolean;
    details: string[];
  };
  requiredMeasures: string[];
  reviewFrequency: "annual" | "semi_annual" | "quarterly" | "monthly";
  recommendation: "accept_standard" | "accept_enhanced" | "senior_approval" | "decline";
  summary: string;
}

const FALLBACK: PepProfileResult = {
  ok: true,
  pepTier: "tier1",
  riskScore: 82,
  politicalExposure: {
    current: true,
    positions: ["Minister of Finance", "Chairman — National Investment Authority"],
    powerLevel: "High — cabinet-level authority with direct control over state procurement and sovereign wealth allocation",
  },
  networkMap: [
    { name: "Ahmed Al-Rashidi (brother)", relationship: "Sibling", riskLevel: "high" },
    { name: "Meridian Holdings LLC", relationship: "Spouse-controlled entity", riskLevel: "high" },
    { name: "Global Bridge Partners", relationship: "Business associate — state contracts", riskLevel: "medium" },
    { name: "Dr. Fatima Noor", relationship: "Former chief of staff", riskLevel: "medium" },
  ],
  sourceOfWealthAssessment: {
    plausibility: "Partially plausible — declared salary and real estate income is consistent with senior public office; however, declared equity holdings (USD 8.4M) significantly exceed projected accumulation from salary over stated tenure.",
    gaps: [
      "No explanation provided for USD 8.4M equity portfolio on a ministerial salary of approx. USD 180,000 p.a.",
      "Three offshore holding structures in Cayman Islands and BVI not explained in declaration.",
      "No documented inheritance or prior private-sector income to explain asset base.",
    ],
    redFlags: [
      "Equity holdings 46x annual public salary with no plausible accumulation pathway.",
      "Spouse-linked entity received three state contracts during subject's tenure totalling USD 34M.",
      "Offshore structures registered during period of public office.",
    ],
  },
  assetDisclosureRisk: "High — declared assets are materially inconsistent with public-sector income; unexplained wealth indicators are present. Enhanced asset verification required before account acceptance.",
  adverseMediaSummary: "Two investigative journalism articles (2022, 2024) referencing procurement irregularities in infrastructure contracts. No formal charges. Subject publicly denied allegations. OCCRP database contains one entity cross-reference. No convictions.",
  sanctionsExposure: {
    listed: false,
    details: [
      "Not listed on OFAC SDN, EU Consolidated List, UN Sanctions List, or CBUAE UAE Sanctions List.",
      "Close associate Ahmed Al-Rashidi: not listed but flagged in FinCEN advisory 2023-06 for shell company activity.",
    ],
  },
  requiredMeasures: [
    "Senior Management approval required prior to onboarding (FDL 10/2025 Art.14, FATF R.12).",
    "Source of wealth verification — obtain and verify documentary evidence for equity portfolio and offshore structures.",
    "Enhanced due diligence — full beneficial ownership mapping of all associated entities.",
    "Ongoing monitoring — monthly transaction review with automated alert thresholds.",
    "Adverse media screening — quarterly refresh with expanded coverage including OCCRP and Transparency International.",
    "Annual EDD review with Board Risk Committee sign-off.",
    "Obtain written declaration of all positions held and associated entities.",
  ],
  reviewFrequency: "monthly",
  recommendation: "senior_approval",
  summary: "Subject is a Tier-1 PEP (serving cabinet minister) with a risk score of 82/100. The primary concerns are unexplained wealth (equity holdings 46x annual salary), spouse-linked entity receiving state contracts during tenure, and offshore holding structures with no declared business rationale. Adverse media references procurement irregularities without formal charges. Senior Management approval is required under FDL 10/2025 Art.14 before any account relationship is established. Comprehensive source of wealth verification and enhanced due diligence must be completed prior to onboarding.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    name?: string;
    country?: string;
    position?: string;
    organization?: string;
    politicalParty?: string;
    yearsInOffice?: string | number;
    familyMembers?: string;
    sourceOfWealth?: string;
    declaredAssets?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  // ── World-Check lookup (LSEG Refinitiv) — grounded PEP data ─────────────
  // Query World-Check before Claude so the LLM prompt contains real database
  // hits rather than relying solely on training-data knowledge.
  let worldCheckContext = "World-Check Database: not configured";
  const wcKey = process.env["LSEG_WORLDCHECK_API_KEY"];
  const wcSecret = process.env["LSEG_WORLDCHECK_API_SECRET"];
  const wcAuth = wcKey
    ? (wcSecret ? `Basic ${Buffer.from(`${wcKey}:${wcSecret}`).toString("base64")}` : `Bearer ${wcKey}`)
    : null;
  if (wcAuth && body.name?.trim()) {
    try {
      const wcRes = await fetch("https://api-worldcheck.refinitiv.com/v2/cases", {
        method: "POST",
        headers: {
          Authorization: wcAuth,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          name: body.name.trim(),
          entityType: "INDIVIDUAL",
          providerTypes: ["PEP", "WATCHLIST", "SANCTIONS", "ADVERSE_MEDIA"],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (wcRes.ok) {
        const wcData = (await wcRes.json()) as {
          results?: Array<{
            name?: string;
            categories?: string[];
            providers?: string[];
            countryLinks?: string[];
            dateOfBirth?: string;
          }>;
        };
        const hits = wcData.results ?? [];
        if (hits.length > 0) {
          worldCheckContext = `World-Check Database Hits (${hits.length} match${hits.length > 1 ? "es" : ""}):\n` +
            hits.slice(0, 5).map((h) =>
              `- ${h.name ?? "Unknown"} | Categories: ${(h.categories ?? []).join(", ")} | Providers: ${(h.providers ?? []).join(", ")} | Countries: ${(h.countryLinks ?? []).join(", ")}`,
            ).join("\n");
        } else {
          worldCheckContext = "World-Check Database: no matches found for this individual";
        }
      } else {
        worldCheckContext = `World-Check Database: query failed (HTTP ${wcRes.status})`;
      }
    } catch (err) {
      console.warn("[pep-profile] world-check lookup failed:", err instanceof Error ? err.message : err);
      worldCheckContext = "World-Check Database: temporarily unavailable";
    }
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({
    ...FALLBACK,
    simulationWarning: "ANTHROPIC_API_KEY not configured — this is a simulated template, NOT a real PEP assessment. All names, positions, figures, and flags are illustrative examples only. Obtain a real AI-generated assessment before making any compliance decisions.",
  }, { status: 200, headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are a specialist AML analyst focused on Politically Exposed Person (PEP) risk assessment under FATF Recommendation 12, UAE FDL 10/2025 Art.14, and CBUAE AML Standards. Analyse PEP profile data and produce a comprehensive risk assessment. Apply FATF PEP tier definitions: Tier 1 = heads of state/government, senior ministers, senior military/judiciary/central bank officials; Tier 2 = senior regional/municipal officials, senior party officials, senior executives of SOEs; Tier 3 = mid-level officials, lower-ranking officials; RCA = relative or close associate of a PEP. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "pepTier": "tier1"|"tier2"|"tier3"|"rca",
  "riskScore": number (0-100),
  "politicalExposure": {
    "current": boolean,
    "positions": ["string"],
    "powerLevel": "string"
  },
  "networkMap": [{"name":"string","relationship":"string","riskLevel":"string"}],
  "sourceOfWealthAssessment": {
    "plausibility": "string",
    "gaps": ["string"],
    "redFlags": ["string"]
  },
  "assetDisclosureRisk": "string",
  "adverseMediaSummary": "string",
  "sanctionsExposure": {
    "listed": boolean,
    "details": ["string"]
  },
  "requiredMeasures": ["string"],
  "reviewFrequency": "annual"|"semi_annual"|"quarterly"|"monthly",
  "recommendation": "accept_standard"|"accept_enhanced"|"senior_approval"|"decline",
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `PEP Profile Assessment Request:

Name: ${body.name ?? "Unknown"}
Country: ${body.country ?? "Not specified"}
Position: ${body.position ?? "Not specified"}
Organization: ${body.organization ?? "Not specified"}
Political Party: ${body.politicalParty ?? "Not specified"}
Years in Office: ${body.yearsInOffice ?? "Not specified"}
Family Members / Known Associates: ${body.familyMembers ?? "None declared"}
Source of Wealth: ${body.sourceOfWealth ?? "Not declared"}
Declared Assets: ${body.declaredAssets ?? "Not declared"}

${worldCheckContext}

Perform a comprehensive PEP risk assessment grounded in the World-Check data above. Classify tier, assess source of wealth plausibility, map the political network, identify all risk factors, and provide required AML measures per FATF R.12 and UAE FDL 10/2025 Art.14.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PepProfileResult;
    return NextResponse.json({ ...result, worldCheckGrounded: !!wcKey }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pep-profile temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
