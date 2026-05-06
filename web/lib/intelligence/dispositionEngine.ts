// Hawkeye Sterling — intelligent disposition engine.
//
// One pure function takes the full brain payload and returns:
//   - effectiveBand:  clear | low | medium | high | critical
//   - recommendation: proceed_sdd | proceed_cdd | edd | freeze | decline
//   - rationale:      ordered list of human-readable reasoning steps
//   - redFlags:       named typology / pattern matches that fired
//   - requiredEvidence: what the MLRO must collect before disposition
//   - typologies:     FATF/Egmont fingerprints
//   - playbooks:      per-typology MLRO action chains
//   - geography:      jurisdiction tier + inherent geographic risk
//   - industry:       sector inherent risk + sector-specific evidence
//   - network:        contagion from related parties (RCA / family / group)
//   - temporal:       velocity, recency-weighted score, dormancy
//   - predicates:     FATF predicate-offence chain
//   - interview:      tailored MLRO interview script
//   - documents:      itemised document-request list
//   - anomalies:      unusual signal combinations
//   - confidence:     calibrated 0..1 confidence + uncertainty
//   - counterfactual: what would flip the verdict
//
// The engine encodes MLRO common-sense rules that no single sub-module
// can express alone. It is the ONLY place where cross-signal escalation
// happens, so the panel, the report, and the Asana task all read the
// same band and the same rationale.

import { jurisdictionRisk, chainGeographyRisk, type GeographicRiskEntry, type GeographyChain } from "./geographicRisk";
import { industryRisk, inferIndustrySegment, type IndustryRiskEntry, type IndustrySegment } from "./industryRisk";
import { playbookFor, type TypologyPlaybook } from "./typologyPlaybooks";
import { networkContagion, hasSanctionedRelative, type RelatedParty } from "./networkRisk";
import { recencyWeightedScore, velocityScore, decayedSeverity, type AdverseEvent } from "./temporalRisk";

export type { GeographicRiskEntry, IndustryRiskEntry, IndustrySegment, RelatedParty, AdverseEvent, GeographyChain, TypologyPlaybook };

export type Band = "clear" | "low" | "medium" | "high" | "critical";
export type Recommendation =
  | "proceed_sdd"   // simplified due diligence
  | "proceed_cdd"   // standard customer due diligence
  | "edd"           // enhanced due diligence
  | "freeze"        // freeze pending MLRO review
  | "decline";      // refuse the relationship

export interface DispositionInputs {
  /** Composite score 0..100 from super-brain (or sanctions topScore as fallback). */
  composite: number;

  /** Number of sanctions hits — any positive match. */
  sanctionsHits: number;

  /** Highest sanction match strength 0..1. */
  topSanctionsScore: number;

  /** Sanction list IDs that fired (e.g. ["OFAC_SDN", "UN_1267"]). */
  sanctionsLists: string[];

  /** PEP tier label, if any (e.g. "tier_1", "tier_2", "PEP"). */
  pepTier?: string | null;

  /** PEP salience 0..1. */
  pepSalience?: number;

  /** Adverse-media composite 0..1 from structured scorer. -1 means no scorer ran. */
  amCompositeScore: number;

  /** Number of adverse-media keyword categories that fired. */
  amCount: number;

  /** Adverse-media category IDs that fired (e.g. ["corruption_organised_crime"]). */
  amCategoriesTripped: string[];

  /** Number of redlines fired (charter prohibitions). */
  redlinesFired: number;

  /** Subject jurisdiction ISO2. */
  jurisdictionIso2?: string | null;

  /** True when jurisdiction is on the CAHRA list. */
  cahra: boolean;

  /** Number of cross-regime sanctions conflicts (split designations). */
  crossRegimeSplit: boolean;

  /** Subject entity type. */
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";

  /** Industry segment hint (gold, crypto, dpms, banking, etc.) — derived from name/aliases. */
  industryHints?: string[];

  /** Recent (≤30 days) adverse article count, when known. */
  recentAdverseCount?: number;

  /** Total GDELT article count over the 10y Art.19 window, when known. */
  totalAdverseCount?: number;

  /** Brain reported any module degradation (silent-failure audit trail). */
  brainDegraded?: boolean;

  /** Related parties (RCA / family / business associates / group cos). */
  relatedParties?: RelatedParty[];

  /** Industry segment (auto-inferred when omitted). */
  industrySegment?: IndustrySegment;

  /** Origin / destination / intermediary jurisdictions for transactional context. */
  geographyChain?: GeographyChain;

  /** Time-stamped adverse-media events for recency / velocity analysis. */
  adverseEvents?: AdverseEvent[];

  /** Subject onboarded date — used for tenure-vs-risk calibration. */
  onboardedAt?: string;
}

export interface TypologyMatch {
  /** FATF / Egmont typology id. */
  id: string;
  /** Human-readable typology label. */
  name: string;
  /** Family bucket. */
  family: "ml" | "tf" | "pf" | "fraud" | "corruption" | "cyber" | "sanctions" | "ubo";
  /** 0..1 — how strongly the input matches this typology fingerprint. */
  match: number;
  /** Which signals contributed to the match. */
  evidence: string[];
}

export interface PredicateOffence {
  id: string;
  label: string;
  fatfReference: string;
  uaeBasis: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  rationale: string;
}

export interface DocumentRequest {
  id: string;
  document: string;
  why: string;
}

export interface ConfidenceBand {
  /** 0..1 calibrated confidence the band is correct. */
  confidence: number;
  /** Plain-English uncertainty narrative. */
  basis: string;
  /** Symmetric half-width of band confidence interval (in band steps). */
  bandUncertainty: number;
}

export interface NetworkAnalysis {
  score: number;
  topContributors: Array<{ partyName: string; partyKind: string; contribution: number; reason: string }>;
  flaggedCount: number;
}

export interface TemporalAnalysis {
  /** 0..1 recency-weighted adverse-event score. */
  recencyScore: number;
  /** 0..100 velocity score: how active is the adverse signal right now. */
  velocity: number;
  /** Severity band derived from recency-weighted scoring. */
  decayedSeverity: Band;
  eventsLast30d: number;
  eventsLast90d: number;
  eventsLast365d: number;
}

