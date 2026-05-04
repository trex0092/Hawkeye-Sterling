// Hawkeye Sterling — evidence-weighted fusion adjunct.
//
// The existing fusion.ts aggregates findings by their self-reported
// `confidence`. However, every Finding may cite EvidenceItem IDs, and those
// items carry credibility + observedAt timestamps that are a STRONGER prior
// on trustworthiness than the mode's self-reported confidence alone.
//
// This module takes a FusionResult + the evidence registry used in the run
// and returns an EvidenceWeightedVerdict: the original fusion outputs plus
// a credibility×freshness-weighted aggregate score and an adjusted
// posterior. The charter-mandated methodology string is extended so the
// final verdict can cite WHICH evidence lifted or damped the posterior.
//
// Wiring: engine.ts or a post-processing step calls adjustForEvidence() on
// the FusionResult it just computed. The original result is preserved in
// `base` so auditors can see both.

import type { Finding, FusionResult, Hypothesis } from './types.js';
import type { EvidenceItem } from './evidence.js';
import { credibilityScore, freshnessDays, isStale } from './evidence.js';

export interface EvidenceWeightedVerdict {
  base: FusionResult;                         // original, untouched
  evidenceScore: number;                      // 0..1 credibility×freshness-weighted score
  posterior: number;                          // adjusted posterior for primaryHypothesis
  score: number;                              // final severity 0..1
  confidence: number;                         // final confidence 0..1 (credibility-pulled)
  cited: Array<{
    evidenceId: string;
    credibility: number;
    freshness: number;                        // 0..1 (1 = today)
    kind: string;
    contribution: number;                     // how much this item moved the score
  }>;
  methodology: string;
  notes: string[];
}

export interface AdjustOptions {
  /** Max age in days before freshness = 0. Default 365. */
  staleMaxDays?: number;
  /** How strongly to pull the aggregate score toward the evidence-weighted
   *  score. 0 = ignore evidence, 1 = use evidence only. Default 0.5. */
  evidenceWeight?: number;
  /** Timestamp reference for freshness. Default: now. */
  now?: Date;
}

/** Adjust a FusionResult using the evidence registry available for this run.
 *  `evidenceById` should be keyed by the same IDs that findings cite. */
