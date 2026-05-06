// Hawkeye Sterling — screening reasoning layer.
//
// Takes the raw output of quickScreen() + augmentation results and
// produces a fused, audit-grade analysis:
//
//   - Multi-source consensus scoring (weighted by source credibility)
//   - Contradiction detection (one source says LISTED, another DELISTED)
//   - Source credibility tiering (wire services > national press >
//     state media > blogs/social)
//   - Confidence interval on the unified score
//   - Coverage gap report (which categories of vendor are unconfigured)
//   - Negative-finding audit entry (FDL Art.19 evidence-of-search)
//   - Audit-grade rationale (deterministic narrative; LLM optional)

import type { QuickScreenHit, QuickScreenResult, QuickScreenSubject } from "@/lib/api/quickScreen.types";
import { analyseTemporalVelocity, type TemporalVelocity, type DatedArticle } from "./temporalVelocity";
import { counterfactualAnalysis, type CounterfactualResult } from "./counterfactualAnalysis";
import { detectCoOccurrence, type CoOccurrenceResult, type CoOccurrenceArticle } from "./coOccurrence";
import { transliterate, transliterationVariants } from "./transliteration";
import { comparePhoneticTier, type PhoneticTierResult } from "./phoneticTier";
import { assessCommonName, discriminatorPenalty, type CommonNameAssessment } from "./commonNames";

// ── Source credibility tiering ────────────────────────────────────────
//
// Credibility weight on [0,1] used to dampen low-quality outlets when
// consensus-scoring. We err on the side of inclusion — a low-credibility
// source still contributes evidence, just with less weight.