export interface DispositionResult {
  band: Band;
  recommendation: Recommendation;
  rationale: string[];
  redFlags: string[];
  requiredEvidence: string[];
  /** Why the band was escalated above the raw composite, if it was. */
  escalations: Array<{ from: Band; to: Band; reason: string }>;
  /** FATF / Egmont typology fingerprint matches. */
  typologies: TypologyMatch[];
  /** Per-typology MLRO action playbooks (only for typologies that fired). */
  playbooks: TypologyPlaybook[];
  /** Geographic risk profile of subject's jurisdiction + transaction chain. */
  geography: {
    subject: GeographicRiskEntry;
    chain?: { inherentRisk: number; hops: GeographicRiskEntry[]; worstTier: string };
  };
  /** Industry risk profile (DPMS / NPO / banking / real estate / etc.). */
  industry: IndustryRiskEntry;
  /** Network / RCA contagion. */
  network?: NetworkAnalysis;
  /** Temporal analysis (velocity / recency / dormancy). */
  temporal?: TemporalAnalysis;
  /** FATF predicate offences implied by the fired signals. */
  predicateOffences: PredicateOffence[];
  /** Specific MLRO interview questions tailored to this subject. */
  interviewScript: InterviewQuestion[];
  /** Specific documents the MLRO must request. */
  documentRequests: DocumentRequest[];
  /** Calibrated confidence in the verdict + uncertainty narrative. */
  confidence: ConfidenceBand;
  /** Counterfactual narrative — what would change the verdict. */
  counterfactual: string;
  /** Anomaly flags — unusual signal combinations the brain noticed. */
  anomalies: string[];
}

const BAND_ORDER: readonly Band[] = ["clear", "low", "medium", "high", "critical"] as const;

function bandForScore(score: number): Band {
  if (!Number.isFinite(score)) return "clear";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "clear";
}

function maxBand(a: Band, b: Band): Band {
  return BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;
}

// CAHRA jurisdictions where additional industries push the verdict further.
// Gold-trade laundering through Turkey, DPMS in UAE, banking in cyprus, etc.
const HIGH_RISK_INDUSTRY_BY_JURISDICTION: Record<string, string[]> = {
  TR: ["gold", "dpms", "precious_metals"],
  AE: ["dpms", "gold", "crypto"],
  CY: ["banking", "crypto", "shell_company"],
  PA: ["shipping", "shell_company"],
  HK: ["crypto", "shell_company"],
  BVI: ["shell_company", "trust"],
  KY: ["shell_company", "trust"],
};

// Adverse-media categories that mean criminal predicate offences regardless
// of how the structured scorer banded the composite. Any one of these
// firing forces EDD minimum.
const PREDICATE_OFFENCE_CATEGORIES = new Set([
  "terrorist_financing",
  "proliferation_financing",
  "sanctions_violations",
  "corruption_organised_crime",
  "drug_trafficking",
  "human_trafficking_modern_slavery",
  "ml_financial_crime",
]);

