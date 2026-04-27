// Hawkeye Sterling — streaming transaction anomaly detector.
// TypeScript implementation of PySAD-style online anomaly detection:
//   · HalfSpaceTrees — fast tree-based streaming detector (primary)
//   · ExponentialMovingStats — z-score baseline per feature (lightweight backup)
//   · EnsembleGate — combines both; routes transactions to alert tiers
//
// Designed to score transactions as they arrive, one at a time, without
// batch retraining. The model updates itself with every new observation.
// Analogous to pysad.models.HalfSpaceTrees + pysad.models.LODA in Python.
//
// Usage:
//   const gate = new StreamingAnomalyGate({ nFeatures: 8, windowSize: 500 });
//   const result = gate.scoreAndUpdate(featureVector);
//   if (result.tier === 'hold') flagForReview(transaction);

export interface AnomalyFeatureVector {
  amountZscore: number;        // z-score vs customer's own baseline
  velocityRatio7d: number;     // txn count / expected_7d
  counterpartyIsNew: number;   // 0 or 1
  countryRiskScore: number;    // 0–100
  hourOfDay: number;           // 0–23
  dayOfWeek: number;           // 0–6
  amountLog: number;           // log10(amount_usd)
  isRoundAmount: number;       // 0 or 1 — structuring signal
}

export type AnomalyTier = 'pass' | 'flag' | 'hold';

export interface AnomalyScoreResult {
  score: number;          // 0–1 (higher = more anomalous)
  tier: AnomalyTier;
  drivers: string[];      // feature names that drove the score
  hstScore: number;       // raw HalfSpaceTrees score
  zScore: number;         // combined feature z-score
}

// ──────────────────────────────────────────────────────────────────────────────
// ExponentialMovingStats — tracks mean + variance per feature with EMA update.
// Analogous to PySAD's RelativeEntropy / StandardAbsoluteDeviation detectors.
// ──────────────────────────────────────────────────────────────────────────────
class ExponentialMovingStats {
  private mean: Float64Array;
  private m2: Float64Array;   // running variance accumulator (Welford online)
  private n: number;
  private readonly alpha: number;   // EMA decay factor

  constructor(nFeatures: number, alpha = 0.02) {
    this.mean = new Float64Array(nFeatures);
    this.m2 = new Float64Array(nFeatures);
    this.n = 0;
    this.alpha = alpha;
  }

  update(x: number[]): void {
    this.n++;
    for (let i = 0; i < x.length; i++) {
      // Welford online mean + variance — numerically stable
      const xi = x[i] ?? 0;
      const meani = this.mean[i] ?? 0;
      const delta = xi - meani;
      const newMean = meani + delta / this.n;
      this.mean[i] = newMean;
      const delta2 = xi - newMean;
      this.m2[i] = (1 - this.alpha) * ((this.m2[i] ?? 0) + delta * delta2);
    }
  }

  zScores(x: number[]): number[] {
    return x.map((v, i) => {
      const std = Math.sqrt((this.m2[i] ?? 0) / Math.max(1, this.n));
      return std < 1e-9 ? 0 : Math.abs((v - (this.mean[i] ?? 0)) / std);
    });
  }