export const CREDIBILITY_TIER: Record<string, number> = {
  // Tier 1: official authoritative lists (1.00)
  "ofac-sdn": 1.0, "hmt-ofsi": 1.0, "eu-eba": 1.0, "un-sc": 1.0,
  "au-dfat": 1.0, "ch-seco": 1.0, "ca-sema": 1.0, "nz-dpmc": 1.0,
  "sg-mas": 1.0, "ae-eocn": 1.0, "jp-meti": 1.0, "fatf": 1.0,
  "worldbank-debar": 1.0,

  // Tier 2: tier-1 commercial PEP/sanctions vendors (0.95)
  "lseg-world-check": 0.95, "dowjones-rc": 0.95, "sayari": 0.95,
  "complyadvantage": 0.95, "acuris-rdc": 0.95, "quantexa": 0.92,
  "bridger-insight": 0.95, "opensanctions-pro": 0.95,
  "castellum": 0.90, "kompany": 0.90, "namescan": 0.88,
  "smartsearch": 0.88, "encompass": 0.90, "themis": 0.88,
  "sigma-ratings": 0.88, "polixis": 0.88, "salv": 0.88,

  // Tier 2: official corporate registries (0.90)
  "companies-house": 0.95, "sec-edgar": 0.95, "fca-register": 0.95,
  "zefix": 0.95, "kvk": 0.92, "bronnoysund": 0.92, "cvr": 0.92,
  "ytj": 0.92, "nz-companies": 0.92, "abr": 0.92, "acra": 0.92,
  "hk-companies": 0.90, "ie-cro": 0.92, "de-handelsregister": 0.90,
  "insee-sirene": 0.92, "in-mca": 0.85, "uae-ded": 0.85,
  "br-receita": 0.90, "mx-sat": 0.85, "ar-igj": 0.85, "co-rues": 0.85,
  "cl-sii": 0.85, "pe-sunat": 0.85, "jp-edinet": 0.92, "kr-dart": 0.92,
  "cn-necips": 0.80, "tw-moea": 0.90, "ru-egrul": 0.80, "ua-yedr": 0.85,
  "kz-mne": 0.80, "tr-mersis": 0.85, "sa-moc": 0.85, "qa-qfc": 0.88,
  "bh-moict": 0.85, "eg-gafi": 0.80, "za-cipc": 0.85, "ng-cac": 0.80,
  "ke-brs": 0.80, "gh-rgd": 0.80, "ky-cima": 0.85, "bm-bma": 0.85,
  "vg-fsc": 0.85, "bs-scb": 0.85,

  // Tier 3: wire services & financial news (0.85)
  "reuters": 0.90, "reuters-rdp": 0.90, "reuters-connect": 0.90, "reuters-rss": 0.90,
  "ap": 0.90, "ap-rss": 0.90, "ap-business-rss": 0.90, "afp": 0.85, "afp-rss": 0.85,
  "bloomberg": 0.85, "ft": 0.85, "factiva": 0.85, "lexisnexis-newsdesk": 0.85,
  "lexisnexis-diligence": 0.85,
  "dpa": 0.85, "anadolu": 0.78, "kyodo": 0.85, "yonhap": 0.85,
  "efe": 0.85, "ansa": 0.85,

  // Tier 4: national press (0.78)
  "nyt": 0.85, "guardian": 0.85, "bbc": 0.85,
  "wapo-rss": 0.85, "nyt-business-rss": 0.85, "nyt-world-rss": 0.85,
  "guardian-rss": 0.85, "guardian-world-rss": 0.85,
  "bbc-rss": 0.85, "bbc-world-rss": 0.85,
  "independent-rss": 0.78, "telegraph-rss": 0.78,
  "npr": 0.85, "npr-rss": 0.85, "cnn": 0.78, "cnn-rss": 0.78,
  "cbs": 0.78, "cbs-rss": 0.78, "axios": 0.78, "axios-rss": 0.78,
  "politico": 0.78, "politico-rss": 0.78, "thehill": 0.75, "thehill-rss": 0.75,
  "dw": 0.85, "dw-rss": 0.85, "france24": 0.85, "france24-rss": 0.85,
  "rfi": 0.82, "rfi-rss": 0.82, "euractiv": 0.80, "euractiv-rss": 0.80,
  "politico-eu": 0.78, "politico-eu-rss": 0.78, "yle": 0.85, "yle-rss": 0.85,
  "aljazeera": 0.78, "aljazeera-rss": 0.78, "al-jazeera": 0.78,
  "alarabiya": 0.72, "alarabiya-rss": 0.72,
  "thenational-rss": 0.78, "nhk": 0.85, "nhk-rss": 0.85,
  "scmp": 0.80, "scmp-rss": 0.80, "asiatimes": 0.72, "asiatimes-rss": 0.72,
  "thehindu": 0.80, "thehindu-rss": 0.80, "indiatoday": 0.72, "indiatoday-rss": 0.72,
  "hindustantimes": 0.78, "hindustantimes-rss": 0.78,
  "globalnews-rss": 0.80, "cbc": 0.85, "cbc-rss": 0.85,
  "abc-au-rss": 0.85, "africanews": 0.78, "africanews-rss": 0.78,
  "allafrica-rss": 0.72,

  // International / agency
  "un-news-rss": 0.95, "ec-press-rss": 0.95,

  // Tier 5: financial-data & specialty (0.78)
  "factset": 0.88, "spglobal": 0.88, "moodys-orbis": 0.85,
  "alphasense": 0.82, "polygon": 0.78, "tiingo": 0.75,
  "marketaux": 0.72, "alphavantage": 0.72, "stocknews": 0.65,
  "stocktwits": 0.50, "thenewsapi": 0.68, "newsapi": 0.70,
  "gnews": 0.68, "newscatcher": 0.68, "newsdata": 0.65, "worldnews": 0.65,
  "currents": 0.65, "mediastack": 0.65, "eventregistry": 0.78,
  "diffbot": 0.78, "webz": 0.72, "aylien": 0.78, "contextualweb": 0.65,
  "serpapi-googlenews": 0.75, "bing-news": 0.78, "bing-web": 0.65,
  "google-news-rss": 0.78,

  // Tier 6: social / aggregator / blogs (0.50)
  "hackernews": 0.50, "reddit": 0.45, "mastodon": 0.40,
  "buzzsumo": 0.55, "mention.com": 0.55, "brand24": 0.55,
  "brandwatch": 0.62, "talkwalker": 0.62, "onclusive": 0.65,
  "newsriver": 0.62, "cision": 0.65,

  // Specialty risk intel
  "rane": 0.80, "maplecroft": 0.80, "janes": 0.80, "signal-ai": 0.78,
  "dataminr": 0.80, "zignal": 0.78, "quid": 0.75, "meltwater": 0.78,
  "mediacloud": 0.65, "cryptopanic": 0.55,
  "lexology": 0.78, "propublica": 0.85, "occrp-aleph": 0.92,

  // Crypto-finance
  "benzinga": 0.62, "seekingalpha": 0.55, "investing.com": 0.62,
  "ice-connect": 0.78, "yahoo-finance": 0.65, "economist": 0.85,

  // Regulatory & risk-specific
  "risk.net": 0.82, "complianceweek": 0.82, "aml-watchdog": 0.78, "pegasus": 0.62,

  // Wikipedia knowledge graph
  "wikidata": 0.65,

  // Local matcher (always trusted - it's our deterministic engine)
  "local": 1.0,

  // LLM-prompt-based adverse-media recall (Claude). We weight it 0.65
  // — strong enough to escalate from CLEAR to POSSIBLE on its own, but
  // never enough to drive a POSITIVE rating without corroboration from
  // a higher-tier source. Operators should manually verify LLM-only
  // hits since model recall isn't perfect.
  "claude-adverse-media": 0.65,

  // URL-direct ingestion: trust matches the outlet domain we extract;
  // baseline 0.75 since the operator explicitly pointed us at it.
  "url-ingest": 0.75,
};