export function disposition(input: DispositionInputs): DispositionResult {
  const rationale: string[] = [];
  const redFlags: string[] = [];
  const requiredEvidence: string[] = [];
  const escalations: DispositionResult["escalations"] = [];

  let band = bandForScore(input.composite);
  rationale.push(
    `Raw composite score is ${input.composite}/100 — initial band ${band.toUpperCase()}.`,
  );

  const escalate = (target: Band, reason: string): void => {
    const next = maxBand(band, target);
    if (next !== band) {
      escalations.push({ from: band, to: next, reason });
      rationale.push(`→ Escalated to ${next.toUpperCase()}: ${reason}`);
      band = next;
    }
  };

  // 1. Sanctions hits — any positive match is HIGH; ≥2 lists or top score
  //    ≥0.85 is CRITICAL. Cross-regime split is automatically critical.
  if (input.sanctionsHits >= 1) {
    const lists = input.sanctionsLists.slice(0, 4).join(", ") || "unspecified list";
    redFlags.push(`Sanctions match (${lists})`);
    if (input.sanctionsHits >= 2 || input.topSanctionsScore >= 0.85) {
      escalate(
        "critical",
        `${input.sanctionsHits} sanctions hits across ${input.sanctionsLists.length} list(s); top match strength ${(input.topSanctionsScore * 100).toFixed(0)}%`,
      );
      requiredEvidence.push(
        "Direct identifier verification (passport / DOB / nationality) against the matched sanctions record",
      );
      requiredEvidence.push("MLRO sign-off; consider freeze under FDL 10/2025 Art.26-27");
    } else {
      escalate(
        "high",
        `Sanctions list match at ${(input.topSanctionsScore * 100).toFixed(0)}% — verify against ${lists}`,
      );
      requiredEvidence.push(
        "Disambiguate the hit (DOB, nationality, role) before the relationship can clear",
      );
    }
  }
  if (input.crossRegimeSplit) {
    redFlags.push("Cross-regime split designation");
    escalate(
      "critical",
      "Split designation across regimes (one body designates, another doesn't) — apply most-restrictive-regime rule",
    );
  }

  // 2. Redlines — charter prohibitions are unconditional CRITICAL.
  if (input.redlinesFired > 0) {
    redFlags.push(`${input.redlinesFired} charter redline(s) fired`);
    escalate("critical", `${input.redlinesFired} hard charter prohibition(s) triggered`);
    requiredEvidence.push("Decline / freeze recommendation with full redline rationale");
  }

  // 3. Adverse media — structured scorer first, count fallback second.
  const amScore = input.amCompositeScore;
  if (amScore >= 0) {
    if (amScore >= 0.7) {
      escalate("critical", `Adverse-media composite ${(amScore * 100).toFixed(0)}/100 — multiple critical findings`);
      redFlags.push("Adverse media — critical");
    } else if (amScore >= 0.4) {
      escalate("high", `Adverse-media composite ${(amScore * 100).toFixed(0)}/100 — significant negative coverage`);
      redFlags.push("Adverse media — significant");
    } else if (amScore >= 0.1) {
      escalate("high", `Adverse-media composite ${(amScore * 100).toFixed(0)}/100 — moderate negative signal forces EDD`);
      redFlags.push("Adverse media — moderate");
    } else if (amScore > 0) {
      escalate("medium", `Limited adverse-media signal (composite ${(amScore * 100).toFixed(0)}/100)`);
    }
  } else if (input.amCount >= 4) {
    escalate("high", `${input.amCount} adverse-media categories fired (count-based fallback)`);
    redFlags.push("Adverse media — extensive (≥4 categories)");
  } else if (input.amCount > 0) {
    escalate("medium", `${input.amCount} adverse-media categor${input.amCount === 1 ? "y" : "ies"} fired`);
  }

  // 4. Predicate-offence adverse media categories — single category is enough
  //    to force EDD even if the structured scorer hasn't banded high yet.
  const predicates = input.amCategoriesTripped.filter((c) => PREDICATE_OFFENCE_CATEGORIES.has(c));
  if (predicates.length > 0) {
    redFlags.push(...predicates.map((p) => `Predicate offence: ${p.replace(/_/g, " ")}`));
    escalate(
      "high",
      `Predicate offence category fired (${predicates.join(", ").replace(/_/g, " ")}) — FATF R.20 review required`,
    );
    requiredEvidence.push(
      "Cite specific articles in the dossier; corroborate via at least two independent sources",
    );
  }

  // 5. PEP — any tier triggers EDD per FATF R.12 / FDL 10/2025 Art.17.
  if (input.pepTier) {
    const tier = input.pepTier.replace(/^tier_/, "tier ").replace(/_/g, " ");
    redFlags.push(`PEP — ${tier}`);
    const salText = typeof input.pepSalience === "number" ? ` (salience ${(input.pepSalience * 100).toFixed(0)}%)` : "";
    escalate("high", `PEP classified as ${tier}${salText} — FATF R.12 mandates EDD`);
    requiredEvidence.push("Source-of-wealth (SoW) and source-of-funds (SoF) documentation");
    requiredEvidence.push("Senior-management approval per FDL 10/2025 Art.17");
  }

  // 6. CAHRA jurisdiction — at minimum medium pressure; combined with high-
  //    risk industries it goes to high.
  if (input.cahra) {
    redFlags.push(`CAHRA jurisdiction (${input.jurisdictionIso2 ?? "n/a"})`);
    escalate("medium", `Subject is in a Conflict-Affected and High-Risk Area (${input.jurisdictionIso2 ?? "n/a"})`);
    const industries = input.jurisdictionIso2
      ? HIGH_RISK_INDUSTRY_BY_JURISDICTION[input.jurisdictionIso2.toUpperCase()] ?? []
      : [];
    const matchingIndustry = (input.industryHints ?? []).find((h) =>
      industries.includes(h.toLowerCase()),
    );
    if (matchingIndustry) {
      redFlags.push(`Industry pattern: ${matchingIndustry} in ${input.jurisdictionIso2}`);
      escalate(
        "high",
        `High-risk industry (${matchingIndustry}) in CAHRA jurisdiction (${input.jurisdictionIso2}) — known typology pattern`,
      );
      requiredEvidence.push(
        "UBO map verified to natural persons; trade-finance documentation reviewed against LBMA / OECD due-diligence guidance",
      );
    }
  }

  // 7. Recency boost — adverse media in the last 30 days carries more weight
  //    than decade-old reporting, even if the structured scorer treats them
  //    equally.
  if (input.recentAdverseCount && input.recentAdverseCount >= 3) {
    redFlags.push(`Recent adverse coverage (${input.recentAdverseCount} articles ≤30d)`);
    escalate(
      "high",
      `${input.recentAdverseCount} adverse articles in the last 30 days — active reputational exposure`,
    );
  }

  // 8. Volume — total adverse-coverage volume across the 10-year window
  //    matters: 1-2 hits is noise, 20+ is a sustained reputational pattern.
  if (input.totalAdverseCount && input.totalAdverseCount >= 20) {
    redFlags.push(`High adverse-coverage volume (${input.totalAdverseCount} articles over 10y)`);
    escalate("high", `Sustained adverse-media pattern (${input.totalAdverseCount} articles over 10 years)`);
  }

  // 9. Corporate counterparties without UBO data + medium+ band → EDD floor
  //    so the analyst can't clear without a UBO map.
  if (input.entityType === "organisation" && BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf("medium")) {
    requiredEvidence.push("Beneficial ownership map down to natural persons (≥25% threshold)");
  }

  // 10. Brain degraded — any silent-failure flag means the score is
  //     incomplete; force at least REVIEW so MLRO doesn't sign off on
  //     a half-computed verdict.
  if (input.brainDegraded) {
    redFlags.push("Brain degradation reported");
    escalate(
      "high",
      "One or more brain modules degraded silently — the composite is not fully computed and must be reviewed manually",
    );
    requiredEvidence.push(
      "Re-run super-brain after restoring degraded modules; document the gap in the audit trail",
    );
  }

  // Map band → recommendation. CDD posture follows from the band; the
  // operator can override but the default is the safer choice.
  const recommendation: Recommendation = (() => {
    switch (band) {
      case "critical":
        // Sanctions hit OR redline fired → freeze + decline path.
        // Otherwise critical via composite alone is "freeze for MLRO review".
        if (input.sanctionsHits > 0 || input.redlinesFired > 0) return "freeze";
        return "freeze";
      case "high":
        return "edd";
      case "medium":
        return "edd";
      case "low":
        return "proceed_cdd";
      case "clear":
      default:
        return "proceed_cdd";
    }
  })();

  // Always include the standing FATF/FDL legal basis line.
  rationale.push(
    "Legal basis applied: FATF R.10/R.12/R.20 · FDL 10/2025 Art.17/Art.20/Art.26-27 · Cabinet Resolution 134/2025 Art.18.",
  );

  // ── Geographic risk ────────────────────────────────────────────────────
  const geographySubject = jurisdictionRisk(input.jurisdictionIso2);
  const geographyChain = input.geographyChain
    ? chainGeographyRisk(input.geographyChain)
    : undefined;

  // Comprehensive sanctions = automatic critical (jurisdiction-level red line).
  if (geographySubject.tiers.includes("comprehensive_sanctions")) {
    redFlags.push(`Comprehensive-sanctions jurisdiction (${geographySubject.iso2})`);
    escalate(
      "critical",
      `Subject in comprehensive-sanctions jurisdiction (${geographySubject.iso2}) — direct dealings prohibited absent specific licence`,
    );
    requiredEvidence.push("Specific OFAC / OFSI / EU general licence covering the relationship");
  } else if (geographySubject.tiers.includes("fatf_black")) {
    redFlags.push(`FATF call-for-action jurisdiction (${geographySubject.iso2})`);
    escalate("critical", `Subject in FATF call-for-action jurisdiction (${geographySubject.iso2}) — counter-measures required`);
  } else if (geographySubject.tiers.includes("fatf_grey")) {
    escalate("high", `Subject in FATF grey-list jurisdiction (${geographySubject.iso2}) — EDD mandatory`);
    redFlags.push(`FATF grey-list (${geographySubject.iso2})`);
  } else if (geographySubject.tiers.includes("eu_aml_high_risk")) {
    escalate("high", `Subject in EU 2015/849 high-risk third country (${geographySubject.iso2}) — Article 18a EDD`);
  } else if (geographySubject.tiers.includes("secrecy_high")) {
    escalate("medium", `Subject in top-tier secrecy / financial-haven jurisdiction (${geographySubject.iso2}) — UBO transparency limited`);
  }

  // Geography chain (transaction routing) — escalate if any hop is restricted.
  if (geographyChain && geographyChain.worstTier === "comprehensive_sanctions") {
    redFlags.push("Transaction routes through a comprehensive-sanctions jurisdiction");
    escalate("critical", "Transaction chain hops a comprehensive-sanctions jurisdiction — refuse the leg");
  } else if (geographyChain && (geographyChain.worstTier === "fatf_black" || geographyChain.worstTier === "fatf_grey")) {
    escalate("high", `Transaction chain includes FATF-listed jurisdiction (worst tier: ${geographyChain.worstTier})`);
  }

  // ── Industry / sector risk ─────────────────────────────────────────────
  const segment: IndustrySegment =
    input.industrySegment ?? inferIndustrySegment(""); // caller-supplied or default
  const industry = industryRisk(segment);
  if (industry.inherentRisk >= 70) {
    rationale.push(
      `Sector "${industry.label}" carries inherent risk ${industry.inherentRisk}/100 — ${industry.rationale}`,
    );
    escalate("medium", `High-risk sector: ${industry.label}`);
    for (const ev of industry.requiredEvidence) requiredEvidence.push(ev);
  } else if (industry.inherentRisk >= 50) {
    rationale.push(`Sector "${industry.label}" carries inherent risk ${industry.inherentRisk}/100 — apply enhanced ID + SoW.`);
    for (const ev of industry.requiredEvidence) requiredEvidence.push(ev);
  }

  // Sector + jurisdiction combo escalation — gold trader in CAHRA, crypto in
  // FATF grey, real-estate in secrecy haven, etc.
  if (
    (industry.inherentRisk >= 70) &&
    (geographySubject.inherentRisk >= 60 ||
      geographySubject.tiers.includes("cahra") ||
      geographySubject.tiers.includes("fatf_grey"))
  ) {
    escalate(
      "high",
      `Combo: high-risk sector (${industry.label}) operating in elevated-risk jurisdiction (${geographySubject.name}) — known typology cluster`,
    );
    redFlags.push(`Sector-jurisdiction combo: ${industry.segment} in ${geographySubject.iso2}`);
  }

  // ── Network / RCA contagion ────────────────────────────────────────────
  let networkAnalysis: NetworkAnalysis | undefined;
  if (input.relatedParties && input.relatedParties.length > 0) {
    const cont = networkContagion(input.relatedParties);
    networkAnalysis = {
      score: cont.score,
      flaggedCount: cont.flaggedCount,
      topContributors: cont.topContributors.map((c) => ({
        partyName: c.party.name,
        partyKind: c.party.kind,
        contribution: c.contribution,
        reason: c.reason,
      })),
    };
    if (cont.score >= 60) {
      escalate("high", `Network contagion score ${cont.score}/100 from ${cont.flaggedCount} flagged related parties`);
      redFlags.push(`Network contagion (${cont.flaggedCount} flagged related parties)`);
      for (const c of cont.topContributors.slice(0, 3)) {
        rationale.push(`  · related party: ${c.party.name} (${c.party.kind}) — ${c.reason}`);
      }
    } else if (cont.score >= 30) {
      escalate("medium", `Moderate network contagion score ${cont.score}/100`);
    }
    if (hasSanctionedRelative(input.relatedParties)) {
      redFlags.push("Sanctioned related party");
      escalate(
        "critical",
        "Sanctioned related party identified — apply OFAC 50% rule across the ownership / control chain",
      );
      requiredEvidence.push("OFAC 50% rule analysis: cumulative designated-party ownership across all layers");
    }
  }

  // ── Temporal analysis ──────────────────────────────────────────────────
  let temporalAnalysis: TemporalAnalysis | undefined;
  if (input.adverseEvents && input.adverseEvents.length > 0) {
    const recencyScore = recencyWeightedScore(input.adverseEvents);
    const vel = velocityScore(input.adverseEvents);
    const decayedBand = decayedSeverity(input.adverseEvents);
    const last30 = input.adverseEvents.filter((e) => Date.now() - Date.parse(e.at) <= 30 * 86400000).length;
    const last90 = input.adverseEvents.filter((e) => Date.now() - Date.parse(e.at) <= 90 * 86400000).length;
    const last365 = input.adverseEvents.filter((e) => Date.now() - Date.parse(e.at) <= 365 * 86400000).length;
    temporalAnalysis = {
      recencyScore,
      velocity: vel,
      decayedSeverity: decayedBand,
      eventsLast30d: last30,
      eventsLast90d: last90,
      eventsLast365d: last365,
    };
    if (vel >= 60) {
      escalate("high", `Adverse-event velocity score ${vel}/100 — active reputational pattern`);
      redFlags.push("Adverse-event burst (velocity ≥60)");
    }
    if (decayedBand === "critical") {
      escalate("critical", "Recency-weighted adverse-event severity is CRITICAL — sustained recent critical reporting");
    } else if (decayedBand === "high") {
      escalate("high", "Recency-weighted adverse-event severity is HIGH");
    }
    rationale.push(
      `Temporal: ${last30} events in last 30d, ${last90} in last 90d, ${last365} in last 365d — velocity ${vel}/100, decayed-severity ${decayedBand.toUpperCase()}.`,
    );
  }

  // ── Typology fingerprinting ────────────────────────────────────────────
  const typologies = matchTypologies(input);

  // ── Per-typology MLRO playbooks ────────────────────────────────────────
  const playbooks: TypologyPlaybook[] = [];
  for (const t of typologies) {
    const pb = playbookFor(t.id);
    if (pb && !playbooks.find((p) => p.typologyId === pb.typologyId)) playbooks.push(pb);
  }
  // Pull each playbook's required-evidence items into the engine output so
  // the report's evidence list is automatically tailored to the typology.
  for (const pb of playbooks) {
    for (const e of pb.immediate.slice(0, 2)) requiredEvidence.push(`[playbook ${pb.typologyId}] ${e}`);
  }

  // ── FATF predicate-offence chain ───────────────────────────────────────
  const predicateOffences = derivePredicateOffences(input.amCategoriesTripped);

  // ── MLRO interview script — tailored to fired signals ──────────────────
  const interviewScript = buildInterviewScript(input, redFlags, typologies);

  // ── Document requests — what MLRO must collect to clear the case ───────
  const documentRequests = buildDocumentRequests(input, band, typologies);

  // ── Anomaly detection — unusual signal combinations ────────────────────
  const anomalies = detectAnomalies(input);

  // ── Calibrated confidence ──────────────────────────────────────────────
  const confidence = computeConfidence(input, band, anomalies.length, !!input.brainDegraded);

  // ── Counterfactual — what would flip the verdict ───────────────────────
  const counterfactual = buildCounterfactual(input, band);

  // De-dup the lists.
  return {
    band,
    recommendation,
    rationale,
    redFlags: Array.from(new Set(redFlags)),
    requiredEvidence: Array.from(new Set(requiredEvidence)),
    escalations,
    typologies,
    playbooks,
    geography: {
      subject: geographySubject,
      ...(geographyChain ? { chain: { ...geographyChain, worstTier: geographyChain.worstTier } } : {}),
    },
    industry,
    ...(networkAnalysis ? { network: networkAnalysis } : {}),
    ...(temporalAnalysis ? { temporal: temporalAnalysis } : {}),
    predicateOffences,
    interviewScript,
    documentRequests,
    confidence,
    counterfactual,
    anomalies,
  };
}

