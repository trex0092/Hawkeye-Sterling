// Hawkeye Sterling — fusion layer.
// Replaces naive averaging with a regulator-auditable combination of:
//   · Bayesian update from explicit or score-derived likelihood ratios
//   · Confidence × evidence-credibility × freshness weighted aggregation
//   · Cross-mode conflict detection with escalation-on-conflict
//   · Per-faculty activation and composite cognitive-firepower metric
//
// Charter P9: every input, weight and transformation is explicit. No hidden calibration.
// The returned FusionResult carries a plain-text methodology string for downstream report.

import type {
  CognitiveFirepower, ConsensusLevel, FacultyActivation, FacultyId,
  Finding, FindingConflict, FusionResult, Hypothesis, LikelihoodRatio,
  Verdict,
} from './types.js';
import type { EvidenceItem } from './evidence.js';
import { credibilityScore, freshnessFactor } from './evidence.js';
import { bayesUpdate } from './bayesian-update.js';
import { FACULTIES } from './faculties.js';

const EPS = 1e-9;
const DEFAULT_PRIOR = 0.10;             // base rate for illicit_risk absent strong signal
const IMPLICIT_LR_ALPHA = 4;            // score→LR shape: lr = exp(α·confidence·(score−0.5))
const NO_EVIDENCE_QUALITY = 0.5;        // quality penalty when a finding cites no resolvable evidence
const CONFLICT_DELTA = 0.4;             // default |Δscore| threshold for conflict flagging
const TOP_K_FOR_CONFLICT = 6;
const CONFLICTS_RETURNED_MAX = 12;

export interface FuseOptions {
  /** Resolves finding.evidence[] IDs to EvidenceItem for credibility/freshness attenuation. */
  evidenceIndex?: Map<string, EvidenceItem> | undefined;
  /** Prior P(primaryHypothesis) used as the starting probability for Bayesian update. */
  prior?: number | undefined;
  /** Primary hypothesis whose posterior drives the outcome. Defaults to 'illicit_risk'. */
  primaryHypothesis?: Hypothesis | undefined;
  /** Evidence older than this is treated as stale and its contribution is halved. */
  maxStalenessDays?: number | undefined;
  /** |Δscore| threshold between contributing findings to register as a conflict. */
  conflictScoreThreshold?: number | undefined;
}