export function credibilityFor(source: string): number {
  return CREDIBILITY_TIER[source] ?? 0.55;
}

// ── Multi-source consensus ────────────────────────────────────────────

export interface ConsensusInput {
  source: string;            // adapter id
  evidence: "match" | "no_match" | "delisted" | "uncertain";
  rawScore?: number;          // 0..100, optional
}

export interface ConsensusOutput {
  unified: number;             // 0..100
  confidence: { low: number; high: number };  // 95% credible interval
  agreementLevel: "strong" | "moderate" | "split" | "weak";
  sourcesFor: number;
  sourcesAgainst: number;
  sourcesUncertain: number;
  weightedFor: number;         // sum of credibility weights
  weightedAgainst: number;
}

/**
 * Weighted-vote consensus across heterogeneous source signals.
 *
 * Each source contributes its credibility weight × evidence direction;
 * we map the resulting fraction to a 0..100 unified score and compute
 * an agreement level + 95% confidence interval via Wilson interval.
 */
export function multiSourceConsensus(inputs: ConsensusInput[]): ConsensusOutput {
  if (inputs.length === 0) {
    return {
      unified: 0,
      confidence: { low: 0, high: 0 },
      agreementLevel: "weak",
      sourcesFor: 0, sourcesAgainst: 0, sourcesUncertain: 0,
      weightedFor: 0, weightedAgainst: 0,
    };
  }

  let weightedFor = 0;
  let weightedAgainst = 0;
  let weightedTotal = 0;
  let sourcesFor = 0;
  let sourcesAgainst = 0;
  let sourcesUncertain = 0;

  for (const inp of inputs) {
    const w = credibilityFor(inp.source);
    weightedTotal += w;
    if (inp.evidence === "match") {
      // If a raw score is provided, blend it with the weight rather than
      // counting a 35% match as full strength.
      const intensity = typeof inp.rawScore === "number" ? Math.max(0, Math.min(1, inp.rawScore / 100)) : 1;
      weightedFor += w * intensity;
      sourcesFor += 1;
    } else if (inp.evidence === "no_match" || inp.evidence === "delisted") {
      weightedAgainst += w;
      sourcesAgainst += 1;
    } else {
      sourcesUncertain += 1;
    }
  }

  // Unified score is driven by the weighted strength of POSITIVE
  // evidence relative to a fixed normalising constant (the credibility
  // weight of a single tier-1 authority = 1.0). This matches the way
  // a human analyst reasons — one credible affirming source already
  // takes you past CLEAR; multiple corroborating sources push higher.
  // Absence of hits (uncertain) does NOT push the score down.
  const POSITIVE_NORMALISER = 1.5;     // ~ 1.5 tier-1-credibility units = saturation
  const unified = Math.min(100, Math.round((weightedFor / POSITIVE_NORMALISER) * 100));

  // Wilson 95% CI: only meaningful when we have explicit deny signals.
  // Otherwise the band is [unified, 100] reflecting "we know the floor,
  // ceiling is uncertain because absent vendors might surface evidence".
  const n = sourcesFor + sourcesAgainst;
  let low: number;
  let high: number;
  if (n === 0) {
    low = unified;
    high = 100;
  } else {
    const p = sourcesFor / n;
    const z = 1.96;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    low = Math.max(0, Math.round((center - margin) * 100));
    high = Math.min(100, Math.round((center + margin) * 100));
  }

  let agreementLevel: ConsensusOutput["agreementLevel"];
  if (sourcesFor === 0 && sourcesAgainst === 0) {
    // No explicit evidence either way — say so honestly.
    agreementLevel = "weak";
  } else if (sourcesFor > 0 && sourcesAgainst === 0) {
    // Multiple affirming sources, no contradictions
    agreementLevel = sourcesFor >= 3 ? "strong" : sourcesFor >= 2 ? "moderate" : "weak";
  } else if (sourcesAgainst > 0 && sourcesFor === 0) {
    agreementLevel = sourcesAgainst >= 3 ? "strong" : "moderate";
  } else {
    // Mixed evidence
    const fractionFor = sourcesFor / (sourcesFor + sourcesAgainst);
    if (fractionFor > 0.85 || fractionFor < 0.15) agreementLevel = "strong";
    else if (fractionFor > 0.65 || fractionFor < 0.35) agreementLevel = "moderate";
    else agreementLevel = "split";
  }

  return {
    unified,
    confidence: { low, high },
    agreementLevel,
    sourcesFor, sourcesAgainst, sourcesUncertain,
    weightedFor: Math.round(weightedFor * 100) / 100,
    weightedAgainst: Math.round(weightedAgainst * 100) / 100,
  };
}

