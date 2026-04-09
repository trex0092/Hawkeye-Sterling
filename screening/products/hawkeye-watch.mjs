/**
 * HAWKEYE WATCH — Transaction Monitoring + Typology Detection.
 *
 * Real-time and batch transaction monitoring with ML-powered anomaly
 * detection, rule-based pattern recognition, and FATF typology screening.
 *
 * Capabilities:
 *   - 8 AML pattern detectors (structuring, layering, round-tripping,
 *     smurfing, velocity, dormancy, threshold evasion, profile mismatch)
 *   - ML anomaly detection ensemble (isolation forest, z-score, LOF,
 *     reconstruction error, behavioral profiling)
 *   - 6 FATF typology detectors (TBML, carousel, TF, PF, layered cash,
 *     gold-for-drugs)
 *   - Network intelligence (hidden networks, clusters, anomaly scoring)
 *   - Real-time streaming pipeline with sliding window aggregations
 *   - Behavioral baseline training from historical data
 *   - Compliance grading system (A+ to F)
 *
 * License tier: WATCH (add-on)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export class HawkeyeWatch {
  constructor(opts = {}) {
    this.opts = opts;
  }

  /** Run all 8 AML pattern detectors on transactions. */
  async analyzeTransactions(transactions, opts = {}) {
    const { analyzeTransactions } = await import(
      resolve(ROOT, 'screening', 'analysis', 'transaction-patterns.mjs')
    );
    return analyzeTransactions(transactions, opts);
  }

  /** ML anomaly detection on transactions. */
  async detectAnomalies(transactions, opts = {}) {
    const { detectAnomalies } = await import(
      resolve(ROOT, 'screening', 'analysis', 'ml-anomaly.mjs')
    );
    return detectAnomalies(transactions, opts);
  }

  /** Score a single transaction for anomalies. */
  async scoreTransaction(tx, historicalTxs, opts = {}) {
    const { scoreTransaction } = await import(
      resolve(ROOT, 'screening', 'analysis', 'ml-anomaly.mjs')
    );
    return scoreTransaction(tx, historicalTxs, opts);
  }

  /** Train behavioral baselines from historical data. */
  async trainBaselines(transactions) {
    const { trainBaselines } = await import(
      resolve(ROOT, 'screening', 'analysis', 'ml-anomaly.mjs')
    );
    return trainBaselines(transactions);
  }

  /** Screen against FATF typologies. */
  async screenTypologies(context) {
    const { screenTypologies } = await import(
      resolve(ROOT, 'screening', 'analysis', 'typology-engine.mjs')
    );
    return screenTypologies(context);
  }

  /** Network intelligence analysis. */
  async analyzeNetwork(params) {
    const { analyzeNetwork } = await import(
      resolve(ROOT, 'screening', 'analysis', 'network-intel.mjs')
    );
    return analyzeNetwork(params);
  }

  /** Calculate quantitative risk score. */
  async calculateRisk(params) {
    const { calculateRisk } = await import(
      resolve(ROOT, 'screening', 'analysis', 'risk-scoring.mjs')
    );
    return calculateRisk(params);
  }

  /** Compliance grade scorecard. */
  async complianceGrade(metrics) {
    const { calculateComplianceGrade, formatScorecard } = await import(
      resolve(ROOT, 'screening', 'analysis', 'compliance-grade.mjs')
    );
    const grade = calculateComplianceGrade(metrics);
    return { ...grade, formatted: formatScorecard(grade) };
  }

  static get product() {
    return {
      id: 'hawkeye-watch',
      name: 'Hawkeye Watch',
      tagline: 'ML-powered transaction monitoring with FATF typology detection',
      version: '2.0.0',
      tier: 'addon',
      requires: ['hawkeye-screen'],
    };
  }
}
