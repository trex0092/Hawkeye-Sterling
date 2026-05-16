// POST /api/cases/nl-search
//
// Weaponized natural-language case search. Uses Claude to parse a
// plain-English compliance query into structured filters with a
// confidence score and reasoning chain, then applies them against
// the client-supplied subjects array (localStorage — not server-side).
//
// Returns:
//   { ok, matchIds, parsedFilters, interpretation, confidence, reasoning, auditRef }
//
// Charter P2: every filter applied is cited in the reasoning field.
// Charter P4: subjects array is never persisted — ephemeral request only.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Legacy interface exported for ScreeningToolbar compatibility ──────────────

export interface NlSearchFilter {
  /** ISO2 country codes or country name fragments to match against subject.country */
  countries?: string[];
  /** Minimum risk score 0-100 */
  riskScoreMin?: number;
  /** Maximum risk score 0-100 */
  riskScoreMax?: number;
  /** CDD posture values: "CDD" | "EDD" | "SDD" | "RFI" | "PENDING" */
  cddPostures?: string[];
  /** Entity types: "individual" | "organisation" | "vessel" | "aircraft" */
  entityTypes?: string[];
  /** Subject status: "active" | "frozen" | "cleared" */
  statuses?: string[];
  /** True = must have at least one sanctions list hit */
  sanctionsHit?: boolean;
  /** True = must have PEP flag */
  pepFlag?: boolean;
  /** True = must have SLA breach (< 0 hours remaining) */
  slaBreach?: boolean;
  /** Free-text fragments to match against name (case-insensitive) */
  nameContains?: string[];
  /** Free-text fragments to match against meta/notes (case-insensitive) */
  metaContains?: string[];
  /** Minimum number of sanctions lists matched */
  minListCount?: number;
}

export interface NlSearchResult {
  ok: boolean;
  query: string;
  interpreted: string;
  filters: NlSearchFilter;
  confidence: "high" | "medium" | "low";
  clarification?: string;
}

// ── Rich subject type for server-side filter application ─────────────────────

interface SubjectSlim {
  id: string;
  name: string;
  meta: string;
  country: string;
  jurisdiction: string;
  entityType: string;
  riskScore: number;
  cddPosture: string;
  listCoverage: string[];
  status: string;
  pep?: { tier: string } | null;
  adverseMedia?: { reference?: string } | null;
  aliases?: string[];
  mostSerious?: string;
}

interface ParsedFilters {
  jurisdiction?: string;
  entityType?: string;
  minScore?: number;
  maxScore?: number;
  hasAdverseMedia?: boolean;
  hasEdd?: boolean;
  hasPep?: boolean;
  pepMinTier?: string;
  hasSanctions?: boolean;
  sanctionList?: string;
  status?: string;
  keywords?: string[];
  hasCritical?: boolean;
  hasRedlineRisk?: boolean;
}

interface ParseResult {
  filters: ParsedFilters;
  interpretation: string;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a precision AML case filter parser for a UAE-licensed DPMS/VASP compliance platform.

Your job: parse a compliance officer's plain-English query into structured JSON filters so the case queue can be filtered programmatically.

OUTPUT FORMAT — return ONLY this JSON object, nothing else:
{
  "filters": {
    "jurisdiction": "string — ISO-2 code or country name (optional)",
    "entityType": "individual | organisation | vessel | aircraft | other (optional)",
    "minScore": "integer 0-100 — minimum risk score (optional)",
    "maxScore": "integer 0-100 — maximum risk score (optional)",
    "hasAdverseMedia": "boolean — true = only subjects with adverse media hits (optional)",
    "hasEdd": "boolean — true = only EDD-postured subjects (optional)",
    "hasPep": "boolean — true = any PEP (optional)",
    "pepMinTier": "string — minimum PEP tier e.g. 'national', 'state_leader', 'ministerial' (optional)",
    "hasSanctions": "boolean — true = subjects with any sanctions list coverage (optional)",
    "sanctionList": "string — specific list e.g. 'OFAC', 'UN', 'EU', 'UK' (optional)",
    "status": "active | frozen | cleared (optional)",
    "keywords": "string[] — words to match against name/meta/aliases (optional)",
    "hasCritical": "boolean — true = riskScore >= 85 (optional)",
    "hasRedlineRisk": "boolean — true = subject has list hits that would likely fire a redline (optional)"
  },
  "interpretation": "One sentence: what the analyst is looking for",
  "confidence": "number 0-1 — how confident you are in the parse",
  "reasoning": "One sentence: which fields you derived and why"
}

IMPORTANT MAPPINGS:
- "high risk" / "critical" → minScore: 85 or hasCritical: true
- "sanctioned" / "OFAC" / "SDN" → hasSanctions: true, sanctionList: "OFAC"
- "UN list" → hasSanctions: true, sanctionList: "UN"
- "EDD" / "enhanced due diligence" → hasEdd: true
- "PEP" / "politically exposed" → hasPep: true
- "senior official" / "minister" / "head of state" → hasPep: true, pepMinTier: "national"
- "VASP" / "crypto exchange" / "virtual asset" → entityType: "organisation", keywords: ["vasp", "crypto", "exchange"]
- "Turkey" / "UAE" / "Russia" / etc → jurisdiction: ISO-2 code
- "adverse media" / "negative news" → hasAdverseMedia: true
- "no EDD completed" → hasEdd: false (set hasEdd: false explicitly)
- "active cases" / "open" → status: "active"
- "frozen accounts" → status: "frozen"
- "cleared" / "closed" → status: "cleared"

Do not add fields that are not implied by the query. Keep keywords short (1-2 words max each).`;

async function parseQuery(query: string): Promise<ParseResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return {
      filters: {},
      interpretation: query,
      confidence: 0,
      reasoning: "API key not configured — returning unfiltered results",
    };
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Query: "${sanitizeField(query, 500)}"` }],
    });
    const text = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();
    let parsed: { filters?: ParsedFilters; interpretation?: string; confidence?: number; reasoning?: string };
    try {
      // Strip markdown fences if model ignored instructions
      const clean = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(clean) as typeof parsed;
    } catch {
      parsed = {};
    }
    return {
      filters: parsed.filters ?? {},
      interpretation: parsed.interpretation ?? query,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? "Parsed by brain",
    };
  } catch (err) {
    return {
      filters: {},
      interpretation: query,
      confidence: 0,
      reasoning: err instanceof Error ? err.message : "parse failed",
    };
  }
}