// ─── Typology fingerprinting ──────────────────────────────────────────────
// Score against well-known FATF/Egmont laundering typologies. Each returns
// a match strength 0..1; 0.4+ surfaces in the dossier.
function matchTypologies(input: DispositionInputs): TypologyMatch[] {
  const out: TypologyMatch[] = [];
  const cats = new Set(input.amCategoriesTripped);
  const industries = new Set(input.industryHints ?? []);
  const jur = (input.jurisdictionIso2 ?? "").toUpperCase();

  // Gold-trade laundering (FATF 2015 Money Laundering through the
  // Physical Transportation of Cash, FATF 2024 Gold-Sector Risks).
  if (industries.has("gold") || industries.has("dpms") || industries.has("precious_metals")) {
    let m = 0.3; // industry alone is a baseline signal
    const ev: string[] = ["DPMS / gold-sector subject"];
    if (cats.has("ml_financial_crime")) { m += 0.2; ev.push("ML keywords fired"); }
    if (cats.has("corruption_organised_crime")) { m += 0.25; ev.push("Corruption / OC signals"); }
    if (cats.has("sanctions_violations")) { m += 0.2; ev.push("Sanctions-evasion adverse media"); }
    if (input.cahra) { m += 0.15; ev.push(`CAHRA jurisdiction (${jur})`); }
    if (jur === "TR" || jur === "AE") { m += 0.1; ev.push(`Known gold-trade ML hub (${jur})`); }
    if (m >= 0.4) out.push({
      id: "fatf_gold_trade_ml",
      name: "Gold-trade laundering (FATF 2024 DPMS sector)",
      family: "ml",
      match: Math.min(1, m),
      evidence: ev,
    });
  }

  // Trade-based money laundering (FATF 2006 / 2020 update).
  if (input.entityType === "organisation" && (cats.has("ml_financial_crime") || cats.has("sanctions_violations"))) {
    let m = 0.3;
    const ev: string[] = ["Corporate counterparty with ML/sanctions adverse signals"];
    if (industries.has("shipping")) { m += 0.25; ev.push("Shipping / logistics segment"); }
    if (input.cahra) { m += 0.2; ev.push(`CAHRA origin (${jur})`); }
    if ((input.totalAdverseCount ?? 0) >= 10) { m += 0.15; ev.push("Sustained adverse pattern"); }
    if (m >= 0.45) out.push({
      id: "fatf_tbml",
      name: "Trade-based money laundering (FATF 2020 update)",
      family: "ml",
      match: Math.min(1, m),
      evidence: ev,
    });
  }

  // Hawala / informal value transfer (FATF 2013 IVTS).
  if (cats.has("ml_financial_crime") && (jur === "AE" || jur === "PK" || jur === "AF" || jur === "SO")) {
    out.push({
      id: "fatf_hawala_ivts",
      name: "Hawala / informal value-transfer system",
      family: "ml",
      match: 0.55,
      evidence: [`Geography (${jur}) + ML keyword pattern`],
    });
  }

  // Sanctions evasion via shell company (FATF 2018 + OFSI guidance).
  if (industries.has("shell_company") && (cats.has("sanctions_violations") || input.sanctionsHits > 0)) {
    let m = 0.5;
    const ev: string[] = ["Shell/holding entity structure with sanctions exposure"];
    if (input.crossRegimeSplit) { m += 0.2; ev.push("Cross-regime split designation"); }
    if (jur === "BVI" || jur === "KY" || jur === "PA") { m += 0.15; ev.push(`Secrecy jurisdiction (${jur})`); }
    out.push({
      id: "ofsi_shell_evasion",
      name: "Sanctions evasion via shell company (OFSI 2024)",
      family: "sanctions",
      match: Math.min(1, m),
      evidence: ev,
    });
  }

  // Crypto-fiat off-ramp (FATF VASP guidance 2021).
  if (industries.has("crypto") && (cats.has("ml_financial_crime") || cats.has("sanctions_violations") || cats.has("cybercrime"))) {
    out.push({
      id: "fatf_crypto_offramp",
      name: "Crypto-fiat off-ramp / VASP misuse",
      family: "ml",
      match: 0.6,
      evidence: ["Crypto/VASP industry + ML/sanctions/cybercrime adverse signals"],
    });
  }

  // Terrorism financing — predicate categories alone are sufficient.
  if (cats.has("terrorist_financing")) {
    out.push({
      id: "fatf_tf",
      name: "Terrorism financing (FATF R.5)",
      family: "tf",
      match: 0.85,
      evidence: ["TF adverse-media category fired"],
    });
  }

  // Proliferation financing — same logic.
  if (cats.has("proliferation_financing")) {
    out.push({
      id: "fatf_pf",
      name: "Proliferation financing (UNSCR 1540)",
      family: "pf",
      match: 0.85,
      evidence: ["PF adverse-media category fired"],
    });
  }

  // Corruption / kleptocracy.
  if (cats.has("corruption_organised_crime") && input.pepTier) {
    out.push({
      id: "fatf_kleptocracy",
      name: "PEP-linked corruption / kleptocracy",
      family: "corruption",
      match: 0.8,
      evidence: [`PEP (${input.pepTier}) + corruption adverse media`],
    });
  }

  // UBO concealment — corporate without UBO + medium+ band.
  if (input.entityType === "organisation" && industries.has("shell_company")) {
    out.push({
      id: "fatf_ubo_concealment",
      name: "Beneficial ownership concealment",
      family: "ubo",
      match: 0.5,
      evidence: ["Shell-style corporate structure — UBO map required"],
    });
  }

  return out.sort((a, b) => b.match - a.match);
}