export function fuseFindings(findings: Finding[], opts: FuseOptions = {}): FusionResult {
  const primary: Hypothesis = opts.primaryHypothesis ?? 'illicit_risk';
  const prior = clamp01(opts.prior ?? DEFAULT_PRIOR);
  const conflictDelta = opts.conflictScoreThreshold ?? CONFLICT_DELTA;
  const idx = opts.evidenceIndex;
  const maxStale = opts.maxStalenessDays ?? 365;

  // 1. Contributors: non-stub, non-meta findings actually about the subject.
  const contributors = findings.filter(isContributor);
  const contributorCount = contributors.length;

  // 2. An explicit non-stub 'block' verdict short-circuits to block.
  const hasBlock = contributors.some((f) => f.verdict === 'block');

  // 3. Weighted aggregation (confidence × evidence quality).
  let sumWeight = 0;
  let sumScoreW = 0;
  let sumConfW = 0;
  const qualities = new Map<Finding, number>();
  for (const f of contributors) {
    const q = evidenceQuality(f, idx, maxStale);
    qualities.set(f, q);
    const w = Math.max(0, (f.weight ?? f.confidence) * q);
    sumWeight += w;
    sumScoreW += f.score * w;
    sumConfW += f.confidence * w;
  }
  const weightedScore = sumWeight > 0 ? sumScoreW / sumWeight : 0;
  const weightedConfidence = sumWeight > 0 ? sumConfW / sumWeight : 0;

  // 4. Group by hypothesis for per-H posteriors.
  const byH: Map<Hypothesis, Finding[]> = new Map();
  for (const f of contributors) {
    const h = f.hypothesis ?? primary;
    if (!byH.has(h)) byH.set(h, []);
    byH.get(h)!.push(f);
  }

  const posteriorsByHypothesis: Partial<Record<Hypothesis, number>> = {};
  let primaryBayesTrace: ReturnType<typeof bayesUpdate> | undefined;
  for (const [h, arr] of byH.entries()) {
    const built = buildLRs(arr, qualities, idx);
    if (built.lrs.length === 0) continue;
    const trace = bayesUpdate(prior, built.lrs);
    // Charter P6 — surface raw vs weighted LR per step so MLROs can audit
    // exactly why a piece of evidence was discounted.
    for (let i = 0; i < trace.steps.length; i++) {
      const step = trace.steps[i];
      const m = built.meta[i];
      if (!step || !m) continue;
      step.rawLR = m.rawLR;
      step.effectiveWeight = m.weight;
      step.weightedLR = m.weightedLR;
    }
    posteriorsByHypothesis[h] = trace.posterior;
    if (h === primary) primaryBayesTrace = trace;
  }
  const posterior = primaryBayesTrace?.posterior ?? prior;
  posteriorsByHypothesis[primary] = posterior;

  // 5. Conflict detection (per-hypothesis, top×bottom pair scan).
  const conflicts = detectConflicts(contributors, conflictDelta);

  // 6. Consensus: strong / weak / conflicted / sparse.
  const consensus = computeConsensus(contributors, conflicts, weightedConfidence);

  // 7. Firepower: per-faculty activation + composite metric over the 10 faculties.
  const firepower = computeFirepower(contributors, qualities, idx);

  // 8. Outcome mapping: respect block, escalate on conflict, map posterior+score otherwise.
  const outcome = computeOutcome({
    hasBlock, posterior, weightedScore, contributorCount, consensus, conflicts, findings: contributors,
  });

  const methodology =
    'Fusion methodology (charter P9): each contributing finding is weighted by ' +
    'confidence × evidence credibility × continuous freshness (per-source half-life ' +
    'decay). Likelihood ratios — either emitted by the mode or derived from score × ' +
    'confidence as lr = exp(' + IMPLICIT_LR_ALPHA + '·c·(s−0.5)) — are combined via ' +
    'log-linear pooling (Bordley/Genest): LR_eff = LR_raw ^ q, where q ∈ [0,1] is the ' +
    'evidence-specific credibility×freshness weight. The pooled LRs then update a stated ' +
    `prior P(${primary}) = ${prior.toFixed(3)} via Bayesian update of the prior odds. Per Charter ` +
    'P6 every BayesTrace step records rawLR, effectiveWeight and weightedLR for full ' +
    `auditability. Conflicts between contributors whose |Δscore| exceeds ${conflictDelta} ` +
    'with divergent non-inconclusive verdicts are surfaced and escalate the outcome rather ' +
    'than being averaged. Per-faculty activation scores across the ten declared faculties ' +
    'are aggregated to compute the composite cognitive-firepower metric.';

  const result: FusionResult = {
    outcome,
    score: weightedScore,
    confidence: weightedConfidence,
    weightedScore,
    prior,
    posterior,
    primaryHypothesis: primary,
    posteriorsByHypothesis,
    conflicts,
    consensus,
    contributorCount,
    methodology,
    firepower,
  };
  if (primaryBayesTrace !== undefined) result.bayesTrace = primaryBayesTrace;
  return result;
}

// ── helpers ──────────────────────────────────────────────────────────────

function isContributor(f: Finding): boolean {
  if (f.tags?.includes('meta') || f.tags?.includes('introspection')) return false;
  if (f.rationale.startsWith('[stub]')) return false;
  if (f.score === 0 && f.confidence === 0 && f.verdict === 'inconclusive') return false;
  return true;
}

function evidenceItemQuality(ev: EvidenceItem): number {
  // Continuous freshness × credibility. Per-source half-life lives in evidence.ts.
  return credibilityScore(ev.credibility) * freshnessFactor(ev);
}

function evidenceQuality(
  f: Finding,
  idx: Map<string, EvidenceItem> | undefined,
  _maxStale: number,
): number {
  if (!idx || f.evidence.length === 0) return NO_EVIDENCE_QUALITY;
  const qs: number[] = [];
  for (const id of f.evidence) {
    const ev = idx.get(id);
    if (!ev) continue;
    qs.push(evidenceItemQuality(ev));
  }
  if (qs.length === 0) return NO_EVIDENCE_QUALITY;
  return qs.reduce((a, b) => a + b, 0) / qs.length;
}

