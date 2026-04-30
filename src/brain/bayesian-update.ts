// Hawkeye Sterling — minimal Bayesian update helper.
// Turns qualitative evidence into numeric posteriors so findings can carry
// auditable probability estimates. Charter P9: all inputs, weights and
// transformations are explicit. No hidden calibration.

export interface LikelihoodRatio {
  evidenceId: string;
  positiveGivenHypothesis: number; // P(E | H), 0..1
  positiveGivenNot: number;        // P(E | ¬H), 0..1
}

export interface BayesTraceStep {
  evidenceId: string;
  lr: number;                  // effective LR actually applied (post-weighting)
  priorOdds: number;
  posteriorOdds: number;
  posterior: number;
  // Charter P6 (transparent scoring): when fusion attenuates an LR by evidence
  // credibility×freshness it MUST surface what the raw LR was, the weight that
  // was applied, and the weighted LR. Optional so callers that bypass the
  // weighting layer (or write traces by hand) need not populate them.
  rawLR?: number;
  effectiveWeight?: number;    // 0..1 credibility × freshness applied to raw LR
  weightedLR?: number;         // pow(rawLR, effectiveWeight); equals `lr` when set
}

export interface BayesTrace {
  prior: number;
  posterior: number;
  steps: BayesTraceStep[];
}

const EPS = 1e-9;

export function bayesUpdate(prior: number, lrs: LikelihoodRatio[]): BayesTrace {
  const steps: BayesTrace['steps'] = [];
  let p = Math.min(1 - EPS, Math.max(EPS, prior));
  for (const e of lrs) {
    const num = Math.min(1 - EPS, Math.max(EPS, e.positiveGivenHypothesis));
    const den = Math.min(1 - EPS, Math.max(EPS, e.positiveGivenNot));
    const lr = num / den;
    const priorOdds = p / (1 - p);
    const posteriorOdds = priorOdds * lr;
    const posterior = posteriorOdds / (1 + posteriorOdds);
    steps.push({ evidenceId: e.evidenceId, lr, priorOdds, posteriorOdds, posterior });
    p = posterior;
  }
  return { prior, posterior: p, steps };
}

export function brierScore(predicted: number, actual: 0 | 1): number {
  const p = Math.min(1, Math.max(0, predicted));
  return (p - actual) * (p - actual);
}

export function logScore(predicted: number, actual: 0 | 1): number {
  const p = Math.min(1 - EPS, Math.max(EPS, predicted));
  return actual === 1 ? -Math.log(p) : -Math.log(1 - p);
}
