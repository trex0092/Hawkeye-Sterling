// Hawkeye Sterling — statistical-learning helpers (Layers 242-245).

// 242. Probabilistic typology classifier (naive Bayes from feature counts)
export interface TypologyTrainingExample { typology: string; features: string[] }
export interface NbModel {
  priors: Record<string, number>;
  likelihoods: Record<string, Record<string, number>>;
  vocab: Set<string>;
  classes: string[];
}
export function trainNb(examples: TypologyTrainingExample[]): NbModel {
  const counts: Record<string, number> = {};
  const featCounts: Record<string, Record<string, number>> = {};
  const vocab = new Set<string>();
  for (const e of examples) {
    counts[e.typology] = (counts[e.typology] ?? 0) + 1;
    featCounts[e.typology] ??= {};
    for (const f of e.features) {
      vocab.add(f);
      featCounts[e.typology]![f] = (featCounts[e.typology]![f] ?? 0) + 1;
    }
  }
  const total = examples.length;
  const classes = Object.keys(counts);
  const priors = Object.fromEntries(classes.map((c) => [c, counts[c]! / total]));
  const likelihoods: Record<string, Record<string, number>> = {};
  for (const c of classes) {
    likelihoods[c] = {};
    const denom = Object.values(featCounts[c]!).reduce((a, b) => a + b, 0) + vocab.size;
    for (const f of vocab) likelihoods[c]![f] = ((featCounts[c]![f] ?? 0) + 1) / denom;  // Laplace
  }
  return { priors, likelihoods, vocab, classes };
}
export function classifyNb(model: NbModel, features: string[]): { typology: string; logProb: number; ranked: Array<{ typology: string; logProb: number }> } {
  const ranked = model.classes.map((c) => {
    let lp = Math.log(model.priors[c] ?? 1e-9);
    for (const f of features) lp += Math.log(model.likelihoods[c]?.[f] ?? 1e-9);
    return { typology: c, logProb: lp };
  }).sort((a, b) => b.logProb - a.logProb);
  return { typology: ranked[0]!.typology, logProb: ranked[0]!.logProb, ranked };
}

// 243. Bayesian update on disposition
export function bayesUpdate(prior: number, likelihoodPos: number, likelihoodNeg: number, observed: boolean): number {
  // P(positive | obs) = P(obs|pos) P(pos) / [P(obs|pos)P(pos) + P(obs|neg)(1-P(pos))]
  const lp = observed ? likelihoodPos : 1 - likelihoodPos;
  const ln = observed ? likelihoodNeg : 1 - likelihoodNeg;
  const num = lp * prior;
  const den = num + ln * (1 - prior);
  return den === 0 ? prior : num / den;
}

// 244. Markov-chain transaction modelling — fit + score next-state probability
export function fitMarkov(states: string[]): { transitionProb: Record<string, Record<string, number>> } {
  const counts: Record<string, Record<string, number>> = {};
  for (let i = 1; i < states.length; i += 1) {
    const a = states[i - 1]!, b = states[i]!;
    counts[a] ??= {};
    counts[a]![b] = (counts[a]![b] ?? 0) + 1;
  }
  const transitionProb: Record<string, Record<string, number>> = {};
  for (const [a, row] of Object.entries(counts)) {
    const total = Object.values(row).reduce((s, x) => s + x, 0);
    transitionProb[a] = Object.fromEntries(Object.entries(row).map(([b, n]) => [b, n / total]));
  }
  return { transitionProb };
}
export function markovScore(model: ReturnType<typeof fitMarkov>, observed: string[]): { logLik: number; anomalyFlag: boolean } {
  let lp = 0;
  for (let i = 1; i < observed.length; i += 1) {
    const p = model.transitionProb[observed[i - 1]!]?.[observed[i]!] ?? 1e-6;
    lp += Math.log(p);
  }
  const avgLp = lp / Math.max(1, observed.length - 1);
  return { logLik: lp, anomalyFlag: avgLp < -4 };  // very unlikely sequence
}

// 245. Time-series anomaly (EWMA-based)
export function ewmaAnomaly(values: number[], alpha = 0.3, sigmaMult = 3): { anomalies: number[]; mean: number } {
  if (values.length === 0) return { anomalies: [], mean: 0 };
  let mean = values[0]!; let varEst = 0;
  const anomalies: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const x = values[i]!;
    const delta = x - mean;
    varEst = (1 - alpha) * (varEst + alpha * delta * delta);
    const sigma = Math.sqrt(varEst);
    if (sigma > 0 && Math.abs(delta) > sigmaMult * sigma) anomalies.push(i);
    mean = mean + alpha * delta;
  }
  return { anomalies, mean };
}