// ── Contradiction detection ───────────────────────────────────────────

export interface Contradiction {
  topic: string;                     // e.g. "OFAC-listing"
  affirming: Array<{ source: string; detail: string }>;
  denying: Array<{ source: string; detail: string }>;
  severity: "critical" | "warn" | "informational";
}

/**
 * Detects cross-source disagreement on the same factual claim. The
 * input is the union of all hits / records / articles surfaced by the
 * screening pipeline annotated with a topic key (we infer the topic
 * from the source list when the caller doesn't provide one).
 */
export function detectContradictions(items: Array<{
  source: string;
  topic?: string;
  stance: "affirm" | "deny";
  detail?: string;
}>): Contradiction[] {
  const byTopic = new Map<string, { affirming: Array<{ source: string; detail: string }>; denying: Array<{ source: string; detail: string }> }>();
  for (const it of items) {
    const topic = it.topic ?? defaultTopicFor(it.source);
    if (!topic) continue;
    const bucket = byTopic.get(topic) ?? { affirming: [], denying: [] };
    if (it.stance === "affirm") bucket.affirming.push({ source: it.source, detail: it.detail ?? "" });
    else bucket.denying.push({ source: it.source, detail: it.detail ?? "" });
    byTopic.set(topic, bucket);
  }
  const contradictions: Contradiction[] = [];
  for (const [topic, b] of byTopic) {
    if (b.affirming.length === 0 || b.denying.length === 0) continue;
    // Severity: critical when an authoritative source disagrees with another
    // authoritative source; warn when one tier-1 disagrees with tier-2+;
    // informational otherwise.
    const maxA = Math.max(...b.affirming.map((x) => credibilityFor(x.source)), 0);
    const maxD = Math.max(...b.denying.map((x) => credibilityFor(x.source)), 0);
    const severity: Contradiction["severity"] =
      maxA >= 0.95 && maxD >= 0.95 ? "critical" :
      maxA >= 0.85 || maxD >= 0.85 ? "warn" :
      "informational";
    contradictions.push({ topic, affirming: b.affirming, denying: b.denying, severity });
  }
  return contradictions;
}

function defaultTopicFor(source: string): string {
  if (/ofac|hmt|eu-eba|un-sc|au-dfat|ch-seco|ca-sema|sg-mas|ae-eocn|jp-meti|fatf|worldbank-debar/.test(source)) return "sanctions-listing";
  if (/companies|cipc|cac|brs|moica|registry|cro|edgar|sirene|edinet|necips|moea|egrul|sat|igj|rues|sii|sunat|qfc|gafi/.test(source)) return "registration-status";
  if (/lseg|dowjones|sayari|complyadvantage|acuris|quantexa|castellum|kompany|namescan|sigma|polixis|salv|themis|encompass|smartsearch|bridger|opensanctions/.test(source)) return "pep-sanctions-status";
  return "adverse-media";
}

// ── Coverage gap report ───────────────────────────────────────────────