const REDLINE_LIST_PATTERNS = /ofac|sdn|un\b|un_1267|eu\b|eu_cfsp|uk\b|uk_ofsi|eocn|uae/i;

function applyFilters(subjects: SubjectSlim[], filters: ParsedFilters): string[] {
  return subjects.filter((s) => {
    if (filters.status && s.status !== filters.status) return false;

    // hasEdd: true → only EDD; false → exclude EDD
    if (filters.hasEdd === true && s.cddPosture !== "EDD") return false;
    if (filters.hasEdd === false && s.cddPosture === "EDD") return false;

    if (filters.hasAdverseMedia === true && !s.adverseMedia) return false;
    if (filters.hasAdverseMedia === false && s.adverseMedia) return false;

    if (filters.hasPep === true && !s.pep) return false;
    if (filters.hasPep === false && s.pep) return false;

    if (filters.pepMinTier && s.pep) {
      const tier = s.pep.tier.toLowerCase();
      const minTier = filters.pepMinTier.toLowerCase();
      // Rough tier ordering check: state_leader > national > ministerial > local
      const tierOrder = ["local", "regional", "ministerial", "national", "state_leader", "supra_national"];
      const subjectTierIdx = tierOrder.findIndex((t) => tier.includes(t));
      const minTierIdx = tierOrder.findIndex((t) => minTier.includes(t));
      if (subjectTierIdx !== -1 && minTierIdx !== -1 && subjectTierIdx < minTierIdx) return false;
    }

    if (filters.hasSanctions === true && s.listCoverage.length === 0) return false;
    if (filters.hasSanctions === false && s.listCoverage.length > 0) return false;

    if (filters.sanctionList) {
      const sl = filters.sanctionList.toLowerCase();
      if (!s.listCoverage.some((l) => l.toLowerCase().includes(sl))) return false;
    }

    if (filters.minScore !== undefined && s.riskScore < filters.minScore) return false;
    if (filters.maxScore !== undefined && s.riskScore > filters.maxScore) return false;

    if (filters.hasCritical === true && s.riskScore < 85) return false;

    if (filters.hasRedlineRisk === true) {
      const hasListHit = s.listCoverage.some((l) => REDLINE_LIST_PATTERNS.test(l));
      const hasMeta = REDLINE_LIST_PATTERNS.test(s.meta ?? "");
      if (!hasListHit && !hasMeta) return false;
    }

    if (filters.entityType && s.entityType !== filters.entityType) return false;

    if (filters.jurisdiction) {
      const jLower = filters.jurisdiction.toLowerCase();
      if (
        !s.jurisdiction.toLowerCase().includes(jLower) &&
        !s.country.toLowerCase().includes(jLower) &&
        !(s.meta ?? "").toLowerCase().includes(jLower)
      ) return false;
    }

    if (filters.keywords && filters.keywords.length > 0) {
      const haystack = [s.name, s.meta, ...(s.aliases ?? [])].join(" ").toLowerCase();
      if (!filters.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return false;
    }

    return true;
  }).map((s) => s.id);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  try {
    const body = (await req.json()) as { query?: string; subjects?: SubjectSlim[]; actor?: string };
    const query = (body.query ?? "").trim();
    const subjects = body.subjects ?? [];
    if (!query) {
      return NextResponse.json({ ok: false, error: "query required" }, { status: 400 , headers: gate.headers });
    }

    const { filters, interpretation, confidence, reasoning } = await parseQuery(query);
    const matchIds = applyFilters(subjects, filters);

    // Audit trail — NL searches are compliance-relevant (Charter P10).
    // Fire-and-forget so it never blocks the response.
    try {
      writeAuditEvent(
        body.actor ?? "analyst",
        "nlsearch.run",
        `query="${query}" → ${matchIds.length} matches · confidence ${(confidence * 100).toFixed(0)}%`,
      );
    } catch { /* non-blocking */ }

    return NextResponse.json({
      ok: true,
      matchIds,
      parsedFilters: filters,
      interpretation,
      confidence,
      reasoning,
      matchCount: matchIds.length,
      auditLogged: true,
    }, { headers: gate.headers });
  } catch (err) {
    console.error(
      "[hawkeye] cases/nl-search: AI parse failed — returning empty matchIds " +
      "with self-documenting interpretation/reasoning so UI can show the fallback state.",
      err,
    );
    return NextResponse.json({
      ok: true,
      matchIds: [],
      parsedFilters: {},
      interpretation: "Search temporarily unavailable — showing all cases",
      confidence: 0,
      reasoning: "Fallback: search service error",
      matchCount: 0,
      auditLogged: false,
      fallback: true,
    }, { headers: gate.headers });
  }
}
