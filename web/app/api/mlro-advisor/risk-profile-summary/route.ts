import { writeAuditEvent } from "@/lib/audit";
import { parseLlmJson, withMlroLlm } from "@/lib/server/mlro-route-base";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import {
  MLRO_RED_FLAGS_TAXONOMY,
  searchRedFlags,
  type MlroRedFlag,
} from "../../../../../src/brain/mlro-red-flags-taxonomy.generated.js";
import { COMMON_SENSE_RULES } from "../../../../../src/brain/mlro-common-sense.js";
import { PEER_BASELINES, type BenchmarkSector } from "../../../../../src/brain/mlro-peer-benchmark.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Body {
  entityName: string;
  entityType?: string;
  sector?: string;
  jurisdiction?: string;
  riskScore?: number;
  adverseMedia?: boolean;
  context?: string;
}

type RedFlagBucket = "transaction" | "customer" | "supplier" | "geographic" | "product" | "behavioral" | "regulatory";

interface TaxonomyBoundFlag {
  id: string;
  label: string;
  bucket: RedFlagBucket;
  rationale: string;
}

interface InherentRiskFactor {
  title: string;
  level: "elevated" | "high" | "medium-high" | "medium" | "low";
  bullets: string[];
}

interface MitigatingFactor {
  factor: string;
  impact: string;
}

interface ResidualRiskDimension {
  dimension: string;
  rating: "high" | "medium" | "low" | "not_indicated";
}

interface RiskProfileSummaryResult {
  entityOverview: {
    entityType: string;
    sector: string;
    jurisdiction: string;
    riskScore: number;
    adverseMedia: boolean;
  };
  inherentRiskFactors: InherentRiskFactor[];
  mitigatingFactors: MitigatingFactor[];
  residualRiskAssessment: ResidualRiskDimension[];
  overallResidualRisk: "high" | "medium" | "low";
  dueDiligenceActions: string[];
  redFlagsToWatch: TaxonomyBoundFlag[];
  taxonomyCoverage: {
    totalConsidered: number;
    flagsSelected: number;
  };
  conclusion: {
    narrative: string;
    onboardingDecision:
      | "proceed_standard"
      | "proceed_standard_plus"
      | "proceed_edd"
      | "escalate"
      | "decline";
    onboardingRationale: string;
  };
}

// ── Taxonomy context builder ──────────────────────────────────────────────────

/**
 * Selects sector- and jurisdiction-relevant flags from the 719-flag taxonomy.
 * Runs multiple keyword searches, deduplicates, and caps at 60 entries so the
 * system prompt stays within the Haiku token budget.
 */
function buildFlagPool(sector: string, jurisdiction: string): MlroRedFlag[] {
  const s = sector.toLowerCase();
  const j = jurisdiction.toLowerCase();
  const seen = new Set<string>();
  const pool: MlroRedFlag[] = [];

  const add = (flags: MlroRedFlag[]) => {
    for (const f of flags) {
      if (!seen.has(f.id)) { seen.add(f.id); pool.push(f); }
    }
  };

  // Sector-specific searches
  if (/gold|precious|bullion|dpms|lbma|refin|metal/.test(s)) {
    add(searchRedFlags("gold"));
    add(searchRedFlags("precious"));
    add(searchRedFlags("lbma"));
    add(searchRedFlags("assay"));
    add(searchRedFlags("refinery"));
    add(searchRedFlags("bullion"));
    add(searchRedFlags("cahra"));
    add(searchRedFlags("purity"));
    add(searchRedFlags("certificate"));
  }
  if (/real estate|property|mortgage/.test(s)) {
    add(searchRedFlags("real estate"));
    add(searchRedFlags("property"));
  }
  if (/crypto|vasp|bitcoin|virtual asset/.test(s)) {
    add(searchRedFlags("crypto"));
    add(searchRedFlags("vasp"));
    add(searchRedFlags("mixing"));
    add(searchRedFlags("wallet"));
  }
  if (/bank|finance|lending/.test(s)) {
    add(searchRedFlags("bank"));
    add(searchRedFlags("correspondent"));
  }
  if (/npo|charity|nonprofit|foundation/.test(s)) {
    add(searchRedFlags("npo"));
    add(searchRedFlags("charity"));
  }

  // Jurisdiction-specific searches
  if (/turkey|tr\b/.test(j)) {
    add(searchRedFlags("transit"));
    add(searchRedFlags("grey"));
  }
  if (/iran|iraq|syria|north korea|dprk/.test(j)) {
    add(searchRedFlags("sanctioned"));
  }
  if (/russia|rf\b/.test(j)) {
    add(searchRedFlags("russia"));
  }

  // Always include high-value cross-sector flags
  add(searchRedFlags("hawala"));
  add(searchRedFlags("invoice"));
  add(searchRedFlags("beneficial owner"));
  add(searchRedFlags("pep"));
  add(searchRedFlags("sanctions"));
  add(searchRedFlags("cash"));
  add(searchRedFlags("jurisdiction"));

  // Ensure all geographic bucket flags are in scope
  for (const f of MLRO_RED_FLAGS_TAXONOMY) {
    if (f.bucket === "geographic" && !seen.has(f.id)) {
      seen.add(f.id); pool.push(f);
    }
  }

  return pool.slice(0, 60);
}

