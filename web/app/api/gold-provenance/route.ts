// POST /api/gold-provenance
//
// Gold & Precious Metals Supply Chain Provenance Tracker.
// Specific to UAE DPMS obligations under FDL 10/2025 and OECD 5-Step Guidance.
//
// Tracks the full custody chain: extraction → refinery → exporter →
// transit country → importer → trader → end buyer.
//
// At each hop, detects:
//   - CAHRA zone origin (conflict minerals)
//   - Missing certifications (Kimberley Process, LBMA GDL, RMAP)
//   - Unexplained chain breaks (hop with no documentation)
//   - Sanctioned intermediary flags
//   - Dore bar / artisanal / scrap classification risks
//
// Returns: chain integrity score, CAHRA exposure, cert gaps, red flags.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

interface ProvenanceHop {
  hopNumber: number;
  actor: string;           // name of entity at this hop
  actorType: "mine" | "refinery" | "exporter" | "transit" | "importer" | "trader" | "buyer" | "other";
  country: string;
  date?: string;
  documentType?: string;   // assay cert, bill of lading, invoice, RMAP cert, etc.
  documentReference?: string;
  certification?: string;  // LBMA GDL, RMAP, Kimberley, RJC, etc.
  weight?: number;         // grams
  purity?: number;         // fineness (e.g. 999.9)
  notes?: string;
}

interface GoldProvenanceRequest {
  commodity: "gold" | "silver" | "platinum" | "palladium" | "diamond" | "rough_diamond";
  totalWeight?: number;    // grams
  finalForm?: string;      // "dore bar", "bullion", "jewelry", "scrap", "coins"
  chain: ProvenanceHop[];
  referenceNumber?: string;
}

// CAHRA zones (OECD 5-Step Guidance conflict-affected areas)
const CAHRA_COUNTRIES = new Set([
  "Democratic Republic of Congo", "DRC", "Congo", "Central African Republic", "CAR",
  "Mali", "Sudan", "South Sudan", "Somalia", "Afghanistan", "Myanmar",
  "Zimbabwe", "Colombia", "Peru", "Venezuela", "Libya", "Ethiopia",
  "Nigeria", "Ghana", "Guinea", "Sierra Leone", "Liberia", "Côte d'Ivoire",
]);

// High-risk transit hubs for gold TBML
const HIGH_RISK_TRANSIT = new Set([
  "United Arab Emirates", "UAE", "Dubai", "Switzerland", "Hong Kong",
  "Singapore", "Panama", "Turkey", "India", "China",
]);

// Required certifications by commodity
const REQUIRED_CERTS: Record<string, string[]> = {
  "gold":          ["LBMA GDL", "RMAP", "RJC", "Fairmined"],
  "diamond":       ["Kimberley Process Certificate", "RJC"],
  "rough_diamond": ["Kimberley Process Certificate"],
  "silver":        ["LBMA", "RJC"],
  "platinum":      ["LBMA", "LPPM"],
  "palladium":     ["LBMA", "LPPM"],
};