export interface CoverageGap {
  category: "news" | "sanctions" | "registry" | "country-registry" | "country-sanctions" | "kyc" | "onchain" | "free";
  configured: number;
  unconfigured: number;
  recommendation?: string;
}

export interface CoverageGapReport {
  totalConfigured: number;
  totalAvailable: number;
  byCategory: CoverageGap[];
  warnings: string[];
}

export function buildCoverageGapReport(opts: {
  newsProvidersConfigured: number; newsProvidersAvailable: number;
  sanctionsConfigured: number; sanctionsAvailable: number;
  registryConfigured: number; registryAvailable: number;
  countryRegistryConfigured: number; countryRegistryAvailable: number;
  countrySanctionsConfigured: number; countrySanctionsAvailable: number;
  kycConfigured: number; kycAvailable: number;
  onchainConfigured: number; onchainAvailable: number;
  freeConfigured: number; freeAvailable: number;
}): CoverageGapReport {
  const byCategory: CoverageGap[] = [
    { category: "news", configured: opts.newsProvidersConfigured, unconfigured: opts.newsProvidersAvailable - opts.newsProvidersConfigured },
    { category: "sanctions", configured: opts.sanctionsConfigured, unconfigured: opts.sanctionsAvailable - opts.sanctionsConfigured },
    { category: "registry", configured: opts.registryConfigured, unconfigured: opts.registryAvailable - opts.registryConfigured },
    { category: "country-registry", configured: opts.countryRegistryConfigured, unconfigured: opts.countryRegistryAvailable - opts.countryRegistryConfigured },
    { category: "country-sanctions", configured: opts.countrySanctionsConfigured, unconfigured: opts.countrySanctionsAvailable - opts.countrySanctionsConfigured },
    { category: "kyc", configured: opts.kycConfigured, unconfigured: opts.kycAvailable - opts.kycConfigured },
    { category: "onchain", configured: opts.onchainConfigured, unconfigured: opts.onchainAvailable - opts.onchainConfigured },
    { category: "free", configured: opts.freeConfigured, unconfigured: opts.freeAvailable - opts.freeConfigured },
  ];
  const warnings: string[] = [];
  if (opts.newsProvidersConfigured === 0) warnings.push("No news/adverse-media vendor configured beyond GDELT — high false-negative risk for adverse media.");
  if (opts.sanctionsConfigured === 0) warnings.push("No commercial PEP/sanctions vendor configured — relying on free OpenSanctions only.");
  if (opts.countrySanctionsConfigured === 0) warnings.push("No country-issued sanctions list configured — OFAC/HMT/EU mirrors via OpenSanctions only.");
  if (opts.onchainConfigured === 0) warnings.push("No on-chain crypto vendor configured — virtual-asset risk cannot be assessed.");
  const totalConfigured = byCategory.reduce((s, c) => s + c.configured, 0);
  const totalAvailable = byCategory.reduce((s, c) => s + c.configured + c.unconfigured, 0);
  return { totalConfigured, totalAvailable, byCategory, warnings };
}

// ── Audit-grade rationale (deterministic) ─────────────────────────────

export interface ScreeningReasoning {
  consensus: ConsensusOutput;
  contradictions: Contradiction[];
  coverage: CoverageGapReport;
  rationale: string;
  evidenceTrail: Array<{ source: string; weight: number; outcome: "match" | "no_match" | "delisted" | "uncertain"; detail?: string }>;
  art19NegativeFinding?: string;     // populated when no hits
  temporalVelocity?: TemporalVelocity;
  counterfactual?: CounterfactualResult;
  coOccurrence?: CoOccurrenceResult;
  transliteration?: { script: string; transliterated: string; variants: string[] };
  phoneticTier?: Array<{ candidateName: string; result: PhoneticTierResult }>;
  commonNameAssessment?: CommonNameAssessment & {
    discriminatorPenalty: number;
    rawScoreBeforeDiscount: number;
    discriminatorsFound: { dob: boolean; nationality: boolean; idNumber: boolean };
  };
}