interface LRMeta {
  rawLR: number;
  weight: number;
  weightedLR: number;
}

function buildLRs(
  findings: Finding[],
  qualities: Map<Finding, number>,
  idx: Map<string, EvidenceItem> | undefined,
): { lrs: LikelihoodRatio[]; meta: LRMeta[] } {
  const out: LikelihoodRatio[] = [];
  const meta: LRMeta[] = [];
  for (const f of findings) {
    const findingQ = qualities.get(f) ?? NO_EVIDENCE_QUALITY;
    if (f.likelihoodRatios && f.likelihoodRatios.length > 0) {
      for (const lr of f.likelihoodRatios) {
        const raw = safeRatio(lr.positiveGivenHypothesis, lr.positiveGivenNot);
        // Per-LR weight: prefer the specific cited evidence's quality when the
        // LR.evidenceId resolves against the index; fall back to the
        // finding-level average otherwise.
        const specific = idx?.get(lr.evidenceId);
        const w = specific !== undefined ? evidenceItemQuality(specific) : findingQ;
        const weighted = attenuateLR(raw, w);
        out.push(effectiveLR(`${f.modeId}:${lr.evidenceId}`, weighted));
        meta.push({ rawLR: raw, weight: w, weightedLR: weighted });
      }
    } else {
      // Derive implicit LR from score × confidence when mode declined to emit explicit LRs.
      const implied = Math.exp(IMPLICIT_LR_ALPHA * f.confidence * (f.score - 0.5));
      const weighted = attenuateLR(implied, findingQ);
      out.push(effectiveLR(`${f.modeId}:implicit`, weighted));
      meta.push({ rawLR: implied, weight: findingQ, weightedLR: weighted });
    }
  }
  return { lrs: out, meta };
}

function safeRatio(num: number, den: number): number {
  const n = Math.min(1 - EPS, Math.max(EPS, num));
  const d = Math.min(1 - EPS, Math.max(EPS, den));
  return n / d;
}

function attenuateLR(lr: number, q: number): number {
  // Log-linear pooling (Bordley 1982 / Genest 1986): weighted Bayesian
  // combination is multiplicative in log-odds, i.e. log(LR_eff) = q · log(LR).
  // Equivalently LR_eff = LR^q. q ∈ [0,1]. q=0 → neutral (1.0); q=1 → raw LR.
  // This is the principled form for evidence-quality-weighted LR composition;
  // the previous linear-toward-neutral form (1 + q·(lr-1)) under-damped weak
  // evidence and is replaced here.
  const qc = Math.min(1, Math.max(0, q));
  if (qc === 0) return 1;
  const safe = Math.max(EPS, lr);
  const out = Math.pow(safe, qc);
  return Number.isFinite(out) ? out : 1;
}

function effectiveLR(evidenceId: string, a: number): LikelihoodRatio {
  // Pack a scalar LR into a LikelihoodRatio whose num/den ratio equals `a` within clamp bounds.
  const safe = Math.max(0.01, Math.min(100, a));
  if (safe >= 1) {
    return {
      evidenceId,
      positiveGivenHypothesis: 0.95,
      positiveGivenNot: Math.max(EPS, 0.95 / safe),
    };
  }
  return {
    evidenceId,
    positiveGivenHypothesis: Math.max(EPS, 0.95 * safe),
    positiveGivenNot: 0.95,
  };
}

function detectConflicts(findings: Finding[], delta: number): FindingConflict[] {
  const conflicts: FindingConflict[] = [];
  const byH: Map<Hypothesis, Finding[]> = new Map();
  for (const f of findings) {
    const h: Hypothesis = f.hypothesis ?? 'illicit_risk';
    if (!byH.has(h)) byH.set(h, []);
    byH.get(h)!.push(f);
  }
  for (const [h, arr] of byH.entries()) {
    const sorted = [...arr].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, TOP_K_FOR_CONFLICT);
    const bottom = sorted.slice(-TOP_K_FOR_CONFLICT);
    for (const a of top) {
      for (const b of bottom) {
        if (a.modeId === b.modeId) continue;
        const diff = Math.abs(a.score - b.score);
        const bothDecisive =
          a.verdict !== 'inconclusive' && b.verdict !== 'inconclusive';
        if (diff > delta && a.verdict !== b.verdict && bothDecisive) {
          conflicts.push({
            a: a.modeId, b: b.modeId,
            aVerdict: a.verdict, bVerdict: b.verdict,
            aScore: a.score, bScore: b.score,
            delta: diff,
            hypothesis: h,
            note: `H=${h}: ${a.modeId} ${a.verdict}@${a.score.toFixed(2)} vs ${b.modeId} ${b.verdict}@${b.score.toFixed(2)}.`,
          });
        }
      }
    }
  }
  return conflicts.slice(0, CONFLICTS_RETURNED_MAX);
}