// ─── FATF predicate-offence chain ─────────────────────────────────────────
function derivePredicateOffences(amCategories: string[]): PredicateOffence[] {
  const map: Record<string, PredicateOffence> = {
    terrorist_financing: {
      id: "TF",
      label: "Terrorism financing",
      fatfReference: "FATF R.5 / R.6",
      uaeBasis: "FDL 7/2014 (anti-terrorism) · FDL 10/2025 Art.30",
    },
    proliferation_financing: {
      id: "PF",
      label: "Proliferation financing of WMD",
      fatfReference: "FATF R.7 / UNSCR 1540 / UNSCR 1718 / UNSCR 2231",
      uaeBasis: "FDL 10/2025 Art.31 · Cabinet Resolution 156/2025",
    },
    sanctions_violations: {
      id: "SANC",
      label: "Sanctions violation",
      fatfReference: "FATF R.6 / R.7",
      uaeBasis: "FDL 10/2025 Art.31 · MoE Circular 3/2025",
    },
    corruption_organised_crime: {
      id: "CORR",
      label: "Corruption / bribery / organised crime",
      fatfReference: "FATF R.20 (predicate offence)",
      uaeBasis: "Federal Decree-Law 31/2021 Art.234 (bribery) · FDL 10/2025 Art.20",
    },
    drug_trafficking: {
      id: "DRUG",
      label: "Drug trafficking",
      fatfReference: "FATF R.20 (Vienna 1988 Convention)",
      uaeBasis: "Federal Law 14/1995 (Counter-Narcotics) · FDL 10/2025 Art.20",
    },
    human_trafficking_modern_slavery: {
      id: "HT",
      label: "Human trafficking / modern slavery",
      fatfReference: "FATF R.20 (Palermo Protocol)",
      uaeBasis: "FDL 51/2006 (HT) · FDL 10/2025 Art.20",
    },
    ml_financial_crime: {
      id: "ML",
      label: "Money laundering",
      fatfReference: "FATF R.3 / R.20",
      uaeBasis: "FDL 10/2025 Art.2 / Art.20 / Art.26",
    },
    cybercrime: {
      id: "CYBER",
      label: "Cybercrime",
      fatfReference: "FATF R.20 (Budapest Convention)",
      uaeBasis: "FDL 5/2012 (Cybercrime) · FDL 10/2025 Art.20",
    },
    fraud_forgery: {
      id: "FRAUD",
      label: "Fraud / forgery",
      fatfReference: "FATF R.20",
      uaeBasis: "Federal Decree-Law 31/2021 Art.451 · FDL 10/2025 Art.20",
    },
    tax_crimes: {
      id: "TAX",
      label: "Tax crime",
      fatfReference: "FATF R.20 (post-2012 inclusion)",
      uaeBasis: "Federal Decree-Law 28/2022 (Tax Procedures) · FDL 10/2025 Art.20",
    },
    environmental_crime: {
      id: "ENV",
      label: "Environmental crime",
      fatfReference: "FATF R.20 (FATF 2021 environmental crime report)",
      uaeBasis: "FDL 10/2025 Art.20",
    },
  };
  const out: PredicateOffence[] = [];
  for (const c of amCategories) {
    if (map[c] && !out.find((o) => o.id === map[c]!.id)) out.push(map[c]!);
  }
  return out;
}

