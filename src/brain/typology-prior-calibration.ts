// Hawkeye Sterling — typology-prior calibration from outcomes
// (audit follow-up #9). Given the OutcomeFeedbackJournal record set,
// derives empirical priors P(typology | sector, jurisdiction) so the
// Bayesian fusion uses BASE RATES OBSERVED IN PRACTICE rather than
// the conservative defaults. Charter P9: every prior is auditable —
// the supporting case-count is reported alongside.
//
// Empirical update rule (Beta-Binomial conjugate):
//   posterior_alpha = prior_alpha + observed_positives
//   posterior_beta  = prior_beta  + observed_negatives
//   posterior_mean  = posterior_alpha / (posterior_alpha + posterior_beta)
//
// Default prior: Beta(1,9) — i.e. P=0.10 with 10 effective prior
// observations. This matches DEFAULT_PRIOR in fusion.ts.

import type { OutcomeRecord } from './outcome-feedback.js';

export interface TypologyPriorEntry {
  typology: string;             // e.g. 'tbml', 'mixer_use', 'shell_layering'
  sector?: string;              // 'dpms' | 'real_estate' | 'vasp' | …
  jurisdiction?: string;        // ISO2
  alpha: number;                // pseudo-positives (Beta param)
  beta: number;                 // pseudo-negatives
  meanPrior: number;            // alpha / (alpha + beta)
  caseCount: number;            // observed cases used to derive
  derivedAt: string;            // ISO 8601
  confidence: 'low' | 'medium' | 'high';   // banded by caseCount
}

interface CaseLike {
  modeIds?: string[];
  sector?: string;
  jurisdiction?: string;
  // groundTruth: 'confirmed' = positive, 'reversed' = negative, 'pending' = excluded.
  groundTruth?: 'confirmed' | 'reversed' | 'pending';
}

const DEFAULT_PRIOR_ALPHA = 1;
const DEFAULT_PRIOR_BETA = 9;

function bandConfidence(caseCount: number): TypologyPriorEntry['confidence'] {
  if (caseCount >= 100) return 'high';
  if (caseCount >= 25) return 'medium';
  return 'low';
}

/** Derive empirical priors from a journal of outcomes. Optionally
 *  partition by sector + jurisdiction. */
export function deriveTypologyPriors(
  records: readonly OutcomeRecord[],
  enrichments: ReadonlyMap<string, { sector?: string; jurisdiction?: string }>,
): TypologyPriorEntry[] {
  const counts = new Map<string, { alpha: number; beta: number; cases: number }>();

  function bump(typology: string, sector: string | undefined, jurisdiction: string | undefined, isPositive: boolean): void {
    const key = `${typology}::${sector ?? '*'}::${jurisdiction ?? '*'}`;
    const slot = counts.get(key) ?? {
      alpha: DEFAULT_PRIOR_ALPHA,
      beta: DEFAULT_PRIOR_BETA,
      cases: 0,
    };
    if (isPositive) slot.alpha++;
    else slot.beta++;
    slot.cases++;
    counts.set(key, slot);
  }

  for (const r of records) {
    if (r.groundTruth !== 'confirmed' && r.groundTruth !== 'reversed') continue;
    const enrich = enrichments.get(r.runId);
    const isPositive = r.groundTruth === 'confirmed';
    for (const typology of r.modeIds ?? []) {
      bump(typology, enrich?.sector, enrich?.jurisdiction, isPositive);
      // Also bump the marginal (sector-only / jurisdiction-only / global).
      if (enrich?.sector) bump(typology, enrich.sector, undefined, isPositive);
      if (enrich?.jurisdiction) bump(typology, undefined, enrich.jurisdiction, isPositive);
      bump(typology, undefined, undefined, isPositive);
    }
  }

  const out: TypologyPriorEntry[] = [];
  for (const [key, c] of counts) {
    const [typology, sector, jurisdiction] = key.split('::');
    if (!typology) continue;
    out.push({
      typology,
      ...(sector !== '*' && sector !== undefined && { sector }),
      ...(jurisdiction !== '*' && jurisdiction !== undefined && { jurisdiction }),
      alpha: c.alpha,
      beta: c.beta,
      meanPrior: c.alpha / (c.alpha + c.beta),
      caseCount: c.cases,
      derivedAt: new Date().toISOString(),
      confidence: bandConfidence(c.cases),
    });
  }
  return out.sort((a, b) => b.caseCount - a.caseCount);
}

/** Best-prior lookup for a (typology, sector, jurisdiction) triple,
 *  falling back from most-specific to least-specific bucket. */
export function bestPriorFor(
  priors: readonly TypologyPriorEntry[],
  typology: string,
  sector?: string,
  jurisdiction?: string,
): TypologyPriorEntry | undefined {
  const candidates = priors.filter((p) => p.typology === typology);
  return (
    candidates.find((p) => p.sector === sector && p.jurisdiction === jurisdiction) ??
    candidates.find((p) => p.sector === sector && p.jurisdiction === undefined) ??
    candidates.find((p) => p.sector === undefined && p.jurisdiction === jurisdiction) ??
    candidates.find((p) => p.sector === undefined && p.jurisdiction === undefined)
  );
}

/** Bound the empirical prior with the conservative default. Caller picks
 *  whether to blend or hard-floor. */
export function safePrior(entry: TypologyPriorEntry | undefined, defaultPrior = 0.10): number {
  if (!entry) return defaultPrior;
  if (entry.confidence === 'low') {
    // Blend low-confidence empirical prior with default (50/50).
    return (entry.meanPrior + defaultPrior) / 2;
  }
  return entry.meanPrior;
}