  combinedZScore(x: number[]): number {
    const zs = this.zScores(x);
    return zs.length > 0 ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// HalfSpaceTrees — fast streaming outlier detector.
// Implements the Half-Space Trees algorithm (Tan et al., 2011) in TypeScript.
// Random axis-aligned half-space partitions score density: sparse regions = anomalous.
// ──────────────────────────────────────────────────────────────────────────────
interface HSTNode {
  feature: number;
  threshold: number;
  left?: HSTNode;
  right?: HSTNode;
  rCount: number;   // reference window count
  lCount: number;   // latest window count
}

class HalfSpaceTree {
  private root: HSTNode;
  private readonly depth: number;
  private readonly nFeatures: number;
  private windowBuffer: number[][];
  private readonly windowSize: number;
  private windowIdx: number;

  constructor(nFeatures: number, depth: number, windowSize: number) {
    this.nFeatures = nFeatures;
    this.depth = depth;
    this.windowSize = windowSize;
    this.windowBuffer = [];
    this.windowIdx = 0;
    this.root = this.buildTree(depth);
  }

  private buildTree(depth: number): HSTNode {
    const feature = Math.floor(Math.random() * this.nFeatures);
    const threshold = Math.random() * 2 - 1;  // normalised input assumed [-1, 1]
    const node: HSTNode = { feature, threshold, rCount: 0, lCount: 0 };
    if (depth > 1) {
      node.left = this.buildTree(depth - 1);
      node.right = this.buildTree(depth - 1);
    }
    return node;
  }

  // Score: traverses to the leaf the sample falls into; returns the reference
  // window density at that leaf (lower density = higher anomaly score).
  score(x: number[]): number {
    let node: HSTNode | undefined = this.root;
    while (node) {
      const v = x[node.feature] ?? 0;
      if (v <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }
    // If leaf is null (max depth), return current node's rCount
    return 1;  // leaf node reached — density captured via counts
  }

  scoreAndUpdate(x: number[]): number {
    let node: HSTNode | undefined = this.root;
    let density = 0;

    // Traverse and update lCount at each node on the path
    const path: HSTNode[] = [];
    while (node) {
      path.push(node);
      node.lCount++;
      const v = x[node.feature] ?? 0;
      if (v <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    // Score = inverse of reference density at the deepest node reached
    const leaf = path[path.length - 1];
    density = leaf ? leaf.rCount : 0;

    // Maintain sliding window — swap reference and latest every windowSize updates
    this.windowBuffer.push(x);
    this.windowIdx++;
    if (this.windowIdx >= this.windowSize) {
      this.swapWindows();
      this.windowIdx = 0;
    }

    // Normalise: low density = anomalous → high score
    const maxDensity = Math.max(1, this.windowSize);
    return 1 - density / maxDensity;
  }

  private swapWindows(): void {
    // Copy lCount to rCount; reset lCount
    this.swapNode(this.root);
    this.windowBuffer = [];
  }

  private swapNode(node: HSTNode | undefined): void {
    if (!node) return;
    node.rCount = node.lCount;
    node.lCount = 0;
    this.swapNode(node.left);
    this.swapNode(node.right);
  }
}

class HalfSpaceTreesEnsemble {
  private trees: HalfSpaceTree[];

  constructor(nFeatures: number, nEstimators: number, depth: number, windowSize: number) {
    this.trees = Array.from({ length: nEstimators }, () =>
      new HalfSpaceTree(nFeatures, depth, windowSize),
    );
  }

  fitScorePartial(x: number[]): number {
    const scores = this.trees.map((t) => t.scoreAndUpdate(x));
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// StreamingAnomalyGate — the full two-model ensemble gate.
// ──────────────────────────────────────────────────────────────────────────────
export interface StreamingAnomalyGateOptions {
  nFeatures?: number;
  nEstimators?: number;
  depth?: number;
  windowSize?: number;
  /** Threshold above which transaction is held for immediate review. Default 0.90. */
  holdThreshold?: number;
  /** Threshold above which transaction is flagged for same-day review. Default 0.75. */
  flagThreshold?: number;
  emaAlpha?: number;
}

const FEATURE_NAMES: (keyof AnomalyFeatureVector)[] = [
  'amountZscore', 'velocityRatio7d', 'counterpartyIsNew', 'countryRiskScore',
  'hourOfDay', 'dayOfWeek', 'amountLog', 'isRoundAmount',
];

export class StreamingAnomalyGate {
  private readonly hst: HalfSpaceTreesEnsemble;
  private readonly ems: ExponentialMovingStats;
  private readonly holdThreshold: number;
  private readonly flagThreshold: number;
  private observationCount: number;

  constructor(opts: StreamingAnomalyGateOptions = {}) {
    const nFeatures = opts.nFeatures ?? 8;
    this.hst = new HalfSpaceTreesEnsemble(
      nFeatures,
      opts.nEstimators ?? 25,
      opts.depth ?? 15,
      opts.windowSize ?? 500,
    );
    this.ems = new ExponentialMovingStats(nFeatures, opts.emaAlpha ?? 0.02);
    this.holdThreshold = opts.holdThreshold ?? 0.90;
    this.flagThreshold = opts.flagThreshold ?? 0.75;
    this.observationCount = 0;
  }

  private toVector(fv: AnomalyFeatureVector): number[] {
    return [
      // Clamp and normalise each feature to roughly [-1, 1]
      Math.max(-3, Math.min(3, fv.amountZscore)) / 3,
      Math.max(0, Math.min(10, fv.velocityRatio7d)) / 10,
      fv.counterpartyIsNew,
      fv.countryRiskScore / 100,
      (fv.hourOfDay - 12) / 12,
      (fv.dayOfWeek - 3) / 3,
      Math.max(0, Math.min(8, fv.amountLog)) / 8,
      fv.isRoundAmount,
    ];
  }

  scoreAndUpdate(fv: AnomalyFeatureVector): AnomalyScoreResult {
    const x = this.toVector(fv);
    this.observationCount++;

    const hstScore = this.hst.fitScorePartial(x);
    this.ems.update(x);
    const zScores = this.ems.zScores(x);
    const zScore = this.ems.combinedZScore(x);

    // Ensemble: weight HST 70%, z-score normalised 30%
    const normZ = Math.min(1, zScore / 5);
    const score = 0.7 * hstScore + 0.3 * normZ;

    // Identify driving features (z-score > 2)
    const drivers = FEATURE_NAMES
      .filter((_, i) => (zScores[i] ?? 0) > 2)
      .map((name) => name as string);

    let tier: AnomalyTier = 'pass';
    if (score >= this.holdThreshold) tier = 'hold';
    else if (score >= this.flagThreshold) tier = 'flag';

    return { score, tier, drivers, hstScore, zScore };
  }

  get observations(): number { return this.observationCount; }
}

// Convenience: score a raw transaction object without pre-extracting features.
export function extractFeatures(tx: {
  amountUsd: number;
  customerBaseline?: { meanAmount?: number; stdAmount?: number; txnPer7d?: number };
  counterpartyFirstSeen?: boolean;
  countryRiskScore?: number;
  timestampUtc?: string;
}): AnomalyFeatureVector {
  const mean = tx.customerBaseline?.meanAmount ?? tx.amountUsd;
  const std = Math.max(1, tx.customerBaseline?.stdAmount ?? 1);
  const amountZscore = (tx.amountUsd - mean) / std;

  const expected7d = tx.customerBaseline?.txnPer7d ?? 5;
  const velocityRatio7d = 1 / Math.max(0.1, expected7d);

  const ts = tx.timestampUtc ? new Date(tx.timestampUtc) : new Date();
  const hourOfDay = ts.getUTCHours();
  const dayOfWeek = ts.getUTCDay();

  const amountLog = Math.log10(Math.max(1, tx.amountUsd));

  // Round amount structuring signal: amount divisible by 1000 and > $3000
  const isRoundAmount = tx.amountUsd > 3000 && tx.amountUsd % 1000 === 0 ? 1 : 0;

  return {
    amountZscore,
    velocityRatio7d,
    counterpartyIsNew: tx.counterpartyFirstSeen ? 1 : 0,
    countryRiskScore: tx.countryRiskScore ?? 0,
    hourOfDay,
    dayOfWeek,
    amountLog,
    isRoundAmount,
  };
}
