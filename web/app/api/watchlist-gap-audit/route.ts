// GET /api/watchlist-gap-audit
//
// Watchlist Coverage Auditor.
// Compares the watchlists you ARE screening against vs the lists you MUST
// screen against under UAE FDL 10/2025, CBUAE AML Standards, and FATF
// Recommendations. Returns a coverage gap score and remediation priorities.
//
// Each list entry has:
//   - List name and authority
//   - Regulatory mandate (which article/recommendation requires it)
//   - Penalty exposure for non-coverage
//   - Recommended data source to fill the gap

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface WatchlistAuditRequest {
  configuredLists?: string[];    // lists currently active in your screening engine
  institutionType?: "DPMS" | "bank" | "VASP" | "DNFBPs" | "insurance";
  jurisdictions?: string[];      // jurisdictions you operate in
  includeAiRecommendations?: boolean;
}

interface WatchlistDefinition {
  id: string;
  name: string;
  authority: string;
  mandatoryFor: string[];        // institution types for which it's mandatory
  regulatoryBasis: string;
  penaltyExposure: "critical" | "high" | "medium" | "low";
  category: "sanctions" | "pep" | "adverse_media" | "kyc" | "corporate_registry" | "onchain";
  dataSource: string;            // recommended free or commercial source
  updateFrequency: string;
}

const REQUIRED_WATCHLISTS: WatchlistDefinition[] = [
  // ── Mandatory Sanctions Lists ──────────────────────────────────────────────
  { id: "uae-eocn", name: "UAE Executive Office for Control & Non-Proliferation (EOCN)", authority: "UAE EOCN", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "FDL 10/2025 Art.14; Cabinet Decision No. 10/2019", penaltyExposure: "critical", category: "sanctions", dataSource: "eocn.gov.ae (official)", updateFrequency: "real-time" },
  { id: "ofac-sdn", name: "OFAC Specially Designated Nationals (SDN)", authority: "US Treasury OFAC", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "CBUAE AML Standards §7.2; FATF R.6", penaltyExposure: "critical", category: "sanctions", dataSource: "treasury.gov/ofac (free)", updateFrequency: "daily" },
  { id: "un-sc", name: "UN Security Council Consolidated List", authority: "UN Security Council", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "FDL 10/2025 Art.14; FATF R.6", penaltyExposure: "critical", category: "sanctions", dataSource: "un.org/sc/suborg/en/sanctions/un-sc-consolidated-list (free)", updateFrequency: "weekly" },
  { id: "eu-fsf", name: "EU Financial Sanctions Files", authority: "European Commission", mandatoryFor: ["bank","VASP","DNFBPs"], regulatoryBasis: "CBUAE AML Standards §7.2; FATF R.6", penaltyExposure: "high", category: "sanctions", dataSource: "eeas.europa.eu/eeas/consolidated-list_en (free)", updateFrequency: "daily" },
  { id: "uk-hmt", name: "UK HM Treasury Consolidated List", authority: "UK HM Treasury", mandatoryFor: ["bank","VASP"], regulatoryBasis: "CBUAE AML Standards §7.2", penaltyExposure: "high", category: "sanctions", dataSource: "gov.uk/government/publications/financial-sanctions-consolidated-list (free)", updateFrequency: "daily" },
  { id: "ofac-cons", name: "OFAC Consolidated Sanctions List", authority: "US Treasury OFAC", mandatoryFor: ["bank","VASP"], regulatoryBasis: "CBUAE AML Standards §7.2", penaltyExposure: "high", category: "sanctions", dataSource: "treasury.gov/ofac/downloads (free)", updateFrequency: "daily" },
  // ── PEP Lists ─────────────────────────────────────────────────────────────
  { id: "pep-class1", name: "PEP Category 1 — Heads of State / Government", authority: "FATF / Institutional", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "FDL 10/2025 Art.12; FATF R.12", penaltyExposure: "critical", category: "pep", dataSource: "Refinitiv World-Check / Dow Jones / OpenSanctions (peps)", updateFrequency: "continuous" },
  { id: "pep-class2", name: "PEP Category 2 — Senior Government Officials", authority: "FATF / Institutional", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "FDL 10/2025 Art.12; FATF R.12", penaltyExposure: "critical", category: "pep", dataSource: "Refinitiv World-Check / Dow Jones / OpenSanctions", updateFrequency: "continuous" },
  { id: "pep-class3", name: "PEP Category 3 — Senior Executives of SOEs", authority: "FATF / Institutional", mandatoryFor: ["bank","VASP","DNFBPs"], regulatoryBasis: "FATF R.12", penaltyExposure: "high", category: "pep", dataSource: "Refinitiv World-Check / ComplyAdvantage", updateFrequency: "weekly" },
  // ── UAE-Specific ──────────────────────────────────────────────────────────
  { id: "cbuae-debarred", name: "CBUAE Debarred Persons List", authority: "Central Bank of UAE", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "CBUAE AML Standards §7.1", penaltyExposure: "critical", category: "sanctions", dataSource: "centralbank.ae (official)", updateFrequency: "as-published" },
  { id: "uae-interpol", name: "Interpol Red Notices (UAE relevant)", authority: "Interpol / UAE Police", mandatoryFor: ["bank","VASP"], regulatoryBasis: "CBUAE AML Standards §7.3", penaltyExposure: "high", category: "sanctions", dataSource: "interpol.int/How-we-work/Notices/Red-Notices", updateFrequency: "weekly" },
  // ── Corporate Registries ──────────────────────────────────────────────────
  { id: "uae-ded", name: "Dubai DED Commercial Registry", authority: "Dubai DED", mandatoryFor: ["DPMS","bank","DNFBPs"], regulatoryBasis: "FDL 10/2025 Art.8 (CDD); FATF R.10", penaltyExposure: "high", category: "corporate_registry", dataSource: "ded.gov.dubai (official)", updateFrequency: "real-time" },
  { id: "difc-registry", name: "DIFC Companies Registry", authority: "DIFC Registrar", mandatoryFor: ["bank","DNFBPs"], regulatoryBasis: "FDL 10/2025 Art.8; FATF R.10", penaltyExposure: "medium", category: "corporate_registry", dataSource: "difclaw.org/companies-registry", updateFrequency: "weekly" },
  { id: "adgm-registry", name: "ADGM Companies Registry", authority: "ADGM Registrar", mandatoryFor: ["bank","DNFBPs"], regulatoryBasis: "FDL 10/2025 Art.8; FATF R.10", penaltyExposure: "medium", category: "corporate_registry", dataSource: "adgm.com/companies", updateFrequency: "weekly" },
  // ── Adverse Media ─────────────────────────────────────────────────────────
  { id: "adverse-arabic", name: "Arabic-language adverse media screening", authority: "FATF / Institutional", mandatoryFor: ["DPMS","bank","VASP","DNFBPs"], regulatoryBasis: "FATF R.10 (CDD); CBUAE AML Standards §5.4", penaltyExposure: "high", category: "adverse_media", dataSource: "ComplyAdvantage / Dow Jones / manual Arabic sources", updateFrequency: "continuous" },
  { id: "adverse-english", name: "English-language adverse media screening", authority: "FATF / Institutional", mandatoryFor: ["DPMS","bank","VASP","DNFBPs","insurance"], regulatoryBasis: "FATF R.10; CBUAE AML Standards §5.4", penaltyExposure: "high", category: "adverse_media", dataSource: "ComplyAdvantage / LexisNexis / Dow Jones", updateFrequency: "continuous" },
  // ── Virtual Asset / Onchain ───────────────────────────────────────────────
  { id: "vasp-fatf", name: "FATF VASP Risk Indicators List", authority: "FATF", mandatoryFor: ["VASP","bank"], regulatoryBasis: "FATF R.15 (VASPs); FDL 10/2025 Art.20", penaltyExposure: "critical", category: "onchain", dataSource: "Chainalysis / TRM Labs / Elliptic", updateFrequency: "continuous" },
  { id: "blockchain-analytics", name: "On-chain address screening (crypto)", authority: "FATF / Institutional", mandatoryFor: ["VASP"], regulatoryBasis: "FATF R.15; CBUAE VASP Regulations", penaltyExposure: "critical", category: "onchain", dataSource: "Chainalysis / TRM Labs / Elliptic", updateFrequency: "real-time" },
];

