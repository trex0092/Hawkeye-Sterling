/**
 * ML-Powered Anomaly Detection Engine.
 *
 * Implements statistical and machine-learning-inspired anomaly detection
 * for financial transactions WITHOUT external ML libraries. Uses pure
 * algorithmic approaches that approximate ML behavior:
 *
 * 1. ISOLATION FOREST (simplified)
 *    Anomaly scoring based on how quickly a data point can be isolated
 *    from the rest of the dataset via random splits.
 *
 * 2. Z-SCORE ANOMALY DETECTION
 *    Flags transactions whose features deviate significantly from the
 *    population mean (beyond 2-3 standard deviations).
 *
 * 3. LOCAL OUTLIER FACTOR (LOF)
 *    Compares the local density of a point to its neighbors to detect
 *    outliers in multi-dimensional feature space.
 *
 * 4. AUTOENCODER-STYLE RECONSTRUCTION ERROR
 *    Learns a compact representation of "normal" transactions and flags
 *    those that differ significantly from the learned pattern.
 *
 * 5. BEHAVIORAL PROFILING
 *    Builds per-entity behavioral baselines and detects deviations from
 *    established patterns (amount, frequency, counterparties, timing).
 *
 * 6. ENSEMBLE SCORING
 *    Combines all detectors into a single anomaly score (0-1) with
 *    configurable weights per method.
 *
 * Zero dependencies. Pure mathematical implementations.
 *
 * References:
 *   - FATF Guidance on AML/CFT and Financial Inclusion (2017)
 *   - Isolation Forest: Liu et al., ICDM 2008
 *   - LOF: Breunig et al., SIGMOD 2000
 */

// ── Statistical Helpers ────────────────────────────────────────

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const frac = idx - lower;
  return sorted[lower] + frac * ((sorted[lower + 1] || sorted[lower]) - sorted[lower]);
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function normalize(val, min, max) {
  return max > min ? (val - min) / (max - min) : 0;
}

// ── Feature Extraction ─────────────────────────────────────────

/**
 * Extract numerical feature vector from a transaction.
 * Features: [amount, hour_of_day, day_of_week, is_cash, is_cross_border,
 *            amount_log, counterparty_count]
 */
function extractFeatures(tx, entityProfile = null) {
  const date = tx._date || new Date(tx.date);
  const hour = date instanceof Date ? date.getHours() : 12;
  const dow = date instanceof Date ? date.getDay() : 3;
  const amount = Number(tx.amount) || 0;
  const isCash = tx.method === 'cash' ? 1 : 0;
  const isCrossBorder = tx.is_cross_border ? 1 : 0;
  const amountLog = amount > 0 ? Math.log10(amount) : 0;

  const features = [
    amount,
    hour / 24,                    // normalized hour
    dow / 7,                      // normalized day
    isCash,
    isCrossBorder,
    amountLog / 8,                // normalize log amount (max ~8 for 100M)
  ];

  // Add profile-relative features if available
  if (entityProfile) {
    const expectedMonthly = entityProfile.expectedMonthlyVolume || 100000;
    features.push(amount / expectedMonthly);  // Ratio to expected volume
  }

  return features;
}

// ── Detector 1: Simplified Isolation Forest ────────────────────

/**
 * Isolation Forest anomaly detection.
 *
 * The principle: anomalies are "few and different", so they get
 * isolated in fewer splits than normal points. We approximate this
 * by measuring how far each point is from the median on multiple
 * random feature projections.
 */
