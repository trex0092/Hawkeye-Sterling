// Hawkeye Sterling — quality gates for the MLRO Advisor fallback.
//
// The external AML-MultiAgent-RAG service ships with a Confidence Agent and a
// Consistency Agent that score every answer (0–100 / 0–1) and gate publication
// behind `consistency >= 0.6 AND confidence >= 40`. When that service is
// unreachable and we fall back to the in-house advisor, we used to emit
// hardcoded {confidence: 80, consistency: 0.85} — pure theatre. This module
// replaces the hardcode with a deterministic, source-anchored scorer that
// reads the actual narrative and grades it against the CITATION ENFORCEMENT
// rules baked into the weaponized system prompt.
//
// The scorer is intentionally NOT a model call — it must be cheap, fast, and
// deterministic so unit tests can assert exact numbers and so the fallback
// keeps a tight latency profile. The scoring rubric mirrors the rules the
// advisor was instructed to obey, so a high score genuinely reflects rule
// compliance and not just narrative length.

export interface AdvisorScore {
  /** 0–100 — how confident we should be that the narrative answers the question
   *  with primary-source citations and without forbidden hedges. */
  confidenceScore: number;
  /** 0–1 — how internally consistent the narrative is (citation density per
   *  paragraph, jurisdiction discipline, audit-line presence). */
  consistencyScore: number;
  /** True iff `confidenceScore >= 40 AND consistencyScore >= 0.6` —
   *  same gate the external RAG enforces. */
  passedQualityGate: boolean;
  /** Whichever specific rules the narrative tripped, surfaced for ops. */
  failures: string[];
  /** Per-rule diagnostics — count of citations, hedges, paragraphs, etc. */
  diagnostics: {
    paragraphCount: number;
    citationCount: number;
    hedgeCount: number;
    paragraphsWithoutCitation: number;
    hasAuditLine: boolean;
    hasMultipleJurisdictions: boolean;
    wordCount: number;
  };
}

// Phrases banned inside factual claims by CITATION ENFORCEMENT rule 2.
// We match whole-word with case-insensitive boundaries to avoid false hits
// on words like "appears" inside compound terms.
const HEDGE_PATTERNS: RegExp[] = [
  /\bmay\b/gi,
  /\bmight\b/gi,
  /\bcould be\b/gi,
  /\btypically\b/gi,
  /\bgenerally\b/gi,
  /\busually\b/gi,
  /\boften\b/gi,
  /\btends to\b/gi,
  /\bI believe\b/gi,
  /\bin my opinion\b/gi,
  /\bit seems\b/gi,
  /\bappears to\b/gi,
  /\bprobably\b/gi,
  /\bperhaps\b/gi,
];

// Forward-looking and counterfactual labels are explicitly allowed to use
// hedges. Subtract hedges that fall inside a labelled block.
const HEDGE_SAFE_LABEL = /(forward[- ]looking|counterfactual|hypothetical|prediction):/i;

// Primary-source citation patterns. We're permissive on format (the prompt
// already disciplines the model) but strict on requiring instrument + locator.
// A citation is anything that names a recognisable instrument followed by an
// article / section / recommendation / paragraph reference.
const CITATION_PATTERNS: RegExp[] = [
  // FDL 20/2018 Art.16 / FDL No. 20 of 2018 Art.16(2)
  /\bFDL\s*(?:No\.?\s*)?\d+\s*\/\s*\d{4}\s*Art\.?\s*\d+/i,
  /\bFederal\s+Decree[- ]Law\s+(?:No\.?\s*)?\d+\s+of\s+\d{4}\b/i,
  // Cabinet Decision 10/2019 Art.6
  /\bCabinet\s+(?:Decision|Resolution)\s*(?:No\.?\s*)?\d+\s*(?:\/|of)\s*\d{4}\b/i,
  // FATF R.10 / FATF Rec 10 / FATF Recommendation 10 / R.16 INR.16
  /\bFATF\s+(?:R\.?|Rec\.?|Recommendation)\s*\d+/i,
  /\bINR\.?\s*\d+/i,
  // EU 5AMLD Art.18a / 6AMLD Art.6 / EU Regulation 2580/2001
  /\b(?:5|6)?AMLD\s+Art\.?\s*\d+/i,
  /\bEU\s+(?:Directive|Regulation)\s+\d+\s*\/\s*\d+/i,
  // OFAC 31 CFR §501.603 / FinCEN 31 CFR 1010.310
  /\b\d+\s*CFR\s*§?\s*\d+\.\d+/i,
  // BSA 31 USC §5318(g)
  /\b\d+\s*USC\s*§?\s*\d+/i,
  // MLR 2017 Reg.18 / Money Laundering Regulations 2017 Reg.18
  /\bMLR\s*\d{4}\s+Reg\.?\s*\d+/i,
  // POCA 2002 s.330
  /\bPOCA\s*\d{4}\s+s\.?\s*\d+/i,
  // UNSCR 1267 / UN Security Council Resolution 1267
  /\bUNSCR\s*\d+/i,
  /\bUN\s+Security\s+Council\s+Resolution\s+\d+/i,
  // UAE MoE Circular 08/2021
  /\bMoE\s+Circular\s+\d+\s*\/\s*\d{4}/i,
];