// ── Common-sense rules context builder ───────────────────────────────────────

const SECTOR_TOPICS = {
  precious_metals: ["dpms_precious_metals", "cahra_jurisdiction", "tbml", "cdd", "edd", "sanctions_screening"],
  real_estate: ["real_estate_ml", "cdd", "edd", "sanctions_screening"],
  crypto: ["vasp_crypto", "travel_rule", "cdd", "edd", "sanctions_screening"],
  bank: ["correspondent_banking", "cdd", "edd", "sanctions_screening"],
  npo: ["npo_risk", "cdd", "edd", "sanctions_screening"],
  default: ["cdd", "edd", "ongoing_monitoring", "sanctions_screening", "pep_handling"],
};

function pickTopics(sector: string): string[] {
  const s = sector.toLowerCase();
  if (/gold|precious|bullion|dpms|lbma|metal/.test(s)) return SECTOR_TOPICS.precious_metals;
  if (/real estate|property/.test(s)) return SECTOR_TOPICS.real_estate;
  if (/crypto|vasp|virtual/.test(s)) return SECTOR_TOPICS.crypto;
  if (/bank|finance/.test(s)) return SECTOR_TOPICS.bank;
  if (/npo|charity|nonprofit/.test(s)) return SECTOR_TOPICS.npo;
  return SECTOR_TOPICS.default;
}

// ── Peer benchmark context builder ───────────────────────────────────────────

function pickBaseline(sector: string, entityType: string): BenchmarkSector {
  const s = sector.toLowerCase();
  const e = entityType.toLowerCase();
  if (/gold|precious|dpms|metal/.test(s)) {
    if (/refin/.test(e)) return "dpms_refinery";
    if (/wholesale|bulk|dealer/.test(e)) return "bullion_wholesale";
    return "dpms_retail";
  }
  if (/real estate|property/.test(s)) return "real_estate";
  if (/crypto|vasp|virtual/.test(s)) return "vasp";
  if (/npo|charity/.test(s)) return "npo";
  if (/bank/.test(s)) return "bank_corporate";
  return "dpms_retail";
}