function isolationForestScore(features, allFeatures, numTrees = 50) {
  if (allFeatures.length < 10) return 0.5;

  const dims = features.length;
  let totalPathLength = 0;

  for (let t = 0; t < numTrees; t++) {
    // Random feature dimension
    const dim = Math.floor(pseudoRandom(t * 31 + 7) * dims);
    const values = allFeatures.map(f => f[dim]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    if (maxVal === minVal) continue;

    // Count how many splits needed to isolate this point
    let lo = minVal, hi = maxVal;
    let pathLength = 0;
    const target = features[dim];

    while (pathLength < 20 && (hi - lo) > 0.001) {
      const split = lo + pseudoRandom(t * 17 + pathLength * 13) * (hi - lo);
      if (target <= split) hi = split;
      else lo = split;
      pathLength++;

      // Count remaining points in this partition
      const remaining = allFeatures.filter(f => f[dim] >= lo && f[dim] <= hi).length;
      if (remaining <= 1) break;
    }

    totalPathLength += pathLength;
  }

  const avgPath = totalPathLength / numTrees;
  const expectedPath = 2 * (Math.log(allFeatures.length) + 0.5772156649) - 2;

  // Score: shorter path = more anomalous
  return Math.min(1, Math.max(0, 1 - avgPath / Math.max(expectedPath, 1)));
}

// Deterministic pseudo-random for reproducibility
function pseudoRandom(seed) {
  let x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ── Detector 2: Z-Score Anomaly Detection ──────────────────────

/**
 * Z-score based anomaly detection across all feature dimensions.
 * Returns max absolute z-score across features.
 */
function zScoreAnomaly(features, allFeatures) {
  if (allFeatures.length < 5) return 0;

  let maxZ = 0;
  for (let d = 0; d < features.length; d++) {
    const values = allFeatures.map(f => f[d]);
    const m = mean(values);
    const s = stdDev(values);
    if (s === 0) continue;
    const z = Math.abs((features[d] - m) / s);
    if (z > maxZ) maxZ = z;
  }

  // Convert z-score to 0-1 anomaly score
  // z >= 3 -> score ~1, z <= 1 -> score ~0
  return Math.min(1, Math.max(0, (maxZ - 1) / 3));
}

// ── Detector 3: Local Outlier Factor (LOF) ─────────────────────

/**
 * Simplified LOF: compares local density to k-nearest neighbors.
 */
function localOutlierFactor(features, allFeatures, k = 5) {
  if (allFeatures.length < k + 1) return 0;

  // Find k nearest neighbors
  const distances = allFeatures
    .map((f, i) => ({ idx: i, dist: euclidean(features, f) }))
    .filter(d => d.dist > 0) // exclude self
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);

  if (distances.length === 0) return 0;

  const avgDist = mean(distances.map(d => d.dist));

  // Calculate average neighbor density
  const neighborDensities = distances.map(d => {
    const neighborFeatures = allFeatures[d.idx];
    const neighborDists = allFeatures
      .map((f, j) => j !== d.idx ? euclidean(neighborFeatures, f) : Infinity)
      .sort((a, b) => a - b)
      .slice(0, k);
    return mean(neighborDists);
  });

  const avgNeighborDensity = mean(neighborDensities);
  if (avgNeighborDensity === 0) return 0;

  // LOF ratio: > 1 means point is in sparser region than neighbors
  const lof = avgDist / avgNeighborDensity;
  return Math.min(1, Math.max(0, (lof - 1) / 2));
}

// ── Detector 4: Reconstruction Error (Autoencoder-style) ───────

/**
 * Approximates autoencoder behavior using PCA-style reconstruction.
 * Compresses features to fewer dimensions and measures reconstruction error.
 */
function reconstructionError(features, allFeatures) {
  if (allFeatures.length < 5) return 0;

  // Compute mean and project onto principal directions (simplified)
  const dims = features.length;
  const means = [];
  const stds = [];

  for (let d = 0; d < dims; d++) {
    const vals = allFeatures.map(f => f[d]);
    means.push(mean(vals));
    stds.push(stdDev(vals) || 1);
  }

  // Standardize
  const standardized = features.map((v, d) => (v - means[d]) / stds[d]);

  // "Reconstruct" by clamping to mean ± 1 std (simplified autoencoder)
  const reconstructed = standardized.map(v => Math.max(-1, Math.min(1, v)));

  // Reconstruction error
  let error = 0;
  for (let d = 0; d < dims; d++) {
    error += (standardized[d] - reconstructed[d]) ** 2;
  }
  error = Math.sqrt(error / dims);

  return Math.min(1, error / 3);
}

// ── Detector 5: Behavioral Profiling ───────────────────────────

/**
 * Builds a behavioral baseline for an entity and scores deviation.
 */
function behavioralDeviation(tx, entityHistory) {
  if (!entityHistory || entityHistory.length < 5) return 0;

  const deviations = [];
  const amount = Number(tx.amount) || 0;

  // Amount deviation
  const amounts = entityHistory.map(t => Number(t.amount) || 0);
  const amtMean = mean(amounts);
  const amtStd = stdDev(amounts);
  if (amtStd > 0) {
    deviations.push(Math.abs(amount - amtMean) / amtStd);
  }

  // Frequency deviation (inter-transaction gap)
  const dates = entityHistory
    .map(t => new Date(t.date).getTime())
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);
  if (dates.length >= 2) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(dates[i] - dates[i - 1]);
    const gapMean = mean(gaps);
    const gapStd = stdDev(gaps);
    const lastGap = Date.now() - dates[dates.length - 1];
    if (gapStd > 0) {
      deviations.push(Math.abs(lastGap - gapMean) / gapStd);
    }
  }

  // Counterparty novelty
  const knownCounterparties = new Set(entityHistory.map(t => t.to || t.from));
  const counterparty = tx.to || tx.from;
  if (counterparty && !knownCounterparties.has(counterparty)) {
    deviations.push(2.0); // Novel counterparty = 2 sigma equivalent
  }

  // Method deviation
  const methodCounts = {};
  for (const t of entityHistory) methodCounts[t.method || 'unknown'] = (methodCounts[t.method || 'unknown'] || 0) + 1;
  const totalMethods = entityHistory.length;
  const txMethod = tx.method || 'unknown';
  const methodFreq = (methodCounts[txMethod] || 0) / totalMethods;
  if (methodFreq < 0.1) deviations.push(2.5); // Rare method

  // Average z-score across all behavioral dimensions
  const maxDev = deviations.length > 0 ? Math.max(...deviations) : 0;
  return Math.min(1, Math.max(0, (maxDev - 1) / 3));
}