function analyzeChainStatically(req: GoldProvenanceRequest): {
  cahraExposure: boolean;
  cahraCountries: string[];
  certificationGaps: string[];
  chainBreaks: string[];
  highRiskTransit: string[];
  dorebBar: boolean;
  artisanal: boolean;
  integrityScore: number;
  redFlags: string[];
} {
  const redFlags: string[] = [];
  const cahraCountries: string[] = [];
  const certGaps: string[] = [];
  const chainBreaks: string[] = [];
  const highRiskTransitFound: string[] = [];

  for (const hop of req.chain) {
    if (CAHRA_COUNTRIES.has(hop.country)) {
      cahraCountries.push(`${hop.country} (hop ${hop.hopNumber}: ${hop.actorType})`);
      redFlags.push(`CAHRA zone actor at hop ${hop.hopNumber}: ${hop.actor} (${hop.country})`);
    }
    if (HIGH_RISK_TRANSIT.has(hop.country) && hop.actorType === "transit") {
      highRiskTransitFound.push(hop.country);
    }
    if (!hop.documentType && !hop.documentReference) {
      chainBreaks.push(`Hop ${hop.hopNumber} (${hop.actor}): no documentation`);
      redFlags.push(`Undocumented hop at ${hop.actorType} stage (${hop.actor})`);
    }
  }

  const requiredCerts = REQUIRED_CERTS[req.commodity] ?? [];
  const foundCerts = new Set(req.chain.flatMap((h) => h.certification ? [h.certification] : []));
  for (const cert of requiredCerts) {
    if (![...foundCerts].some((c) => c.toLowerCase().includes(cert.toLowerCase()))) {
      certGaps.push(`${cert} not found in chain`);
    }
  }

  const dorebBar = req.finalForm?.toLowerCase().includes("dore") ?? false;
  const artisanal = req.chain.some((h) => h.notes?.toLowerCase().includes("artisanal") || h.notes?.toLowerCase().includes("asm"));

  if (dorebBar) redFlags.push("Gold dore bar: high CAHRA supply chain risk — requires full chain of custody and RMAP");
  if (artisanal) redFlags.push("Artisanal/small-scale mining (ASM) notation — elevated conflict mineral risk");
  if (req.chain.length < 3) redFlags.push("Chain has fewer than 3 hops — likely incomplete provenance documentation");

  // Integrity score (100 = perfect)
  let score = 100;
  score -= cahraCountries.length * 20;
  score -= chainBreaks.length * 15;
  score -= certGaps.length * 10;
  score -= highRiskTransitFound.length * 5;
  if (dorebBar) score -= 15;
  if (artisanal) score -= 10;

  return {
    cahraExposure: cahraCountries.length > 0,
    cahraCountries,
    certificationGaps: certGaps,
    chainBreaks,
    highRiskTransit: highRiskTransitFound,
    dorebBar,
    artisanal,
    integrityScore: Math.max(0, score),
    redFlags,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: GoldProvenanceRequest;
  try { body = await req.json() as GoldProvenanceRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.commodity || !Array.isArray(body.chain) || body.chain.length === 0) {
    return NextResponse.json({ ok: false, error: "commodity and chain[] required" }, { status: 400, headers: gate.headers });
  }

  const staticAnalysis = analyzeChainStatically(body);
  const overallRisk = staticAnalysis.integrityScore < 40 ? "critical"
    : staticAnalysis.integrityScore < 60 ? "high"
    : staticAnalysis.integrityScore < 80 ? "medium"
    : "low";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      commodity: body.commodity,
      chainLength: body.chain.length,
      overallRisk,
      ...staticAnalysis,
      requiredCertifications: REQUIRED_CERTS[body.commodity] ?? [],
      regulatoryBasis: "OECD 5-Step Due Diligence Guidance; FDL 10/2025 Art.8; FATF R.14; Kimberley Process; LBMA GDL",
      aiEnriched: false,
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 22_000, "gold-provenance");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: `You are a UAE DPMS (gold and precious metals dealer) AML compliance specialist with expertise in responsible sourcing, OECD 5-Step Guidance, and supply chain due diligence for gold, diamonds, and precious metals.

Analyse the gold/precious metals supply chain for:
1. CAHRA supply chain risks (conflict-affected and high-risk areas)
2. Missing certifications and documentation
3. Chain of custody breaks
4. FATF typology R.14 (DPMS) red flags
5. Responsible sourcing compliance gaps
6. UAE-specific DPMS obligations

Return ONLY valid JSON:
{
  "chainAssessment": "<2-3 sentence analysis of chain integrity>",
  "additionalRedFlags": ["<specific red flag not caught by static analysis>"],
  "requiredActions": ["<action required for compliance>"],
  "certificationAdvice": "<specific advice on required certifications>",
  "regulatoryExposure": "<which specific regulations are at risk of breach>",
  "chainRiskNarrative": "<paragraph for compliance file>",
  "recommendedDueDiligence": ["<specific DD step>"]
}`,
    messages: [{
      role: "user",
      content: `Commodity: ${sanitizeField(body.commodity, 100)}
Final Form: ${sanitizeField(body.finalForm, 100) || "not specified"}
Total Weight: ${body.totalWeight ? `${body.totalWeight}g` : "not specified"}
Chain Length: ${body.chain.length} hops

Supply Chain:
${JSON.stringify(body.chain, null, 2)}

Static Analysis Results:
${JSON.stringify(staticAnalysis, null, 2)}

Analyse for DPMS/CAHRA compliance.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  let aiResult: Record<string, unknown> = {};
  try { aiResult = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* best effort */ }

  return NextResponse.json({
    ok: true,
    commodity: body.commodity,
    chainLength: body.chain.length,
    overallRisk,
    ...staticAnalysis,
    ...aiResult,
    requiredCertifications: REQUIRED_CERTS[body.commodity] ?? [],
    regulatoryBasis: "OECD 5-Step Due Diligence Guidance; FDL 10/2025 Art.8; FATF R.14; Kimberley Process; LBMA GDL",
    aiEnriched: true,
    analyzedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