export function buildScreeningReasoning(opts: {
  subject: QuickScreenSubject;
  result: QuickScreenResult;
  consensusInputs: ConsensusInput[];
  contradictionItems: Array<{ source: string; topic?: string; stance: "affirm" | "deny"; detail?: string }>;
  coverage: CoverageGapReport;
  articles?: DatedArticle[];                         // for temporal velocity
  coOccurrenceArticles?: CoOccurrenceArticle[];      // for co-occurrence
  knownSanctioned?: Array<{ name: string; listId: string }>;
}): ScreeningReasoning {
  const consensus = multiSourceConsensus(opts.consensusInputs);
  const contradictions = detectContradictions(opts.contradictionItems);

  const evidenceTrail = opts.consensusInputs.map((i) => ({
    source: i.source,
    weight: credibilityFor(i.source),
    outcome: i.evidence,
    ...(typeof i.rawScore === "number" ? { detail: `score=${i.rawScore}` } : {}),
  }));

  // Temporal velocity (only when we have dated articles)
  const temporalVelocity = opts.articles && opts.articles.length > 0
    ? analyseTemporalVelocity(opts.articles)
    : undefined;

  // Counterfactual leave-one-out — always run; cheap
  const counterfactual = counterfactualAnalysis(opts.consensusInputs);

  // Co-occurrence — only when we have article text
  const coOccurrence = opts.coOccurrenceArticles && opts.coOccurrenceArticles.length > 0
    ? detectCoOccurrence(opts.subject.name, opts.coOccurrenceArticles, opts.knownSanctioned)
    : undefined;

  // Transliteration of the subject name (only meaningful for non-Latin)
  const tr = transliterate(opts.subject.name);
  const transliteration = tr.scriptDetected !== "latin" && tr.scriptDetected !== "unknown"
    ? { script: tr.scriptDetected, transliterated: tr.transliterated, variants: transliterationVariants(opts.subject.name) }
    : undefined;

  // Phonetic-tier comparison against the top hits' candidate names
  const phoneticTier = opts.result.hits.length > 0
    ? opts.result.hits.slice(0, 5).map((h) => ({
        candidateName: h.candidateName,
        result: comparePhoneticTier(opts.subject.name, h.candidateName),
      }))
    : undefined;

  // Common-name assessment + discriminator penalty
  const cna = assessCommonName(opts.subject.name);
  const discriminatorsFound = {
    dob: !!opts.subject.dateOfBirth,
    nationality: !!(opts.subject.nationality ?? opts.subject.jurisdiction),
    idNumber: !!(opts.subject.passportNumber ?? opts.subject.nationalIdNumber),
  };
  const penalty = discriminatorPenalty({
    isCommonName: cna.isCommon,
    hasDob: discriminatorsFound.dob,
    hasNationality: discriminatorsFound.nationality,
    hasIdNumber: discriminatorsFound.idNumber,
  });
  const rawScoreBeforeDiscount = consensus.unified;
  if (penalty < 1.0) {
    consensus.unified = Math.round(consensus.unified * penalty);
    // Tighten the CI band downward too — operator should know the rating
    // is artificially constrained by missing identifiers.
    consensus.confidence = {
      low: Math.round(consensus.confidence.low * penalty),
      high: Math.min(consensus.confidence.high, Math.round(consensus.confidence.high * (penalty + 0.2))),
    };
  }
  const commonNameAssessment = cna.isCommon
    ? { ...cna, discriminatorPenalty: penalty, rawScoreBeforeDiscount, discriminatorsFound }
    : undefined;

  const lines: string[] = [];
  lines.push(`Subject "${opts.subject.name}"${opts.subject.jurisdiction ? ` (${opts.subject.jurisdiction})` : ""} screened against ${opts.coverage.totalConfigured}/${opts.coverage.totalAvailable} configured intelligence sources.`);
  lines.push(`Local watchlist matcher: ${opts.result.hits.length} hit(s); top score ${opts.result.topScore}; severity "${opts.result.severity}".`);
  if (consensus.sourcesFor === 0 && consensus.sourcesAgainst === 0) {
    lines.push(`Cross-source evidence: no positive hits across ${consensus.sourcesUncertain} consulted sources. Unified score ${consensus.unified}/100. This is the typical CLEAR signature — absence of evidence is documented per FDL Art.19, but does NOT prove absence of risk; review adverse-media articles below before disposing.`);
  } else if (consensus.sourcesFor > 0) {
    lines.push(`Cross-source evidence: ${consensus.sourcesFor} affirming source(s) (weighted ${consensus.weightedFor.toFixed(2)}), ${consensus.sourcesAgainst} explicit denial(s), ${consensus.sourcesUncertain} no-data. Unified score ${consensus.unified}/100 (95% CI [${consensus.confidence.low},${consensus.confidence.high}]). Agreement: ${consensus.agreementLevel}.`);
  } else {
    lines.push(`Cross-source evidence: ${consensus.sourcesAgainst} explicit denial(s), 0 affirming. Unified score ${consensus.unified}/100. Subject appears CLEAR.`);
  }
  if (contradictions.length > 0) {
    const critical = contradictions.filter((c) => c.severity === "critical");
    if (critical.length > 0) {
      lines.push(`${critical.length} CRITICAL contradiction(s) detected: ${critical.map((c) => c.topic).join(", ")}. Two authoritative sources disagree — manual review required.`);
    } else {
      lines.push(`${contradictions.length} non-critical contradiction(s) detected; document but proceed.`);
    }
  } else {
    lines.push("No cross-source contradictions detected.");
  }
  if (opts.coverage.warnings.length > 0) {
    lines.push("Coverage warnings: " + opts.coverage.warnings.join("; "));
  }
  lines.push("Regulatory basis: FATF R.10 (CDD), FDL 10/2025 Art.10/Art.19 (ongoing monitoring + 10-year evidence-of-search).");

  const rationale = lines.join(" ");

  // Art.19 negative-finding entry when result is CLEAR with no hits.
  let art19NegativeFinding: string | undefined;
  if (opts.result.hits.length === 0 && consensus.sourcesFor === 0) {
    art19NegativeFinding = `[Art.19] Negative finding logged ${new Date().toISOString()}: subject "${opts.subject.name}" screened against ${opts.coverage.totalConfigured} sources; zero affirming evidence. Documented per FDL 10/2025 Art.19 evidence-of-search obligation.`;
  }

  // Append signals to the rationale
  const extraSignals: string[] = [];
  if (commonNameAssessment) {
    const missing: string[] = [];
    if (!discriminatorsFound.dob) missing.push("date of birth");
    if (!discriminatorsFound.nationality) missing.push("nationality");
    if (!discriminatorsFound.idNumber) missing.push("passport / national-ID number");
    extraSignals.push(`COMMON-NAME MATCH: ${commonNameAssessment.reason} Subject record is missing: ${missing.join(", ") || "no critical identifiers"}. Score discounted from ${rawScoreBeforeDiscount}/100 to ${consensus.unified}/100 (×${penalty.toFixed(2)}). Manual disambiguation required against each candidate's DOB / citizenship / passport before any POSITIVE disposition.`);
  }
  if (temporalVelocity && temporalVelocity.escalationLevel !== "none") {
    extraSignals.push(temporalVelocity.signal);
  }
  if (counterfactual.fragility !== "robust") {
    extraSignals.push(counterfactual.signal);
  }
  if (coOccurrence && (coOccurrence.sanctionedAssociates.length > 0 || coOccurrence.geographicRisk.length > 0)) {
    extraSignals.push(coOccurrence.signal);
  }
  if (transliteration) {
    extraSignals.push(`Subject name detected as ${transliteration.script}; transliterated as "${transliteration.transliterated}" (matcher fans out to ${transliteration.variants.length} spelling variant(s)).`);
  }
  const fullRationale = extraSignals.length > 0
    ? `${rationale} ${extraSignals.join(" ")}`
    : rationale;

  return {
    consensus,
    contradictions,
    coverage: opts.coverage,
    rationale: fullRationale,
    evidenceTrail,
    ...(art19NegativeFinding ? { art19NegativeFinding } : {}),
    ...(temporalVelocity ? { temporalVelocity } : {}),
    counterfactual,
    ...(coOccurrence ? { coOccurrence } : {}),
    ...(transliteration ? { transliteration } : {}),
    ...(phoneticTier ? { phoneticTier } : {}),
    ...(commonNameAssessment ? { commonNameAssessment } : {}),
  };
}