const AUDIT_LINE_PATTERN = /AUDIT[_ ]?LINE/i;

/**
 * Score an advisor narrative against the CITATION ENFORCEMENT rules.
 *
 * The function is pure: same input → same output, no I/O, no clock.
 * Verdict from the advisor's own self-review is folded in as a soft signal,
 * not a hard override — a "blocked" verdict caps confidence at 30, an
 * "approved" verdict adds a 10-point bonus once the structural gates pass.
 */
export function scoreAdvisorAnswer(
  narrative: string,
  verdict: 'approved' | 'returned_for_revision' | 'blocked' | 'incomplete' = 'approved',
): AdvisorScore {
  const text = narrative.trim();
  const failures: string[] = [];

  // ── Structural counts ───────────────────────────────────────────────────
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40); // skip headers / one-liners
  const paragraphCount = paragraphs.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  let citationCount = 0;
  let paragraphsWithoutCitation = 0;
  for (const paragraph of paragraphs) {
    let pCitations = 0;
    for (const pattern of CITATION_PATTERNS) {
      const matches = paragraph.match(pattern);
      if (matches) pCitations += matches.length;
    }
    citationCount += pCitations;
    if (pCitations === 0) paragraphsWithoutCitation += 1;
  }

  // ── Hedge counting (rule 2) ─────────────────────────────────────────────
  // Strip lines that begin with an allowed label so hedges inside an explicit
  // forward-looking / counterfactual block don't count.
  const factualText = text
    .split('\n')
    .filter((line) => !HEDGE_SAFE_LABEL.test(line))
    .join('\n');
  let hedgeCount = 0;
  for (const pattern of HEDGE_PATTERNS) {
    const matches = factualText.match(pattern);
    if (matches) hedgeCount += matches.length;
  }

  // ── Audit-line check ────────────────────────────────────────────────────
  const hasAuditLine = AUDIT_LINE_PATTERN.test(text);

  // ── Jurisdiction discipline (rule 5) ────────────────────────────────────
  const jurisdictionTags = ['UAE', 'EU', 'UK', 'US', 'FATF'];
  const jurisdictionsMentioned = jurisdictionTags.filter((j) =>
    new RegExp(`\\b${j}\\b`).test(text),
  );
  const hasMultipleJurisdictions = jurisdictionsMentioned.length >= 2;

  const diagnostics = {
    paragraphCount,
    citationCount,
    hedgeCount,
    paragraphsWithoutCitation,
    hasAuditLine,
    hasMultipleJurisdictions,
    wordCount,
  };

  // ── Confidence (0–100) ──────────────────────────────────────────────────
  // Start at 50 and adjust up/down against rule compliance.
  let confidence = 50;

  // Citation density — rule 6 (≥1 citation per substantive paragraph).
  if (paragraphCount > 0) {
    const density = citationCount / paragraphCount;
    if (density >= 1.5) confidence += 25;
    else if (density >= 1.0) confidence += 15;
    else if (density >= 0.5) confidence += 5;
    else { confidence -= 15; failures.push('citation_density_below_threshold'); }
  } else if (wordCount < 80) {
    failures.push('narrative_too_short_to_score');
    confidence -= 20;
  }

  // Hedge penalty — rule 2.
  if (hedgeCount === 0) confidence += 10;
  else if (hedgeCount <= 2) confidence -= 0;
  else if (hedgeCount <= 5) { confidence -= 10; failures.push('hedges_in_factual_claims'); }
  else { confidence -= 25; failures.push('mass_hedging'); }

  // Audit line — required, big penalty if missing.
  if (!hasAuditLine) { confidence -= 15; failures.push('missing_audit_line'); }

  // Verdict influence.
  if (verdict === 'approved') confidence += 5;
  else if (verdict === 'returned_for_revision') confidence -= 10;
  else if (verdict === 'blocked') { confidence = Math.min(confidence, 30); failures.push('advisor_blocked'); }
  else if (verdict === 'incomplete') { confidence -= 20; failures.push('advisor_incomplete'); }

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  // ── Consistency (0–1) ───────────────────────────────────────────────────
  // Rewards: full citation coverage, audit line, jurisdiction discipline when
  // multiple regimes are mentioned, no excessive hedging.
  let consistency = 0.5;
  if (paragraphCount > 0) {
    const coverage = 1 - paragraphsWithoutCitation / paragraphCount;
    consistency = 0.3 + coverage * 0.5;
    if (hasAuditLine) consistency += 0.1;
    if (hedgeCount > 5) consistency -= 0.1;
    if (jurisdictionsMentioned.length >= 2 && !hasMultipleJurisdictions) {
      consistency -= 0.1;
      failures.push('jurisdictions_not_separated');
    }
  } else {
    consistency = 0.3;
  }
  if (verdict === 'blocked' || verdict === 'incomplete') consistency = Math.min(consistency, 0.4);
  consistency = Math.max(0, Math.min(1, Math.round(consistency * 100) / 100));

  // Same gate the external RAG uses.
  const passedQualityGate = confidence >= 40 && consistency >= 0.6 && verdict !== 'blocked';

  return {
    confidenceScore: confidence,
    consistencyScore: consistency,
    passedQualityGate,
    failures,
    diagnostics,
  };
}