export async function GET(req: Request): Promise<NextResponse> {
  return handler(req);
}
export async function POST(req: Request): Promise<NextResponse> {
  return handler(req);
}

async function handler(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: WatchlistAuditRequest = {};
  if (req.method === "POST") {
    try { body = await req.json() as WatchlistAuditRequest; } catch { /* optional body */ }
  }

  const institutionType = body.institutionType ?? "DPMS";
  const configuredLower = new Set((Array.isArray(body.configuredLists) ? body.configuredLists : []).map((s) => s.toLowerCase()));

  const applicable = REQUIRED_WATCHLISTS.filter((w) => w.mandatoryFor.includes(institutionType));
  const covered = applicable.filter((w) => configuredLower.has(w.id) || [...configuredLower].some((c) => c.includes(w.id.replace(/-/g, "")) || w.name.toLowerCase().includes(c)));
  const gaps = applicable.filter((w) => !covered.includes(w));

  const criticalGaps = gaps.filter((g) => g.penaltyExposure === "critical");
  const highGaps = gaps.filter((g) => g.penaltyExposure === "high");
  const coveragePercent = applicable.length > 0 ? Math.round((covered.length / applicable.length) * 100) : 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let aiRecommendations: string[] = [];
  if (apiKey && (body.includeAiRecommendations !== false) && gaps.length > 0) {
    try {
      const client = getAnthropicClient(apiKey, 25_000, "watchlist-gap-audit");
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "You are a UAE AML compliance specialist. Given watchlist coverage gaps for a DPMS institution, provide prioritized remediation recommendations. Return JSON: { \"recommendations\": [\"<recommendation>\"] }",
        messages: [{
          role: "user",
          content: `Institution: ${institutionType}\nCoverage: ${coveragePercent}%\nCritical gaps: ${criticalGaps.map((g) => g.name).join(", ")}\nHigh gaps: ${highGaps.map((g) => g.name).join(", ")}\n\nProvide top 5 remediation actions in priority order.`,
        }],
      });
      const raw = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "{}";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      aiRecommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    } catch { /* best effort */ }
  }

  return NextResponse.json({
    ok: true,
    institutionType,
    coveragePercent,
    totalApplicable: applicable.length,
    covered: covered.length,
    gaps: gaps.length,
    criticalGaps: criticalGaps.length,
    riskRating: criticalGaps.length > 0 ? "critical" : highGaps.length > 0 ? "high" : coveragePercent < 60 ? "medium" : "low",
    applicableLists: applicable,
    coveredLists: covered.map((w) => w.id),
    gapDetails: gaps,
    remediationPriority: [
      ...criticalGaps.map((g) => ({ priority: 1, list: g.name, reason: "Critical regulatory mandate", dataSource: g.dataSource })),
      ...highGaps.map((g) => ({ priority: 2, list: g.name, reason: "High-risk gap", dataSource: g.dataSource })),
    ],
    aiRecommendations,
    regulatoryBasis: "FDL 10/2025 Art.14; CBUAE AML Standards §7; FATF R.6, R.10, R.12",
    auditedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