// ─── MLRO interview script ────────────────────────────────────────────────
// Generate specific questions the analyst should put to the customer based
// on which signals fired. Open-ended, defensible, audit-trail-friendly.
function buildInterviewScript(
  input: DispositionInputs,
  redFlags: string[],
  typologies: TypologyMatch[],
): InterviewQuestion[] {
  const q: InterviewQuestion[] = [];
  const seen = new Set<string>();
  const add = (item: InterviewQuestion): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    q.push(item);
  };

  // Sanctions hits
  if (input.sanctionsHits > 0) {
    add({
      id: "id_verify",
      question:
        "Could you please provide a current passport copy and confirm your full date of birth and nationality? We need this to disambiguate from a same-name match on a watchlist.",
      rationale: "Resolve the sanctions-list collision via direct identifier match (FATF R.10).",
    });
  }
  // PEP
  if (input.pepTier) {
    add({
      id: "pep_role",
      question:
        "Can you describe your current and previous roles in government, state-owned enterprises, or international organisations over the last 5 years?",
      rationale: "Confirm PEP tier and any associates exposed under FATF R.12.",
    });
    add({
      id: "pep_sow",
      question:
        "Please walk us through your principal sources of wealth, including any income from public service, family inheritance, or business ventures.",
      rationale: "Source-of-wealth (SoW) is mandatory for any-tier PEP per FDL 10/2025 Art.17.",
    });
  }
  // Adverse media — corruption / OC
  if (input.amCategoriesTripped.includes("corruption_organised_crime")) {
    add({
      id: "am_corruption",
      question:
        "Public reporting links you (or an organisation you have led) to allegations of corruption. Are you aware of those reports, and do you contest them?",
      rationale: "Right of reply on adverse-media findings; documents the customer's own narrative for the file.",
    });
  }
  if (input.amCategoriesTripped.includes("sanctions_violations")) {
    add({
      id: "am_sanctions",
      question:
        "There is reporting linking your group to alleged sanctions evasion. Can you describe your group's sanctions-compliance programme and any prior enforcement contacts?",
      rationale: "Adverse-media → sanctions risk, FATF R.6/R.7.",
    });
  }
  // Industry typology — gold/DPMS
  if (typologies.some((t) => t.id === "fatf_gold_trade_ml")) {
    add({
      id: "gold_chain",
      question:
        "Please walk us through your gold supply chain end-to-end: mine of origin, refiner, transport route, and the LBMA / OECD due-diligence position you maintain.",
      rationale: "FATF 2024 DPMS sector guidance + LBMA Responsible Gold Guidance.",
    });
    add({
      id: "gold_doc",
      question:
        "Do you maintain Country-of-Origin / Conflict-Free certifications for each batch, and can you produce them for the last 12 months?",
      rationale: "OECD Due Diligence Guidance — Gold Supplement; documents the chain-of-custody.",
    });
  }
  // Industry typology — TBML
  if (typologies.some((t) => t.id === "fatf_tbml")) {
    add({
      id: "tbml_invoicing",
      question:
        "For the last 12 months, can you produce invoices, bills of lading, and proof-of-delivery for your top-5 trading partners?",
      rationale: "Trade-based ML detection (FATF 2020) — over/under-invoicing pattern check.",
    });
  }
  // Industry typology — crypto
  if (typologies.some((t) => t.id === "fatf_crypto_offramp")) {
    add({
      id: "crypto_origin",
      question:
        "What VASPs, on-chain addresses, or fiat off-ramps have you used in the last 12 months? Please provide transaction hashes for any deposits ≥ AED 75,000.",
      rationale: "FATF VASP travel rule + crypto-fiat off-ramp pattern detection.",
    });
  }
  // CAHRA jurisdiction
  if (input.cahra) {
    add({
      id: "cahra_purpose",
      question:
        `What is the principal commercial purpose of operating in ${input.jurisdictionIso2 ?? "this jurisdiction"} given the elevated regulatory exposure?`,
      rationale: "Document business rationale for CAHRA exposure (FATF R.10 / Cabinet Res 134/2025).",
    });
  }
  // Corporate counterparty
  if (input.entityType === "organisation") {
    add({
      id: "ubo_map",
      question:
        "Please provide the beneficial ownership map down to natural persons holding ≥25% of voting rights or economic interest, with supporting register extracts.",
      rationale: "FATF R.10/R.24 + FDL 10/2025 Art.18 — UBO mandate.",
    });
  }
  return q;
}

