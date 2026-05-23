export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
export interface PepProfileResult {
  ok: true;
  pepTier: "tier1" | "tier2" | "tier3" | "tier4" | "rca";
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
  const _handlerStart = Date.now();
  let gate: Awaited<ReturnType<typeof enforce>> | undefined;
  try {
  gate = await enforce(req);
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  // ── Grounded PEP data — World-Check (LSEG) first, OpenSanctions fallback ──
  // Query an external PEP database before Claude so the LLM prompt contains
  // real database hits rather than relying solely on training-data knowledge.
  // World-Check One has higher fidelity; OpenSanctions is free + open and
  // gives us coverage when the commercial vendor isn't subscribed.
  let pepDataContext = "PEP Database: not configured";
  let pepDataSource: "worldcheck" | "opensanctions" | "none" = "none";

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
          pepDataContext = `World-Check Database Hits (${hits.length} match${hits.length > 1 ? "es" : ""}):\n` +
            hits.slice(0, 5).map((h) =>
              `- ${h.name ?? "Unknown"} | Categories: ${(h.categories ?? []).join(", ")} | Providers: ${(h.providers ?? []).join(", ")} | Countries: ${(h.countryLinks ?? []).join(", ")}`,
            ).join("\n");
          pepDataSource = "worldcheck";
        } else {
          pepDataContext = "World-Check Database: no matches found for this individual";
          pepDataSource = "worldcheck";
        }
      } else {
        pepDataContext = `World-Check Database: query failed (HTTP ${wcRes.status})`;
      }
    } catch (err) {
      console.warn("[pep-profile] world-check lookup failed:", err instanceof Error ? err.message : err);
      pepDataContext = "World-Check Database: temporarily unavailable";
    }
  }

  // OpenSanctions fallback. Triggered when World-Check is unavailable or
  // returned an HTTP error — never when it returned a clean "no matches".
  // Free tier works without an API key; OPENSANCTIONS_API_KEY raises the
  // quota. The /search/peps endpoint scopes the query to political-exposure
  // datasets only (excludes plain sanctions to avoid cross-contaminating
  // the LLM's tier classification).
  if (pepDataSource === "none" && body.name?.trim()) {
    try {
      const osUrl = new URL("https://api.opensanctions.org/search/default");
      osUrl.searchParams.set("q", body.name.trim());
      osUrl.searchParams.set("limit", "5");
      // Broaden coverage: every_politician (300k+ worldwide), eu_meps, gb_hoc_members
      // plus the base PEP compound dataset and world leaders for complete global PEP coverage.
      osUrl.searchParams.append("dataset", "every_politician");
      osUrl.searchParams.append("dataset", "eu_meps");
      osUrl.searchParams.append("dataset", "gb_hoc_members");
      osUrl.searchParams.append("dataset", "us_cia_world_leaders");
      osUrl.searchParams.append("dataset", "un_sc_resolutions");
      osUrl.searchParams.append("dataset", "peps");
      const osHeaders: Record<string, string> = { accept: "application/json" };
      const osKey = process.env["OPENSANCTIONS_API_KEY"];
      if (osKey) osHeaders["Authorization"] = `Bearer ${osKey}`;
      const osRes = await fetch(osUrl.toString(), {
        method: "GET",
        headers: osHeaders,
        signal: AbortSignal.timeout(8_000),
      });
      if (osRes.ok) {
        const osData = (await osRes.json()) as {
          results?: Array<{
            id?: string;
            caption?: string;
            schema?: string;
            datasets?: string[];
            properties?: Record<string, unknown>;
          }>;
        };
        const hits = osData.results ?? [];
        if (hits.length > 0) {
          pepDataContext = `OpenSanctions PEP Database Hits (${hits.length} match${hits.length > 1 ? "es" : ""}):\n` +
            hits.slice(0, 5).map((h) => {
              const props = (h.properties ?? {}) as Record<string, unknown>;
              const positions = Array.isArray(props["position"]) ? (props["position"] as string[]).slice(0, 3).join("; ") : "";
              const country = Array.isArray(props["country"]) ? (props["country"] as string[]).join(", ") : "";
              const topics = Array.isArray(props["topics"]) ? (props["topics"] as string[]).join(", ") : "";
              const dob = Array.isArray(props["birthDate"]) ? (props["birthDate"] as string[])[0] : "";
              return `- ${h.caption ?? "Unknown"} | Schema: ${h.schema ?? "—"} | Datasets: ${(h.datasets ?? []).join(", ")} | Positions: ${positions || "—"} | Country: ${country || "—"} | Topics: ${topics || "—"} | DOB: ${dob || "—"}`;
            }).join("\n");
          pepDataSource = "opensanctions";
        } else {
          pepDataContext = "OpenSanctions PEP Database: no matches found for this individual";
          pepDataSource = "opensanctions";
        }
      } else {
        // Don't overwrite a more useful World-Check error message.
        if (pepDataContext === "PEP Database: not configured") {
          pepDataContext = `OpenSanctions: query failed (HTTP ${osRes.status})`;
        }
      }
    } catch (err) {
      console.warn("[pep-profile] opensanctions lookup failed:", err instanceof Error ? err.message : err);
      if (pepDataContext === "PEP Database: not configured") {
        pepDataContext = "OpenSanctions: temporarily unavailable";
      }
    }
  }


  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({
    ...FALLBACK,
    simulationWarning: "ANTHROPIC_API_KEY not configured — this is a simulated template, NOT a real PEP assessment. All names, positions, figures, and flags are illustrative examples only. Obtain a real AI-generated assessment before making any compliance decisions.",
  }, { status: 200, headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a specialist AML analyst focused on Politically Exposed Person (PEP) risk assessment under FATF Recommendation 12, UAE FDL 10/2025 Art.14, and CBUAE AML Standards. Analyse PEP profile data and produce a comprehensive risk assessment. Apply FATF PEP tier definitions: Tier 1 = heads of state/government, senior ministers, senior military/judiciary/central bank officials, senior officials of international organisations (UN Secretary-General, World Bank Group presidents, IMF Managing Director, ICC/ICJ officials, Arab League Secretary-General — SIE category). Tier 1 also includes royalty and senior religious/political leaders recognised by these titles or their equivalents: Sheikh, Emir, Sultan, Caliph, Grand Mufti (MENA royalty and senior religious authority); Secretário, Ministro, Senador, Governador (LatAm government); Gouverneur, Sénateur, Directeur général (French-speaking Africa); Mkurugenzi, Waziri, Rais (Swahili East Africa); Olisenator, Gubernator, Prezident (Eastern European variants); and Arabic script titles الأمير (Prince/Emir), الوزير (Minister), الرئيس (President/Chairman), الأمين (Secretary-General); Tier 2 = senior judicial officials, senior military officials, members of parliament/legislative bodies, senior political party officials; Tier 3 = mid-level government officials, lower-ranking officials; Tier 4 = senior executives of state-owned enterprises (SOE) at board/C-suite level with material government ownership, senior local/regional government officials; RCA = relative or close associate of any PEP tier — includes spouses, children, parents, and siblings of the PEP, plus known close business associates. Classify SIE (Senior International Organisation Exposed Person) within Tier 1.

HIGH-RISK CORRUPTION SECTORS — MANDATORY EDD: The following sectors carry the highest systemic bribery and corruption risk per FATF, GRECO, Transparency International, and UNCAC guidance. When the PEP's position, organisation, or declared business involves any of these sectors, you MUST: (1) flag "high_corruption_risk_sector" explicitly in requiredMeasures, (2) set EDD as mandatory (not discretionary), and (3) apply at minimum "senior_approval" recommendation:
- Defence procurement and military acquisitions (arms contracts, offset agreements)
- Oil and gas licensing (exploration blocks, production-sharing agreements, pipeline concessions)
- Infrastructure mega-projects (roads, ports, airports, dams, power plants — contract values > USD 100M)
- Mining concessions and extractive industries (mineral rights, artisanal mining licences)
- Telecoms spectrum auctions and broadcast licensing
- Government banking and sovereign wealth fund management
- Public construction and real estate development on state land
- Pharmaceutical and healthcare procurement by government entities

For PEPs connected to these sectors, include explicit red-flag analysis covering: kickbacks in tender processes, procurement corruption, tender rigging, facilitation payments, government contract fraud, and conflicts of interest arising from the revolving door between public office and private-sector positions.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "pepTier": "tier1"|"tier2"|"tier3"|"tier4"|"rca",
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

Name: ${sanitizeField(body.name) || "Unknown"}
Country: ${sanitizeField(body.country) || "Not specified"}
Position: ${sanitizeField(body.position) || "Not specified"}
Organization: ${sanitizeField(body.organization) || "Not specified"}
Political Party: ${sanitizeField(body.politicalParty) || "Not specified"}
Years in Office: ${sanitizeField(String(body.yearsInOffice ?? "Not specified"), 50)}
Family Members / Known Associates: ${sanitizeText(body.familyMembers) || "None declared"}
Source of Wealth: ${sanitizeText(body.sourceOfWealth) || "Not declared"}
Declared Assets: ${sanitizeText(body.declaredAssets) || "Not declared"}

${pepDataContext}

Perform a comprehensive PEP risk assessment grounded in the PEP database data above (source: ${pepDataSource}). Classify tier, assess source of wealth plausibility, map the political network, identify all risk factors, and provide required AML measures per FATF R.12 and UAE FDL 10/2025 Art.14.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PepProfileResult;
    if (!Array.isArray(result.networkMap)) result.networkMap = [];
    if (!Array.isArray(result.requiredMeasures)) result.requiredMeasures = [];

    // Write pep.rca_identified audit chain entries for every RCA found in the
    // network map. FATF R.12 requires explicit recording of PEP network
    // relationships including family members and close associates so that
    // downstream EDD measures can be traced back to the screening event.
    const subjectName = sanitizeField(body.name) || "Unknown";
    for (const node of result.networkMap) {
      void writeAuditChainEntry(
        {
          event: "pep.rca_identified",
          actor: gate.keyId,
          subjectId: subjectName,
          pepId: subjectName,
          relationship: node.relationship,
          rcaName: node.name,
          riskLevel: node.riskLevel,
        },
        "compliance",
      ).catch((err: unknown) =>
        console.warn("[pep-profile] pep.rca_identified audit chain write failed:", err instanceof Error ? err.message : String(err)),
      );
    }

    const latencyMs = Date.now() - _handlerStart;
    if (latencyMs > 5000) console.warn(`[pep_profile] latencyMs=${latencyMs} exceeds 5000ms`);
    return NextResponse.json(
      {
        ...result,
        worldCheckGrounded: pepDataSource === "worldcheck",
        pepDataSource,
        latencyMs,
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "pep-profile temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
  } catch (err) {
    console.error("[hawkeye] pep_profile handler exception:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "pep_profile",
      retryAfterSeconds: null,
      requestId: randomBytes(5).toString("hex"),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500 , headers: gate && gate.ok ? gate.headers : {} });
  }
}