// ── Helper: turn QuickScreen hits into consensus inputs ───────────────
//
// Maps the heterogeneous augmentation results from /api/quick-screen
// into the uniform ConsensusInput[] / contradiction-item[] shape.

export interface BuildConsensusInputsArgs {
  hits: QuickScreenHit[];                // local matcher hits (always trusted)
  openSanctionsCount: number;             // OpenSanctions live results count
  commercialCount: number;
  commercialProvider: string;
  registryCount: number;
  registryProviders: string[];
  countryRegistryCount: number;
  countryRegistryJurisdictions: string[];
  countrySanctionsCount: number;
  countrySanctionsLists: string[];
  freeProviders: string[];
  freeCount: number;
  adverseMediaArticles?: Array<{ source: string; outlet: string; title: string; url: string }>;
}

export function buildConsensusInputsFromAugmentation(a: BuildConsensusInputsArgs): {
  consensusInputs: ConsensusInput[];
  contradictionItems: Array<{ source: string; topic?: string; stance: "affirm" | "deny"; detail?: string }>;
} {
  const consensusInputs: ConsensusInput[] = [];
  const contradictionItems: Array<{ source: string; topic?: string; stance: "affirm" | "deny"; detail?: string }> = [];

  // ── DESIGN NOTE ────────────────────────────────────────────────────
  // Absence of a sanctions/registry hit is the NORMAL case for the vast
  // majority of subjects. We don't count it as denying evidence — only
  // explicit positive hits count toward "match", and absence is logged
  // as "uncertain" so the consensus engine doesn't flood with anti-
  // signal that masks real adverse-media findings.
  //
  // Only "delisted" (vendor explicitly says subject was previously
  // listed and was removed) counts as denying.

  // Local watchlist hits → affirming
  for (const h of a.hits) {
    consensusInputs.push({ source: h.listId, evidence: "match", rawScore: h.score });
    contradictionItems.push({ source: h.listId, topic: "sanctions-listing", stance: "affirm", detail: `${h.candidateName} (${h.method})` });
  }

  // OpenSanctions: affirming on hit, uncertain (not denying) on absence
  consensusInputs.push({
    source: "opensanctions",
    evidence: a.openSanctionsCount > 0 ? "match" : "uncertain",
  });
  if (a.openSanctionsCount > 0) {
    contradictionItems.push({ source: "opensanctions", topic: "sanctions-listing", stance: "affirm", detail: `${a.openSanctionsCount} live result(s)` });
  }

  // Commercial PEP/sanctions vendor (only when configured)
  if (a.commercialProvider !== "none") {
    consensusInputs.push({
      source: a.commercialProvider,
      evidence: a.commercialCount > 0 ? "match" : "uncertain",
    });
    if (a.commercialCount > 0) {
      contradictionItems.push({ source: a.commercialProvider, topic: "pep-sanctions-status", stance: "affirm", detail: `${a.commercialCount} hit(s)` });
    }
  }

  // Registry providers — only emit affirming on hit; absence = uncertain
  for (const p of a.registryProviders) {
    consensusInputs.push({ source: p, evidence: a.registryCount > 0 ? "match" : "uncertain" });
  }
  for (const j of a.countryRegistryJurisdictions) {
    consensusInputs.push({ source: `country-${j.toLowerCase()}`, evidence: a.countryRegistryCount > 0 ? "match" : "uncertain" });
  }
  for (const l of a.countrySanctionsLists) {
    const src = l.toLowerCase().replace(/_/g, "-");
    consensusInputs.push({ source: src, evidence: a.countrySanctionsCount > 0 ? "match" : "uncertain" });
    if (a.countrySanctionsCount > 0) {
      contradictionItems.push({ source: src, topic: "sanctions-listing", stance: "affirm" });
    }
  }
  for (const p of a.freeProviders) {
    consensusInputs.push({ source: p, evidence: a.freeCount > 0 ? "match" : "uncertain" });
  }

  // Adverse-media articles count as match-evidence — when ANY article
  // from a credible outlet mentions the subject in an AML-relevant
  // context, we surface it. World Check's gap is that it ignores
  // articles unless they're already in its risk-tagged corpus; we
  // treat the article volume itself as a signal.
  if (a.adverseMediaArticles && a.adverseMediaArticles.length > 0) {
    for (const art of a.adverseMediaArticles.slice(0, 25)) {
      consensusInputs.push({ source: art.source, evidence: "match", rawScore: 70 });
      contradictionItems.push({
        source: art.source,
        topic: "adverse-media",
        stance: "affirm",
        detail: art.title.slice(0, 120),
      });
    }
  }

  return { consensusInputs, contradictionItems };
}