// ── Ensemble Scorer ────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  isolationForest: 0.25,
  zScore: 0.20,
  lof: 0.20,
  reconstruction: 0.15,
  behavioral: 0.20,
};

/**
 * Score a single transaction using the ML anomaly detection ensemble.
 *
 * @param {object} tx - Transaction to score
 * @param {Array} historicalTxs - Historical transactions for context
 * @param {object} [opts]
 * @param {object} [opts.entityProfile] - Entity business profile
 * @param {Array} [opts.entityHistory] - Transaction history for this entity
 * @param {object} [opts.weights] - Custom detector weights
 * @returns {AnomalyScore}
 */
export function scoreTransaction(tx, historicalTxs, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const features = extractFeatures(tx, opts.entityProfile);
  const allFeatures = historicalTxs.map(t => extractFeatures(t, opts.entityProfile));

  // Run all detectors
  const scores = {
    isolationForest: isolationForestScore(features, allFeatures),
    zScore: zScoreAnomaly(features, allFeatures),
    lof: localOutlierFactor(features, allFeatures),
    reconstruction: reconstructionError(features, allFeatures),
    behavioral: behavioralDeviation(tx, opts.entityHistory || []),
  };

  // Weighted ensemble
  let ensemble = 0;
  let totalWeight = 0;
  for (const [method, score] of Object.entries(scores)) {
    ensemble += score * (weights[method] || 0);
    totalWeight += weights[method] || 0;
  }
  ensemble = totalWeight > 0 ? ensemble / totalWeight : 0;

  // Classify
  let severity, recommendation;
  if (ensemble >= 0.8) {
    severity = 'CRITICAL';
    recommendation = 'IMMEDIATE: Block transaction. File STR. Escalate to MLRO within 24h.';
  } else if (ensemble >= 0.6) {
    severity = 'HIGH';
    recommendation = 'ESCALATE: Enhanced review required. Gather additional evidence.';
  } else if (ensemble >= 0.4) {
    severity = 'MEDIUM';
    recommendation = 'REVIEW: Analyst review within 3 business days.';
  } else if (ensemble >= 0.2) {
    severity = 'LOW';
    recommendation = 'MONITOR: Add to enhanced monitoring. Review at next CDD cycle.';
  } else {
    severity = 'NORMAL';
    recommendation = 'No action required. Transaction within expected parameters.';
  }

  return {
    transactionId: tx.id,
    entity: tx.from || tx.to,
    amount: Number(tx.amount) || 0,
    anomalyScore: Math.round(ensemble * 10000) / 10000,
    severity,
    recommendation,
    detectorScores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
    ),
    featureCount: features.length,
    contextSize: allFeatures.length,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Batch score transactions and return ranked anomalies.
 *
 * @param {Array} transactions - All transactions to analyze
 * @param {object} [opts]
 * @param {object} [opts.entityProfiles] - Map of entity -> profile
 * @param {number} [opts.topN] - Return top N anomalies (default: 50)
 * @returns {{ anomalies: AnomalyScore[], stats: object }}
 */
export function detectAnomalies(transactions, opts = {}) {
  if (!transactions || transactions.length === 0) {
    return { anomalies: [], stats: { total: 0, analyzed: 0 } };
  }

  const topN = opts.topN || 50;
  const profiles = opts.entityProfiles || {};

  // Build entity history maps
  const entityHistories = {};
  for (const tx of transactions) {
    const entity = tx.from || tx.to;
    if (!entityHistories[entity]) entityHistories[entity] = [];
    entityHistories[entity].push(tx);
  }

  // Score each transaction
  const scored = [];
  for (const tx of transactions) {
    const entity = tx.from || tx.to;
    const result = scoreTransaction(tx, transactions, {
      entityProfile: profiles[entity],
      entityHistory: entityHistories[entity] || [],
      weights: opts.weights,
    });
    scored.push(result);
  }

  // Sort by anomaly score descending
  scored.sort((a, b) => b.anomalyScore - a.anomalyScore);

  // Statistics
  const anomalyScores = scored.map(s => s.anomalyScore);
  const stats = {
    total: transactions.length,
    analyzed: scored.length,
    meanAnomalyScore: Math.round(mean(anomalyScores) * 10000) / 10000,
    medianAnomalyScore: Math.round(median(anomalyScores) * 10000) / 10000,
    p95AnomalyScore: Math.round(percentile(anomalyScores, 95) * 10000) / 10000,
    p99AnomalyScore: Math.round(percentile(anomalyScores, 99) * 10000) / 10000,
    distribution: {
      critical: scored.filter(s => s.severity === 'CRITICAL').length,
      high: scored.filter(s => s.severity === 'HIGH').length,
      medium: scored.filter(s => s.severity === 'MEDIUM').length,
      low: scored.filter(s => s.severity === 'LOW').length,
      normal: scored.filter(s => s.severity === 'NORMAL').length,
    },
    topEntities: getTopAnomalousEntities(scored, 10),
  };

  return {
    anomalies: scored.slice(0, topN),
    stats,
    analyzedAt: new Date().toISOString(),
    methodology: {
      detectors: Object.keys(DEFAULT_WEIGHTS),
      weights: DEFAULT_WEIGHTS,
      featureDimensions: 6,
      reference: 'Isolation Forest (Liu 2008) | LOF (Breunig 2000) | Z-Score | Behavioral Profiling',
    },
  };
}

function getTopAnomalousEntities(scored, limit) {
  const entityScores = {};
  for (const s of scored) {
    if (!entityScores[s.entity]) {
      entityScores[s.entity] = { maxScore: 0, totalScore: 0, count: 0, criticalCount: 0 };
    }
    entityScores[s.entity].maxScore = Math.max(entityScores[s.entity].maxScore, s.anomalyScore);
    entityScores[s.entity].totalScore += s.anomalyScore;
    entityScores[s.entity].count++;
    if (s.severity === 'CRITICAL') entityScores[s.entity].criticalCount++;
  }

  return Object.entries(entityScores)
    .map(([entity, data]) => ({
      entity,
      maxAnomalyScore: data.maxScore,
      avgAnomalyScore: Math.round((data.totalScore / data.count) * 10000) / 10000,
      transactionCount: data.count,
      criticalCount: data.criticalCount,
    }))
    .sort((a, b) => b.maxAnomalyScore - a.maxAnomalyScore)
    .slice(0, limit);
}

/**
 * Train behavioral baselines from historical data.
 * Returns per-entity baselines for ongoing monitoring.
 *
 * @param {Array} transactions - Historical transactions
 * @returns {Map<string, EntityBaseline>}
 */
export function trainBaselines(transactions) {
  const baselines = new Map();
  const byEntity = {};

  for (const tx of transactions) {
    const entity = tx.from || tx.to;
    if (!entity) continue;
    if (!byEntity[entity]) byEntity[entity] = [];
    byEntity[entity].push(tx);
  }

  for (const [entity, txs] of Object.entries(byEntity)) {
    if (txs.length < 3) continue;

    const amounts = txs.map(t => Number(t.amount) || 0);
    const methods = {};
    const counterparties = new Set();
    const hours = txs.map(t => {
      const d = new Date(t.date);
      return isNaN(d.getTime()) ? 12 : d.getHours();
    });

    for (const t of txs) {
      const m = t.method || 'unknown';
      methods[m] = (methods[m] || 0) + 1;
      if (t.to && t.to !== entity) counterparties.add(t.to);
      if (t.from && t.from !== entity) counterparties.add(t.from);
    }

    baselines.set(entity, {
      entity,
      transactionCount: txs.length,
      amount: {
        mean: Math.round(mean(amounts)),
        std: Math.round(stdDev(amounts)),
        median: Math.round(median(amounts)),
        p95: Math.round(percentile(amounts, 95)),
        min: Math.min(...amounts),
        max: Math.max(...amounts),
      },
      frequency: {
        avgPerMonth: txs.length, // Simplified
      },
      methods: Object.fromEntries(
        Object.entries(methods).map(([k, v]) => [k, Math.round((v / txs.length) * 100)])
      ),
      counterparties: {
        unique: counterparties.size,
        known: [...counterparties],
      },
      timing: {
        peakHour: Math.round(mean(hours)),
        hourStd: Math.round(stdDev(hours)),
      },
      trainedAt: new Date().toISOString(),
      sampleSize: txs.length,
    });
  }

  return baselines;
}

export { DEFAULT_WEIGHTS, extractFeatures };