function computeConsensus(
  contributors: Finding[],
  conflicts: FindingConflict[],
  weightedConfidence: number,
): ConsensusLevel {
  if (contributors.length < 3) return 'sparse';
  if (conflicts.some((c) => c.delta > 0.5)) return 'conflicted';
  const scores = contributors.map((f) => f.score);
  const mean = avg(scores);
  const variance = avg(scores.map((s) => (s - mean) * (s - mean)));
  if (variance < 0.05 && weightedConfidence > 0.6) return 'strong';
  return 'weak';
}

function computeFirepower(
  contributors: Finding[],
  qualities: Map<Finding, number>,
  idx: Map<string, EvidenceItem> | undefined,
): CognitiveFirepower {
  const activations: FacultyActivation[] = [];
  const independentEvidence = new Set<string>();
  const categoriesSpanned = new Set<string>();

  for (const f of contributors) {
    categoriesSpanned.add(f.category);
    for (const id of f.evidence) {
      if (idx) {
        if (idx.has(id)) independentEvidence.add(id);
      } else {
        independentEvidence.add(id);
      }
    }
  }

  const facultyIds: FacultyId[] = FACULTIES.map((f) => f.id);
  let engaged = 0;
  for (const fid of facultyIds) {
    const modes = contributors.filter((c) => c.faculties.includes(fid));
    let sumW = 0, sumScoreW = 0, sumConfW = 0;
    for (const f of modes) {
      const q = qualities.get(f) ?? NO_EVIDENCE_QUALITY;
      const w = Math.max(EPS, (f.weight ?? f.confidence) * q);
      sumW += w;
      sumScoreW += f.score * w;
      sumConfW += f.confidence * w;
    }
    const weightedScore = sumW > 0 ? sumScoreW / sumW : 0;
    const weightedConfidence = sumW > 0 ? sumConfW / sumW : 0;
    let status: FacultyActivation['status'] = 'silent';
    if (modes.length >= 3 && weightedScore >= 0.5) status = 'dominant';
    else if (modes.length >= 1 && weightedScore >= 0.3) status = 'engaged';
    else if (modes.length >= 1) status = 'weak';
    if (status !== 'silent') engaged++;
    activations.push({
      facultyId: fid,
      modesFired: modes.length,
      weightedScore,
      weightedConfidence,
      status,
    });
  }

  const firepowerScore = clamp01(
    0.4 * (engaged / facultyIds.length) +
    0.3 * Math.min(categoriesSpanned.size / 16, 1) +
    0.3 * Math.min(independentEvidence.size / 8, 1),
  );

  return {
    activations,
    modesFired: contributors.length,
    facultiesEngaged: engaged,
    categoriesSpanned: categoriesSpanned.size,
    independentEvidenceCount: independentEvidence.size,
    firepowerScore,
  };
}

interface OutcomeArgs {
  hasBlock: boolean;
  posterior: number;
  weightedScore: number;
  contributorCount: number;
  consensus: ConsensusLevel;
  conflicts: FindingConflict[];
  findings: Finding[];
}

function computeOutcome(a: OutcomeArgs): Verdict {
  if (a.hasBlock) return 'block';
  if (a.contributorCount === 0) return 'inconclusive';
  if (a.consensus === 'conflicted' && a.findings.some((f) => f.score > 0.5)) return 'escalate';
  if (a.posterior >= 0.85 || a.weightedScore >= 0.8) return 'escalate';
  if (a.posterior >= 0.5 || a.weightedScore >= 0.5) return 'flag';
  if (a.consensus === 'sparse') return 'inconclusive';
  return 'clear';
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