// ── Dynamic system prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(
  flagPool: MlroRedFlag[],
  topics: string[],
  baselineSector: BenchmarkSector,
): string {
  // Taxonomy flags block
  const flagLines = flagPool
    .map((f) => `[${f.bucket}] id:"${f.id}" | "${f.label}"`)
    .join("\n");

  // Common-sense rules block
  const rules = COMMON_SENSE_RULES
    .filter((r) => topics.includes(r.topic))
    .slice(0, 20);
  const ruleLines = rules
    .map((r) => `• [${r.id}] ${r.rule} (${r.doctrineAnchor})`)
    .join("\n");

  // Peer baseline block
  const baseline = PEER_BASELINES[baselineSector];
  const baselineLines = Object.entries(baseline.dimensions)
    .map(([k, v]) => `  ${k}: mean ${v.mean} ${v.unit} ±${v.std}${v.note ? ` [${v.note}]` : ""}`)
    .join("\n");

  return `You are a Senior MLRO and Compliance Specialist at a UAE-regulated financial institution. Generate a structured Risk Profile Summary. Apply UAE FDL 10/2025, FATF Recommendations, and CBUAE AML Standards.

=== TAXONOMY FLAGS PRE-SELECTED FOR THIS SECTOR/JURISDICTION (${flagPool.length} flags from ${MLRO_RED_FLAGS_TAXONOMY.length} total) ===
Your redFlagsToWatch MUST be drawn from this vetted list. Do not invent flags outside it.
Select 6–10 of the most applicable entries and provide a specific rationale for each.

${flagLines}

=== SECTOR REGULATORY RULES (${rules.length} rules — cite doctrineAnchor verbatim) ===
${ruleLines}

=== PEER BASELINE: ${baseline.label} ===
${baselineLines}

=== TASK ===
Evaluate the entity and output ONLY valid JSON in this exact shape:
{
  "entityOverview": {
    "entityType": "string",
    "sector": "string",
    "jurisdiction": "string — full country name + ISO-2 in brackets",
    "riskScore": number,
    "adverseMedia": boolean
  },
  "inherentRiskFactors": [
    {
      "title": "string — e.g. Jurisdictional Risk — Elevated",
      "level": "elevated"|"high"|"medium-high"|"medium"|"low",
      "bullets": ["3-5 specific risk points with FATF/FDL citations"]
    }
  ],
  "mitigatingFactors": [
    { "factor": "string", "impact": "string" }
  ],
  "residualRiskAssessment": [
    { "dimension": "Country / Jurisdiction", "rating": "high"|"medium"|"low"|"not_indicated" },
    { "dimension": "Sector / Business Type", "rating": "high"|"medium"|"low"|"not_indicated" },
    { "dimension": "Adverse Media", "rating": "high"|"medium"|"low"|"not_indicated" },
    { "dimension": "Transaction Pattern", "rating": "high"|"medium"|"low"|"not_indicated" },
    { "dimension": "PEP / Sanctions Exposure", "rating": "high"|"medium"|"low"|"not_indicated" }
  ],
  "overallResidualRisk": "high"|"medium"|"low",
  "dueDiligenceActions": [
    "specific action with regulatory basis (cite doctrineAnchor from the rules section above where applicable)"
  ],
  "redFlagsToWatch": [
    {
      "id": "taxonomy id exactly as shown above",
      "label": "taxonomy label exactly as shown above",
      "bucket": "transaction"|"customer"|"supplier"|"geographic"|"product"|"behavioral"|"regulatory",
      "rationale": "1-sentence explanation of why this flag is specifically relevant for this entity"
    }
  ],
  "taxonomyCoverage": {
    "totalConsidered": ${flagPool.length},
    "flagsSelected": 0
  },
  "conclusion": {
    "narrative": "2-3 sentences summarising composite risk and key drivers",
    "onboardingDecision": "proceed_standard"|"proceed_standard_plus"|"proceed_edd"|"escalate"|"decline",
    "onboardingRationale": "recommended path with specific next steps"
  }
}

Rules:
- Exactly 3 inherentRiskFactors: Jurisdictional, Sector, Product/Transaction
- 2–4 mitigatingFactors
- 6–8 dueDiligenceActions citing the regulatory rules above
- 6–10 redFlagsToWatch selected ONLY from the taxonomy list above
- Set taxonomyCoverage.flagsSelected to the actual count of redFlagsToWatch entries
- Do NOT fabricate adverse media, sanctions hits, or regulatory citations not in the rules block`;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK: RiskProfileSummaryResult = {
  entityOverview: { entityType: "Unknown", sector: "Unknown", jurisdiction: "Unknown", riskScore: 50, adverseMedia: false },
  inherentRiskFactors: [],
  mitigatingFactors: [],
  residualRiskAssessment: [
    { dimension: "Country / Jurisdiction", rating: "not_indicated" },
    { dimension: "Sector / Business Type", rating: "not_indicated" },
    { dimension: "Adverse Media", rating: "not_indicated" },
    { dimension: "Transaction Pattern", rating: "not_indicated" },
    { dimension: "PEP / Sanctions Exposure", rating: "not_indicated" },
  ],
  overallResidualRisk: "medium",
  dueDiligenceActions: [],
  redFlagsToWatch: [],
  taxonomyCoverage: { totalConsidered: 0, flagsSelected: 0 },
  conclusion: {
    narrative: "API key not configured — manual risk assessment required.",
    onboardingDecision: "proceed_standard",
    onboardingRationale: "Manual review required.",
  },
};

// ── Route ─────────────────────────────────────────────────────────────────────

export const POST = (req: Request) =>
  withMlroLlm<Body, RiskProfileSummaryResult>(req, {
    route: "mlro-advisor/risk-profile-summary",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 4096,
    parseBody: (raw): Body | null => {
      if (!raw || typeof raw !== "object") return null;
      const b = raw as Partial<Body>;
      if (!b.entityName?.trim()) return null;
      return {
        entityName: b.entityName,
        entityType: b.entityType,
        sector: b.sector,
        jurisdiction: b.jurisdiction,
        riskScore: typeof b.riskScore === "number" ? b.riskScore : 50,
        adverseMedia: b.adverseMedia ?? false,
        context: b.context,
      };
    },
    buildRequest: (body) => {
      const flagPool = buildFlagPool(body.sector ?? "", body.jurisdiction ?? "");
      const topics = pickTopics(body.sector ?? "");
      const baselineSector = pickBaseline(body.sector ?? "", body.entityType ?? "");
      const system = buildSystemPrompt(flagPool, topics, baselineSector);

      const lines: string[] = [
        `Entity name: ${sanitizeField(body.entityName, 300)}`,
      ];
      if (body.entityType) lines.push(`Entity type: ${sanitizeField(body.entityType, 100)}`);
      if (body.sector) lines.push(`Sector: ${sanitizeField(body.sector, 150)}`);
      if (body.jurisdiction) lines.push(`Jurisdiction: ${sanitizeField(body.jurisdiction, 100)}`);
      lines.push(`Risk score: ${body.riskScore ?? 50}/100`);
      lines.push(`Adverse media: ${body.adverseMedia ? "Yes — adverse media detected" : "None detected"}`);
      if (body.context) lines.push(`Additional context: ${sanitizeText(body.context, 800)}`);

      return {
        system,
        userContent: `${lines.join("\n")}\n\nGenerate a comprehensive Risk Profile Summary and output the structured JSON.`,
      };
    },
    parseResult: (text): RiskProfileSummaryResult => {
      const parsed = parseLlmJson<RiskProfileSummaryResult>(text);
      if (!parsed) {
        return { ...FALLBACK, conclusion: { ...FALLBACK.conclusion, narrative: "AI response could not be parsed — manual risk assessment required." } };
      }
      // Ensure taxonomyCoverage is accurate
      const flagsSelected = Array.isArray(parsed.redFlagsToWatch) ? parsed.redFlagsToWatch.length : 0;
      return {
        ...parsed,
        taxonomyCoverage: {
          totalConsidered: parsed.taxonomyCoverage?.totalConsidered ?? 0,
          flagsSelected,
        },
      };
    },
    onSuccess: (result, body) => {
      writeAuditEvent(
        "mlro",
        "advisor.risk-profile-summary",
        `${body.entityName.trim()} → overallRisk: ${result.overallResidualRisk}, decision: ${result.conclusion.onboardingDecision}, flags: ${result.taxonomyCoverage.flagsSelected}/${result.taxonomyCoverage.totalConsidered}`,
      );
    },
    offlineFallback: FALLBACK,
  });
