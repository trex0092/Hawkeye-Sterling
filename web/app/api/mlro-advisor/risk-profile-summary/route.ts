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
 * Orders and returns all 719 flags from the taxonomy.
 * Sector- and jurisdiction-specific flags are added first (most relevant),
 * followed by universal flags, then every remaining flag — guaranteeing
 * the LLM always has the complete taxonomy available to choose from.
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

  // ── Sector-specific searches ────────────────────────────────────────────────
  if (/gold|precious|bullion|dpms|lbma|refin|metal/.test(s)) {
    // Core precious-metals / DPMS transaction flags
    add(searchRedFlags("gold"));
    add(searchRedFlags("precious"));
    add(searchRedFlags("lbma"));
    add(searchRedFlags("assay"));
    add(searchRedFlags("refinery"));
    add(searchRedFlags("bullion"));
    add(searchRedFlags("cahra"));
    add(searchRedFlags("purity"));
    add(searchRedFlags("certificate"));
    // Extended physical-form coverage
    add(searchRedFlags("scrap"));
    add(searchRedFlags("dust"));
    add(searchRedFlags("jewelry"));
    add(searchRedFlags("alloy"));
    add(searchRedFlags("coin"));
    add(searchRedFlags("weight"));
    add(searchRedFlags("chain"));
    add(searchRedFlags("conflict mineral"));
    add(searchRedFlags("diamonds"));           // Diamonds / gemstones + Kimberley Process
    // Supplier-chain (critical for DPMS sourcing from third parties)
    add(searchRedFlags("supplier lbma"));
    add(searchRedFlags("supplier refinery"));
    add(searchRedFlags("supplier conflict"));
    add(searchRedFlags("supplier purity"));
    add(searchRedFlags("supplier assay"));
    add(searchRedFlags("supplier site"));
    add(searchRedFlags("supplier certification"));
    add(searchRedFlags("supplier financial"));    // financial statements / position
    add(searchRedFlags("supplier corporate"));    // ownership / structure opaque
    add(searchRedFlags("supplier capacity"));     // capacity undocumented / exceeded
    add(searchRedFlags("supplier pricing"));      // pricing inconsistency / below cost
    add(searchRedFlags("supplier contract"));     // contract absent / vague / renegotiated
    add(searchRedFlags("supplier logistics"));    // transport / logistics partner high-risk
    add(searchRedFlags("supplier communication")); // evasive / intermediary communication
    add(searchRedFlags("supplier payment"));      // unusual payment terms / routing
    add(searchRedFlags("supplier references"));   // unverifiable / internal-only references
    add(searchRedFlags("supplier regulatory"));   // regulatory license absent / expired / forged
    add(searchRedFlags("supplier ultimate"));     // ultimate owner undisclosed / sanctioned
    add(searchRedFlags("supplier ownership"));    // ownership concealed through layers
    add(searchRedFlags("supplier production"));   // production documentation absent / forged
    add(searchRedFlags("supplier bank"));         // bank relationships undisclosed / weak
    add(searchRedFlags("supplier related"));      // supplier related to customers / employees
    add(searchRedFlags("supplier previously"));   // previously sanctioned / under regulatory action
    add(searchRedFlags("supplier transport"));    // transport fleet / logistics arrangements
    add(searchRedFlags("supplier market"));       // market share suspicious / dominance
    add(searchRedFlags("supplier reputation"));   // reputation undocumented / poor
    add(searchRedFlags("iso"));                   // Supplier ISO 9001 absent
    add(searchRedFlags("cryptocurrency payment")); // crypto for precious metals / unverifiable
  }
  if (/real estate|property|mortgage/.test(s)) {
    add(searchRedFlags("real estate"));
    add(searchRedFlags("property"));
    add(searchRedFlags("mortgage"));
    add(searchRedFlags("title"));
  }
  if (/crypto|vasp|bitcoin|virtual asset/.test(s)) {
    add(searchRedFlags("crypto"));
    add(searchRedFlags("vasp"));
    add(searchRedFlags("mixing"));
    add(searchRedFlags("wallet"));
    add(searchRedFlags("virtual asset"));
    add(searchRedFlags("blockchain"));
    add(searchRedFlags("exchange"));
  }
  if (/bank|finance|lending/.test(s)) {
    add(searchRedFlags("bank"));
    add(searchRedFlags("correspondent"));
    add(searchRedFlags("vostro"));
    add(searchRedFlags("wire transfer"));
  }
  if (/npo|charity|nonprofit|foundation/.test(s)) {
    add(searchRedFlags("npo"));
    add(searchRedFlags("charity"));
    add(searchRedFlags("fund"));
    add(searchRedFlags("donation"));
  }
  if (/trade finance|letter of credit|documentary credit|import export/.test(s)) {
    add(searchRedFlags("trade finance"));
    add(searchRedFlags("bill of lading"));
    add(searchRedFlags("customs"));
    add(searchRedFlags("incoterms"));
    add(searchRedFlags("shipping"));
    add(searchRedFlags("misdeclared"));
  }
  if (/wealth|private bank|family office|hnwi|high net worth/.test(s)) {
    add(searchRedFlags("fund"));
    add(searchRedFlags("fund manager"));         // fund manager experience / history
    add(searchRedFlags("fund valuation"));       // valuation methodology opaque
    add(searchRedFlags("fund redemption"));      // redemption restrictions / timing
    add(searchRedFlags("trust"));
    add(searchRedFlags("equity instruments"));
    add(searchRedFlags("loan instruments"));
    add(searchRedFlags("structured product"));
    add(searchRedFlags("derivatives"));
    add(searchRedFlags("debt instruments"));
    add(searchRedFlags("annuity"));
    add(searchRedFlags("futures"));
    add(searchRedFlags("forwards"));
    add(searchRedFlags("swaps"));
    add(searchRedFlags("options instruments"));
    add(searchRedFlags("security instruments")); // security instruments collateral / valuation
    add(searchRedFlags("syndication"));
  }
  if (/insurance/.test(s)) {
    add(searchRedFlags("insurance instruments"));
    add(searchRedFlags("annuity"));
  }

  // ── Jurisdiction-specific searches ─────────────────────────────────────────
  if (/turkey|tr\b/.test(j)) {
    add(searchRedFlags("transit"));
    add(searchRedFlags("grey"));
  }
  if (/iran|iraq|syria|north korea|dprk/.test(j)) {
    add(searchRedFlags("sanctioned"));
    add(searchRedFlags("sanctions jurisdiction"));
  }
  if (/russia|rf\b/.test(j)) {
    add(searchRedFlags("russia"));
  }
  if (/uae|united arab emirates|dubai|abu dhabi/.test(j)) {
    add(searchRedFlags("free zone"));
    add(searchRedFlags("cahra"));
  }
  if (/cayman|bvi|british virgin|panama|seychelles|belize|mauritius|samoa|vanuatu/.test(j)) {
    add(searchRedFlags("shell company"));
    add(searchRedFlags("privacy"));
    add(searchRedFlags("offshore"));
  }
  if (/congo|drc|mali|ghana|nigeria|sudan|ethiopia|mozambique|zimbabwe|zambia|tanzania|kenya/.test(j)) {
    add(searchRedFlags("artisanal"));
    add(searchRedFlags("conflict mineral"));
    add(searchRedFlags("conflict zone"));
    add(searchRedFlags("unregulated mining"));
  }

  // ── Universal: core ML/TF/PF typology flags ────────────────────────────────
  add(searchRedFlags("hawala"));
  add(searchRedFlags("invoice"));
  add(searchRedFlags("beneficial owner"));
  add(searchRedFlags("pep"));
  add(searchRedFlags("sanctions"));
  add(searchRedFlags("cash"));
  add(searchRedFlags("jurisdiction"));

  // ── Universal: transaction-level ML patterns ───────────────────────────────
  add(searchRedFlags("structuring"));          // sub-threshold structuring
  add(searchRedFlags("smurfing"));             // smurfing / coordinated deposits
  add(searchRedFlags("layering"));             // cross-border layering patterns
  add(searchRedFlags("velocity"));             // velocity spikes (200%+ increase)
  add(searchRedFlags("circular"));             // circular flows / round-trip
  add(searchRedFlags("invoicing"));            // over-invoicing / under-invoicing
  add(searchRedFlags("placement"));            // placement through informal value transfer
  add(searchRedFlags("integration"));          // integration into legitimate business
  add(searchRedFlags("shell"));                // shell company usage across all buckets
  add(searchRedFlags("dormant"));              // dormant accounts suddenly active
  add(searchRedFlags("third-party"));          // third-party payment routing
  add(searchRedFlags("misdeclared"));          // misdeclared commodity / origin / end-use
  add(searchRedFlags("wire"));                 // wire transfer from sanctioned / high-risk
  add(searchRedFlags("related-party"));        // related-party transaction concentration
  add(searchRedFlags("transfer pricing"));     // transfer pricing manipulation
  add(searchRedFlags("insurance"));            // insurance undervalued / overvalued
  add(searchRedFlags("rapid"));                // rapid deposit-withdrawal cycles
  add(searchRedFlags("round-dollar"));         // round-dollar transactions
  add(searchRedFlags("payment method"));       // payment method inconsistency
  add(searchRedFlags("avoidance"));            // avoidance of electronic trails
  add(searchRedFlags("ultimate"));             // ultimate payer / payee undisclosed
  add(searchRedFlags("mixed fund"));           // mixed-fund transactions (legitimate + suspicious)
  add(searchRedFlags("underground"));          // underground banking indicators
  add(searchRedFlags("same-day"));             // multiple same-day transactions
  add(searchRedFlags("simultaneous"));        // simultaneous buy-sell at loss
  add(searchRedFlags("competitor"));           // timing aligned with competitor difficulties
  add(searchRedFlags("high-frequency"));       // high-frequency settlement changes
  add(searchRedFlags("inconsistent transaction")); // inconsistent transaction size
  add(searchRedFlags("delayed settlement"));   // delayed settlement beyond market standard
  add(searchRedFlags("early settlement"));     // early settlement below fair value
  add(searchRedFlags("frequent bank"));        // frequent bank / account changes

  // ── Universal: customer due-diligence flags ────────────────────────────────
  add(searchRedFlags("adverse media"));        // all 13+ adverse media subtypes (customer)
  add(searchRedFlags("ubo"));                  // UBO chain exceeds transparency threshold
  add(searchRedFlags("address"));              // no verifiable address / mail-forwarding
  add(searchRedFlags("office"));               // office site visit refused / mail-forward
  add(searchRedFlags("website"));              // absent / minimal / anonymized website
  add(searchRedFlags("social media"));         // absent / recent / inconsistent presence
  add(searchRedFlags("business license"));     // license absent / forged / expired
  add(searchRedFlags("financial statements")); // absent / unaudited / inconsistent (customer + supplier)
  add(searchRedFlags("balance sheet"));        // balance sheet inconsistent with volume
  add(searchRedFlags("capital source"));       // undisclosed / sanctioned capital source
  add(searchRedFlags("tax"));                  // tax filings absent / inconsistent
  add(searchRedFlags("shareholder"));          // shareholder register absent
  add(searchRedFlags("communication style"));  // evasive / threatening / manipulative
  add(searchRedFlags("key person"));           // unavailable / problematic key persons
  add(searchRedFlags("referral"));             // undisclosed / suspicious referral source
  add(searchRedFlags("accounting records"));   // accounting records absent
  add(searchRedFlags("employee roster"));      // roster absent / suspiciously sized
  add(searchRedFlags("background check"));     // employee background checks absent
  add(searchRedFlags("customer end-customer")); // end-customer undisclosed / high-risk
  add(searchRedFlags("operating expenses"));   // suspiciously low operating costs
  add(searchRedFlags("trade references"));     // trade references absent / unverifiable
  add(searchRedFlags("email"));               // email domain inconsistent / anonymized
  add(searchRedFlags("linkedin"));            // LinkedIn absent for key staff
  add(searchRedFlags("phone"));              // no verifiable phone / shared across entities
  add(searchRedFlags("credentials"));         // educational / professional credentials unverifiable
  add(searchRedFlags("bank references"));     // bank references absent / from weak institutions
  add(searchRedFlags("corporate documents")); // corporate documents forged / contradictory
  add(searchRedFlags("inventory"));           // inventory inconsistency / turnover anomaly
  add(searchRedFlags("warehouse"));           // warehouse capacity / access / documentation
  add(searchRedFlags("employee reference"));  // employee reference checks absent / superficial
  add(searchRedFlags("customer stated"));     // stated business / purpose mismatched to activity
  add(searchRedFlags("incorporated recently")); // customer incorporated recently
  add(searchRedFlags("prior employment"));    // prior employment / experience unverifiable
  add(searchRedFlags("professional certifications")); // certifications unverifiable
  add(searchRedFlags("customer profile"));    // customer profile inconsistent with transactions
  add(searchRedFlags("unable to"));           // unable to articulate model / explain rationale
  add(searchRedFlags("references all"));      // references all internal
  add(searchRedFlags("customer language"));   // language / sophistication inconsistency
  add(searchRedFlags("prior business"));      // prior business experience unverifiable
  add(searchRedFlags("convicted"));           // customer introduced by convicted individual
  add(searchRedFlags("customer regulatory")); // regulatory status unclear / prior action
  add(searchRedFlags("regulatory license"));  // customer regulatory license revoked/suspended
  add(searchRedFlags("bylaws"));              // customer corporate bylaws absent
  add(searchRedFlags("board meeting"));       // customer board meeting minutes absent
  add(searchRedFlags("debt-equity"));         // customer debt-equity ratio suspicious
  add(searchRedFlags("transaction documentation")); // involvement in transaction documentation weak

  // ── Universal: regulatory action flags ────────────────────────────────────
  add(searchRedFlags("enforcement"));          // regulatory enforcement actions (15 flags)
  add(searchRedFlags("examination"));          // regulatory examination flags (6 flags)
  add(searchRedFlags("sanction designation")); // recent / pending sanction designation
  add(searchRedFlags("seizure"));              // asset seizure initiated
  add(searchRedFlags("forfeiture"));           // asset forfeiture initiated
  add(searchRedFlags("warrant"));              // warrant issued
  add(searchRedFlags("license revocation"));   // business / professional license revocation
  add(searchRedFlags("license suspension"));   // business / professional license suspension
  add(searchRedFlags("travel ban"));           // travel ban imposed / lifted
  add(searchRedFlags("cease"));                // regulatory cease-and-desist issued
  add(searchRedFlags("injunction"));           // regulatory injunction issued
  add(searchRedFlags("cooperation"));          // international / regulatory cooperation
  add(searchRedFlags("remediation"));          // remediation plan overdue / not credible
  add(searchRedFlags("reporting to"));         // regulatory reporting to FIU / prosecutor
  add(searchRedFlags("credit facility"));      // credit facility termination / suspension
  add(searchRedFlags("board removal"));        // board removal / restriction (regulatory)
  add(searchRedFlags("extradition"));          // extradition request pending
  add(searchRedFlags("subpoena"));             // subpoena / production order issued
  add(searchRedFlags("warning"));              // recent regulatory warning / license warning
  add(searchRedFlags("banking relationship")); // banking relationship termination / suspension
  add(searchRedFlags("mutual legal"));         // mutual legal assistance request pending
  add(searchRedFlags("visa"));                 // visa denial
  add(searchRedFlags("passport"));             // passport revocation
  add(searchRedFlags("financial restrictions")); // financial / payment / remittance restrictions
  add(searchRedFlags("information sharing"));  // information sharing / regulatory cooperation
  add(searchRedFlags("production order"));    // production order issued
  add(searchRedFlags("employee termination")); // employee termination / suspension (regulatory cause)
  add(searchRedFlags("export restrictions")); // export restrictions
  add(searchRedFlags("import restrictions")); // import restrictions
  add(searchRedFlags("trade restrictions"));  // trade restrictions
  add(searchRedFlags("regulatory fine"));     // regulatory fine pending
  add(searchRedFlags("regulatory sanction")); // regulatory sanction pending
  add(searchRedFlags("employee suspension")); // employee suspension (regulatory cause)
  add(searchRedFlags("board restriction"));   // board restriction (regulatory cause)
  add(searchRedFlags("payment restrictions")); // payment restrictions
  add(searchRedFlags("remittance"));          // remittance restrictions
  add(searchRedFlags("cross-border coordination")); // cross-border coordination
  add(searchRedFlags("treaty"));              // treaty invocation
  add(searchRedFlags("regulatory precedent")); // regulatory precedent in peer institutions

  // ── Universal: behavioral pattern flags ───────────────────────────────────
  add(searchRedFlags("sudden"));               // sudden-change patterns (33 flags)
  add(searchRedFlags("pattern"));              // "Pattern of..." behavioral flags (69 flags)

  // ── Fill all remaining flags — every one of the 719 is always present ────────
  for (const f of MLRO_RED_FLAGS_TAXONOMY) {
    if (!seen.has(f.id)) { seen.add(f.id); pool.push(f); }
  }

  return pool; // all 719, sector/jurisdiction-relevant flags ordered first
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

=== FULL MLRO RED-FLAG TAXONOMY — ALL ${flagPool.length} FLAGS (ordered: sector-relevant first) ===
Your redFlagsToWatch MUST be drawn from this list. Do not invent flags outside it.
Select 10–14 of the most applicable entries for this specific entity and provide a precise rationale for each.

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
- 10–14 redFlagsToWatch selected ONLY from the taxonomy list above
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