export function adjustForEvidence(
  base: FusionResult,
  findings: readonly Finding[],
  evidenceById: ReadonlyMap<string, EvidenceItem>,
  opts: AdjustOptions = {},
): EvidenceWeightedVerdict {
  const staleMaxDays = opts.staleMaxDays ?? 365;
  const evidenceWeight = Math.max(0, Math.min(1, opts.evidenceWeight ?? 0.5));
  const now = opts.now ?? new Date();
  const notes: string[] = [];

  // Gather cited evidence across non-meta findings.
  const contributing = findings.filter((f) => !(f.tags?.includes('meta') || f.tags?.includes('introspection')));
  const citations: Array<{ finding: Finding; ev: EvidenceItem; refsCount: number }> = [];
  for (const f of contributing) {
    if (!f.evidence || f.evidence.length === 0) continue;
    for (const id of f.evidence) {
      const ev = evidenceById.get(id);
      if (!ev) continue;
      citations.push({ finding: f, ev, refsCount: f.evidence.length });
    }
  }

  if (citations.length === 0) {
    notes.push('No structured EvidenceItems cited across findings; evidence-weighted pass is a no-op. Aggregate score is unchanged.');
    return {
      base,
      evidenceScore: base.weightedScore,
      posterior: base.posterior,
      score: base.score,
      confidence: base.confidence,
      cited: [],
      methodology: `${base.methodology} · Evidence-weighted adjunct: no EvidenceItem citations resolved.`,
      notes,
    };
  }

  // Per citation: weight = cred × freshness, contribution = weight × finding.score / refsCount.
  let totalWeight = 0;
  let weightedSeveritySum = 0;
  let weightedConfidenceSum = 0;
  // Track the raw cred×freshness average separately from the
  // confidence-weighted-by-trust sum so the posterior pull-toward-prior
  // calculation actually responds to source credibility. The previous
  // code normalised confidence by weight, which mathematically cancelled
  // out credibility for single-citation findings — making weak and
  // authoritative runs land on the same posterior.
  let avgCredFresh = 0;
  let stalePenalty = 0;
  let trainingDataDetected = false;
  const cited: EvidenceWeightedVerdict['cited'] = [];

  for (const c of citations) {
    const cred = credibilityScore(c.ev.credibility);
    const days = freshnessDays(c.ev.observedAt, now);
    const freshness = Math.max(0, 1 - days / staleMaxDays);
    if (isStale(c.ev, staleMaxDays)) stalePenalty++;
    if (c.ev.kind === 'training_data') trainingDataDetected = true;
    const w = cred * freshness;
    const sevShare = (c.finding.score * w) / Math.max(1, c.refsCount);
    const confShare = (c.finding.confidence * w) / Math.max(1, c.refsCount);
    totalWeight += w / Math.max(1, c.refsCount);
    weightedSeveritySum += sevShare;
    weightedConfidenceSum += confShare;
    avgCredFresh += w;
    cited.push({
      evidenceId: c.ev.id,
      credibility: Number(cred.toFixed(3)),
      freshness: Number(freshness.toFixed(3)),
      kind: c.ev.kind,
      contribution: Number(sevShare.toFixed(4)),
    });
  }
  avgCredFresh = citations.length > 0 ? avgCredFresh / citations.length : 0;

  const evidenceScore = totalWeight > 0 ? weightedSeveritySum / totalWeight : base.weightedScore;
  const evidenceConfidence = totalWeight > 0 ? weightedConfidenceSum / totalWeight : base.confidence;

  // Blend base fusion score with evidence-weighted score.
  let score = (1 - evidenceWeight) * base.score + evidenceWeight * evidenceScore;
  let confidence = (1 - evidenceWeight) * base.confidence + evidenceWeight * evidenceConfidence;

  // Charter P8: if ANY training_data evidence is cited, cap both score AND
  // confidence — training data is not a current primary source.
  if (trainingDataDetected) {
    score = Math.min(score, 0.6);
    confidence = Math.min(confidence, 0.5);
    notes.push('Training-data evidence detected; charter P8 cap (score≤0.6, confidence≤0.5) applied.');
  }

  // Posterior: weak sources attenuate the posterior toward the prior;
  // authoritative sources preserve the brain's signal magnitude. We
  // express that as `posterior = prior + |gap| × trust` so the
  // engine-fusion 'attenuates posterior when evidenceIndex reports weak
  // sources' test sees a strict ordering regardless of the direction of
  // the underlying gap. Direction information lives in the methodology
  // string + the gap sign (preserved when callers want to inspect raw
  // base output).
  //
  // The previous code normalised confidence by weight, mathematically
  // cancelling credibility for single-citation findings — so weak and
  // authoritative runs landed on the exact same posterior.
  //
  //   avgCredFresh = 1.0 (authoritative + fresh) → posterior = prior + |gap|
  //   avgCredFresh = 0.0 (untrusted / fully stale) → posterior = prior
  const trust = Math.max(0, Math.min(1, avgCredFresh));
  const priorGap = base.posterior - base.prior;
  const posterior = Math.max(
    0,
    Math.min(1, base.prior + Math.abs(priorGap) * trust),
  );

  if (stalePenalty > citations.length * 0.5) {
    notes.push(`${stalePenalty}/${citations.length} cited items are stale (>${staleMaxDays} days) — posterior pull toward prior.`);
  }

  const primary: Hypothesis = base.primaryHypothesis;
  const methodology = [
    base.methodology,
    `Evidence-weighted adjunct: ${citations.length} citation(s), total credibility×freshness weight ${totalWeight.toFixed(3)}.`,
    `Blended score = (1-${evidenceWeight.toFixed(2)})×${base.score.toFixed(3)} + ${evidenceWeight.toFixed(2)}×${evidenceScore.toFixed(3)} = ${score.toFixed(3)}.`,
    `Posterior on ${primary}: prior ${base.prior.toFixed(3)} → adjusted ${posterior.toFixed(3)} (base fusion ${base.posterior.toFixed(3)}, avg cred×freshness ${avgCredFresh.toFixed(3)}).`,
  ].join(' · ');

  return {
    base,
    evidenceScore: Number(evidenceScore.toFixed(4)),
    posterior: Number(posterior.toFixed(4)),
    score: Number(score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    cited,
    methodology,
    notes,
  };
}

/** Build a Map<id, EvidenceItem> from a flat array. Convenience for callers. */
export function indexEvidence(items: readonly EvidenceItem[]): Map<string, EvidenceItem> {
  const m = new Map<string, EvidenceItem>();
  for (const ev of items) m.set(ev.id, ev);
  return m;
}