// ─── Document request generator ───────────────────────────────────────────
function buildDocumentRequests(
  input: DispositionInputs,
  band: Band,
  typologies: TypologyMatch[],
): DocumentRequest[] {
  const r: DocumentRequest[] = [];
  const seen = new Set<string>();
  const add = (item: DocumentRequest): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    r.push(item);
  };

  if (input.entityType === "organisation") {
    add({ id: "cert_inc", document: "Certificate of incorporation / commercial registration", why: "Verify legal existence and registered address." });
    add({ id: "ubo_map", document: "UBO declaration with register extracts", why: "FATF R.24 / FDL 10/2025 Art.18." });
    add({ id: "ms_id", document: "ID + proof-of-address for each director / authorised signatory", why: "FATF R.10." });
    add({ id: "ownership_chart", document: "Group structure chart down to natural persons", why: "Identify hidden controlling interests." });
  } else {
    add({ id: "passport", document: "Current passport (machine-readable + photo page)", why: "FATF R.10 customer ID." });
    add({ id: "address_proof", document: "Proof of residential address ≤3 months old", why: "FATF R.10 verification." });
  }

  if (band !== "clear" && band !== "low") {
    add({ id: "sow", document: "Source-of-wealth (SoW) statement with corroborating documents", why: "EDD requirement under FATF R.10/R.12 / FDL 10/2025 Art.17." });
    add({ id: "sof", document: "Source-of-funds (SoF) for the relationship", why: "EDD requirement." });
  }

  if (input.pepTier) {
    add({ id: "pep_consent", document: "Senior management approval for the PEP relationship", why: "FATF R.12 / FDL 10/2025 Art.17 — must be on file." });
    add({ id: "pep_sow_extra", document: "Detailed SoW including public-office salary records, declared assets, family wealth", why: "PEP SoW must be more rigorous than non-PEP." });
  }

  if (typologies.some((t) => t.id === "fatf_gold_trade_ml")) {
    add({ id: "lbma_position", document: "LBMA Responsible Gold position / Good Delivery accreditation", why: "Industry-standard chain-of-custody attestation." });
    add({ id: "oecd_dd", document: "OECD Due Diligence Guidance — Gold Supplement compliance file", why: "Conflict-free / responsible-sourcing evidence." });
    add({ id: "moe2_2024", document: "MoE Circular 2/2024 responsible-sourcing attestation", why: "UAE DPMS regulatory requirement." });
  }
  if (typologies.some((t) => t.id === "fatf_tbml")) {
    add({ id: "trade_invoices", document: "Last 12 months of trade invoices, bills of lading, proof of delivery", why: "TBML pattern detection (over/under-invoicing)." });
  }
  if (typologies.some((t) => t.id === "fatf_crypto_offramp")) {
    add({ id: "vasp_register", document: "Wallet address register + VASP relationships", why: "FATF VASP travel-rule compliance." });
  }
  if (typologies.some((t) => t.id === "ofsi_shell_evasion")) {
    add({ id: "shell_purpose", document: "Commercial purpose and operating substance file", why: "Counter shell-company sanctions-evasion typology." });
  }

  return r;
}

// ─── Anomaly detection ────────────────────────────────────────────────────
function detectAnomalies(input: DispositionInputs): string[] {
  const a: string[] = [];
  // Composite says clear but adverse media fired — math/policy inconsistency.
  if (input.composite < 20 && input.amCount > 0) {
    a.push("Composite is in the CLEAR band but adverse-media keywords fired — possible scoring under-weighting.");
  }
  // Sanctions hit at low confidence + no other signals.
  if (input.sanctionsHits > 0 && input.topSanctionsScore < 0.7 && input.amCount === 0 && !input.pepTier) {
    a.push("Sanctions match at low confidence in isolation — likely a name-collision false positive; disambiguate before escalation.");
  }
  // PEP without any role text.
  if (input.pepTier && (input.pepSalience ?? 0) < 0.2) {
    a.push("PEP detected with low salience — verify role evidence; could be a fixture-name match.");
  }
  // Cross-regime split.
  if (input.crossRegimeSplit) {
    a.push("Designation status differs across regimes — apply most-restrictive-regime rule, surface conflict in MLRO note.");
  }
  // Heavy adverse coverage with no recent signal — possibly stale.
  if ((input.totalAdverseCount ?? 0) >= 10 && (input.recentAdverseCount ?? 0) === 0) {
    a.push("Sustained historical adverse coverage with zero recent signal — case may be stabilising; document the gap.");
  }
  // Brain degraded.
  if (input.brainDegraded) {
    a.push("Brain pipeline reported module degradation — composite is incomplete; manual review required.");
  }
  return a;
}

// ─── Calibrated confidence ────────────────────────────────────────────────
function computeConfidence(
  input: DispositionInputs,
  band: Band,
  anomalyCount: number,
  brainDegraded: boolean,
): ConfidenceBand {
  // Start with a strong prior for the math itself.
  let conf = 0.85;
  const reasons: string[] = [];

  // Each anomaly chips at confidence by 0.08.
  if (anomalyCount > 0) {
    conf -= Math.min(0.32, anomalyCount * 0.08);
    reasons.push(`${anomalyCount} anomaly flag(s)`);
  }
  // Brain degraded loses 0.2 — half of confidence is the model itself.
  if (brainDegraded) {
    conf -= 0.2;
    reasons.push("brain degraded");
  }
  // Single-source adverse media (totalAdverseCount = amCount) loses 0.05.
  if ((input.totalAdverseCount ?? 0) <= 2 && input.amCount > 0) {
    conf -= 0.05;
    reasons.push("thin adverse-media corpus");
  }
  // Cross-regime split loses 0.1 — split signal means uncertainty.
  if (input.crossRegimeSplit) {
    conf -= 0.1;
    reasons.push("split regime designation");
  }
  // Strong corroborating signals raise confidence.
  let corroborators = 0;
  if (input.sanctionsHits > 0) corroborators += 1;
  if (input.pepTier) corroborators += 1;
  if (input.amCompositeScore >= 0.4) corroborators += 1;
  if (input.redlinesFired > 0) corroborators += 1;
  if (corroborators >= 2) {
    conf += 0.1;
    reasons.push(`${corroborators} corroborating signals`);
  }

  conf = Math.max(0.3, Math.min(0.99, conf));

  // Band uncertainty: high confidence → ±0 bands, low → ±2 bands.
  const bandUncertainty = conf >= 0.85 ? 0 : conf >= 0.7 ? 1 : 2;

  const basis = reasons.length > 0
    ? `Confidence ${(conf * 100).toFixed(0)}% — calibrated against ${reasons.join(", ")}.`
    : `Confidence ${(conf * 100).toFixed(0)}% — no anomalies detected; multi-signal corroboration consistent.`;

  return { confidence: conf, basis, bandUncertainty };
}

// ─── Counterfactual narrative ─────────────────────────────────────────────
function buildCounterfactual(input: DispositionInputs, band: Band): string {
  if (band === "clear") {
    return "A new sanctions designation, a PEP role disclosure, or an adverse-media report at moderate+ severity would move this verdict to LOW or higher.";
  }
  const flips: string[] = [];
  if (input.sanctionsHits > 0) flips.push("disambiguate the sanctions hit (DOB / nationality verification)");
  if (input.pepTier) flips.push("confirm the PEP no longer holds the role and produce SoW that clears the source");
  if (input.amCompositeScore >= 0.1) flips.push("provide independent corroboration that the adverse-media reporting is incorrect or has been retracted");
  if (input.cahra) flips.push("relocate the operating jurisdiction outside the CAHRA list");
  if (input.redlinesFired > 0) flips.push("restructure the relationship to remove the redlined activity");
  if (flips.length === 0) flips.push("replace the underlying signals with documented evidence to the contrary");
  return `To downgrade from ${band.toUpperCase()}, the analyst would need to ${flips.join("; or ")}.`;
}

// Industry hint inference from subject name + aliases. Used both server-side
// and client-side to seed the disposition engine when no explicit hint is
// supplied. Pure regex over a normalised string — never throws.
export function inferIndustryHints(name: string, aliases: string[] = []): string[] {
  const text = [name, ...aliases].join(" ").toLowerCase();
  const hints = new Set<string>();
  if (/\bgold\b|\bbullion\b|\brefiner|\brefin(?:ery|ing)\b|\bprecious\s+metal/.test(text)) {
    hints.add("gold");
    hints.add("precious_metals");
    hints.add("dpms");
  }
  if (/\b(crypto|bitcoin|ethereum|btc|eth|wallet|virtual\s+asset|vasp)\b/.test(text)) hints.add("crypto");
  if (/\b(bank|banking|financial\s+institution|fi\b)/.test(text)) hints.add("banking");
  if (/\b(shipping|tanker|vessel|maritime|cargo)\b/.test(text)) hints.add("shipping");
  if (/\b(trust|holdings?|nominee|shell|sarl|ltd|llc|fz-?[ae])\b/.test(text)) hints.add("shell_company");
  if (/\bdiamond|jewel|gem(stone)?/.test(text)) hints.add("dpms");
  return Array.from(hints);
}
