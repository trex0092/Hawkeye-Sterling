/**
 * Real-Time Transaction Monitoring Pipeline.
 *
 * Implements an event-driven processing pipeline for transaction monitoring:
 *
 *   INGEST -> ENRICH -> DETECT -> SCORE -> ALERT -> RECORD
 *
 * Transactions flow through the pipeline stages sequentially. Each stage
 * can augment the transaction envelope with additional data. High-risk
 * transactions generate alerts that are emitted to registered listeners.
 *
 * Sliding-window aggregations maintain per-entity cumulative amounts and
 * velocity metrics across configurable time windows (1h, 24h, 7d, 30d).
 * Per-corridor flow volumes track cross-jurisdiction patterns.
 *
 * All state is held in memory. No external database required.
 *
 * References: Federal Decree-Law No. 10/2025 (transaction monitoring obligations).
 */

import { EventEmitter } from 'node:events';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Pipeline stages in processing order. */
export const STAGES = Object.freeze([
  'INGEST',
  'ENRICH',
  'DETECT',
  'SCORE',
  'ALERT',
  'RECORD',
]);

/** Default sliding window durations in milliseconds. */
export const DEFAULT_WINDOWS = Object.freeze({
  '1h':  1   * 3600_000,
  '24h': 24  * 3600_000,
  '7d':  7   * 24 * 3600_000,
  '30d': 30  * 24 * 3600_000,
});

/** Default thresholds per window (AED amounts). */
export const DEFAULT_THRESHOLDS = Object.freeze({
  '1h':  55_000,
  '24h': 200_000,
  '7d':  500_000,
  '30d': 1_000_000,
});

/** Default velocity thresholds (transaction count per window). */
export const DEFAULT_VELOCITY_THRESHOLDS = Object.freeze({
  '1h':  5,
  '24h': 15,
  '7d':  40,
  '30d': 100,
});

/** Risk score thresholds. */
export const RISK_LEVELS = Object.freeze({
  LOW:      { min: 0,  max: 30  },
  MEDIUM:   { min: 31, max: 60  },
  HIGH:     { min: 61, max: 80  },
  CRITICAL: { min: 81, max: 100 },
});

/** Maximum queue depth before backpressure kicks in. */
const DEFAULT_MAX_QUEUE = 10_000;

/* ------------------------------------------------------------------ */
/*  StreamProcessor                                                    */
/* ------------------------------------------------------------------ */

export class StreamProcessor extends EventEmitter {
  /**
   * @param {object} [config]
   * @param {object} [config.thresholds]          - Amount thresholds per window
   * @param {object} [config.velocityThresholds]  - Count thresholds per window
   * @param {number} [config.alertScoreThreshold] - Minimum score to generate alert (default: 61)
   * @param {number} [config.maxQueue]            - Maximum queue depth (default: 10000)
   * @param {Function[]} [config.enrichers]       - Custom enricher functions
   * @param {Function[]} [config.detectors]       - Custom detector functions
   */
  constructor(config = {}) {
    super();

    /** @type {object} Amount thresholds per sliding window */
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };

    /** @type {object} Velocity thresholds per sliding window */
    this.velocityThresholds = { ...DEFAULT_VELOCITY_THRESHOLDS, ...config.velocityThresholds };

    /** @type {number} Minimum composite score to generate an alert */
    this.alertScoreThreshold = config.alertScoreThreshold ?? 61;

    /** @type {number} Maximum backpressure queue depth */
    this.maxQueue = config.maxQueue ?? DEFAULT_MAX_QUEUE;

    /** @type {Function[]} Custom enricher functions */
    this._enrichers = Array.isArray(config.enrichers) ? [...config.enrichers] : [];

    /** @type {Function[]} Custom detector functions */
    this._detectors = Array.isArray(config.detectors) ? [...config.detectors] : [];

    /* ---- Internal state ---- */

    /**
     * Per-entity sliding window data.
     * Map<entityId, { transactions: Array<{ amount, timestamp }> }>
     * @private
     */
    this._entityWindows = new Map();

    /**
     * Per-corridor (originJurisdiction->destJurisdiction) flow tracking.
     * Map<corridorKey, Array<{ amount, timestamp }>>
     * @private
     */
    this._corridorWindows = new Map();

    /**
     * Backpressure queue for transactions waiting to be processed.
     * @private
     */
    this._queue = [];

    /**
     * Whether the pipeline is currently processing.
     * @private
     */
    this._processing = false;

    /**
     * Audit trail of processed transactions.
     * @private
     */
    this._auditTrail = [];

    /**
     * Generated alerts.
     * @private
     */
    this._alerts = [];

    /* ---- Metrics ---- */
    this._metrics = {
      totalIngested: 0,
      totalProcessed: 0,
      totalAlerts: 0,
      totalErrors: 0,
      processingStartTime: null,
      lastProcessedAt: null,
      totalLatencyMs: 0,
    };
  }

  /* ================================================================ */
  /*  Public API                                                       */
  /* ================================================================ */

  /**
   * Push a single transaction event into the pipeline.
   *
   * @param {object} tx
   * @param {string} tx.id               - Unique transaction identifier
   * @param {string} tx.entityId         - Entity performing the transaction
   * @param {string} [tx.entityName]     - Entity display name
   * @param {number} tx.amount           - Transaction amount (AED)
   * @param {string} tx.currency         - Original currency code
   * @param {string} [tx.originJurisdiction]  - Originating country (ISO 3166 alpha-2)
   * @param {string} [tx.destJurisdiction]    - Destination country (ISO 3166 alpha-2)
   * @param {string} [tx.type]           - Transaction type (purchase, sale, transfer, etc.)
   * @param {string} [tx.timestamp]      - ISO timestamp (defaults to now)
   * @param {object} [tx.metadata]       - Additional data
   * @returns {boolean} true if accepted, false if rejected (backpressure)
   */
  push(tx) {
    if (!tx || !tx.id || !tx.entityId || tx.amount === undefined) {
      throw new Error('Transaction must include id, entityId, and amount');
    }

    this._metrics.totalIngested++;

    /* Normalize */
    const envelope = {
      raw: { ...tx },
      id: tx.id,
      entityId: tx.entityId,
      entityName: tx.entityName || null,
      amount: Number(tx.amount),
      currency: tx.currency || 'AED',
      originJurisdiction: tx.originJurisdiction || null,
      destJurisdiction: tx.destJurisdiction || null,
      type: tx.type || 'unknown',
      timestamp: tx.timestamp || new Date().toISOString(),
      metadata: tx.metadata || {},

      /* Pipeline annotations */
      _stage: 'INGEST',
      _ingestedAt: Date.now(),
      _enrichments: {},
      _detections: [],
      _score: 0,
      _riskLevel: 'LOW',
      _alert: null,
    };

    /* Backpressure check */
    if (this._queue.length >= this.maxQueue) {
      this.emit('backpressure', {
        queueDepth: this._queue.length,
        maxQueue: this.maxQueue,
        droppedTxId: envelope.id,
      });
      return false;
    }

    this._queue.push(envelope);
    this._drainQueue();
    return true;
  }

  /**
   * Push a batch of transaction events.
   *
   * @param {object[]} transactions - Array of transaction objects
   * @returns {{ accepted: number, rejected: number }}
   */
  pushBatch(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('transactions must be an array');
    }

    let accepted = 0;
    let rejected = 0;

    for (const tx of transactions) {
      if (this.push(tx)) {
        accepted++;
      } else {
        rejected++;
      }
    }

    return { accepted, rejected };
  }

  /**
   * Register a custom enricher function.
   * Enrichers receive (envelope) and may mutate envelope._enrichments.
   *
   * @param {Function} fn - async (envelope) => void
   */
  addEnricher(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Enricher must be a function');
    }
    this._enrichers.push(fn);
  }

  /**
   * Register a custom detector function.
   * Detectors receive (envelope, windowData) and return
   * { detected: boolean, typology: string, confidence: number, details: string }
   * or null.
   *
   * @param {Function} fn - async (envelope, windowData) => detection|null
   */
  addDetector(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Detector must be a function');
    }
    this._detectors.push(fn);
  }

  /**
   * Retrieve all alerts generated by the pipeline.
   *
   * @returns {object[]}
   */
  getAlerts() {
    return [...this._alerts];
  }

  /**
   * Retrieve the full audit trail.
   *
   * @returns {object[]}
   */
  getAuditTrail() {
    return [...this._auditTrail];
  }

  /**
   * Get pipeline statistics.
   *
   * @returns {object} Throughput, latency, queue depth, and alert metrics
   */
  getStatistics() {
    const now = Date.now();
    const uptimeMs = this._metrics.processingStartTime
      ? now - this._metrics.processingStartTime
      : 0;
    const uptimeSec = uptimeMs / 1000 || 1;

    return {
      totalIngested: this._metrics.totalIngested,
      totalProcessed: this._metrics.totalProcessed,
      totalAlerts: this._metrics.totalAlerts,
      totalErrors: this._metrics.totalErrors,
      queueDepth: this._queue.length,
      throughputPerSec: Math.round((this._metrics.totalProcessed / uptimeSec) * 100) / 100,
      avgLatencyMs: this._metrics.totalProcessed > 0
        ? Math.round(this._metrics.totalLatencyMs / this._metrics.totalProcessed)
        : 0,
      alertRate: this._metrics.totalProcessed > 0
        ? Math.round((this._metrics.totalAlerts / this._metrics.totalProcessed) * 10000) / 100
        : 0,
      activeEntities: this._entityWindows.size,
      activeCorridors: this._corridorWindows.size,
      uptimeMs,
    };
  }

  /**
   * Get sliding window aggregation data for a specific entity.
   *
   * @param {string} entityId
   * @returns {object|null} Window aggregation or null if entity unknown
   */
  getEntityWindow(entityId) {
    const data = this._entityWindows.get(entityId);
    if (!data) return null;

    const now = Date.now();
    const result = { entityId, windows: {} };

    for (const [label, durationMs] of Object.entries(DEFAULT_WINDOWS)) {
      const cutoff = now - durationMs;
      const recent = data.transactions.filter(t => t.timestamp >= cutoff);
      result.windows[label] = {
        totalAmount: recent.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: recent.length,
        amountThreshold: this.thresholds[label] || 0,
        velocityThreshold: this.velocityThresholds[label] || 0,
        amountBreached: recent.reduce((sum, t) => sum + t.amount, 0) >= (this.thresholds[label] || Infinity),
        velocityBreached: recent.length >= (this.velocityThresholds[label] || Infinity),
      };
    }

    return result;
  }

  /**
   * Get corridor flow data for a specific jurisdiction pair.
   *
   * @param {string} origin - Origin jurisdiction code
   * @param {string} dest   - Destination jurisdiction code
   * @returns {object|null}
   */
  getCorridorWindow(origin, dest) {
    const key = `${origin}->${dest}`;
    const data = this._corridorWindows.get(key);
    if (!data) return null;

    const now = Date.now();
    const result = { corridor: key, windows: {} };

    for (const [label, durationMs] of Object.entries(DEFAULT_WINDOWS)) {
      const cutoff = now - durationMs;
      const recent = data.filter(t => t.timestamp >= cutoff);
      result.windows[label] = {
        totalAmount: recent.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: recent.length,
      };
    }

    return result;
  }

  /**
   * Purge window data older than the maximum window duration.
   * Call periodically to prevent unbounded memory growth.
   */
  purgeStaleWindows() {
    const cutoff = Date.now() - DEFAULT_WINDOWS['30d'];
    let purgedEntities = 0;
    let purgedCorridors = 0;

    for (const [entityId, data] of this._entityWindows) {
      const before = data.transactions.length;
      data.transactions = data.transactions.filter(t => t.timestamp >= cutoff);
      purgedEntities += before - data.transactions.length;
      if (data.transactions.length === 0) {
        this._entityWindows.delete(entityId);
      }
    }

    for (const [key, txns] of this._corridorWindows) {
      const before = txns.length;
      const filtered = txns.filter(t => t.timestamp >= cutoff);
      purgedCorridors += before - filtered.length;
      if (filtered.length === 0) {
        this._corridorWindows.delete(key);
      } else {
        this._corridorWindows.set(key, filtered);
      }
    }

    return { purgedEntities, purgedCorridors };
  }

  /* ================================================================ */
  /*  Pipeline internals                                               */
  /* ================================================================ */

  /**
   * Drain the processing queue. Implements sequential processing
   * with re-entrant safety.
   * @private
   */
  async _drainQueue() {
    if (this._processing) return;
    this._processing = true;

    if (!this._metrics.processingStartTime) {
      this._metrics.processingStartTime = Date.now();
    }

    while (this._queue.length > 0) {
      const envelope = this._queue.shift();
      try {
        await this._processEnvelope(envelope);
        this._metrics.totalProcessed++;
        this._metrics.lastProcessedAt = Date.now();
        this._metrics.totalLatencyMs += Date.now() - envelope._ingestedAt;
      } catch (err) {
        this._metrics.totalErrors++;
        this.emit('error', {
          txId: envelope.id,
          stage: envelope._stage,
          error: err.message,
        });
      }
    }

    this._processing = false;
  }

  /**
   * Process a single transaction envelope through all pipeline stages.
   * @private
   * @param {object} envelope
   */
  async _processEnvelope(envelope) {
    /* Stage 1: INGEST (already done during push) */

    /* Stage 2: ENRICH */
    envelope._stage = 'ENRICH';
    await this._stageEnrich(envelope);
    this.emit('enriched', { id: envelope.id, enrichments: envelope._enrichments });

    /* Stage 3: DETECT */
    envelope._stage = 'DETECT';
    await this._stageDetect(envelope);

    /* Stage 4: SCORE */
    envelope._stage = 'SCORE';
    this._stageScore(envelope);

    /* Stage 5: ALERT */
    envelope._stage = 'ALERT';
    this._stageAlert(envelope);

    /* Stage 6: RECORD */
    envelope._stage = 'RECORD';
    this._stageRecord(envelope);

    this.emit('processed', {
      id: envelope.id,
      score: envelope._score,
      riskLevel: envelope._riskLevel,
      alert: envelope._alert !== null,
    });
  }

  /**
   * ENRICH stage: augment the envelope with aggregation data and custom enrichments.
   * @private
   */
  async _stageEnrich(envelope) {
    const ts = new Date(envelope.timestamp).getTime();

    /* Update entity window */
    if (!this._entityWindows.has(envelope.entityId)) {
      this._entityWindows.set(envelope.entityId, { transactions: [] });
    }
    const entityData = this._entityWindows.get(envelope.entityId);
    entityData.transactions.push({ amount: envelope.amount, timestamp: ts });

    /* Update corridor window */
    if (envelope.originJurisdiction && envelope.destJurisdiction) {
      const corridorKey = `${envelope.originJurisdiction}->${envelope.destJurisdiction}`;
      if (!this._corridorWindows.has(corridorKey)) {
        this._corridorWindows.set(corridorKey, []);
      }
      this._corridorWindows.get(corridorKey).push({ amount: envelope.amount, timestamp: ts });
    }

    /* Compute window aggregations */
    const now = ts;
    const windowAgg = {};
    for (const [label, durationMs] of Object.entries(DEFAULT_WINDOWS)) {
      const cutoff = now - durationMs;
      const recent = entityData.transactions.filter(t => t.timestamp >= cutoff);
      windowAgg[label] = {
        totalAmount: recent.reduce((sum, t) => sum + t.amount, 0),
        count: recent.length,
      };
    }
    envelope._enrichments.windows = windowAgg;

    /* Run custom enrichers */
    for (const enricher of this._enrichers) {
      await enricher(envelope);
    }
  }

  /**
   * DETECT stage: run built-in and custom detectors.
   * @private
   */
  async _stageDetect(envelope) {
    const windows = envelope._enrichments.windows || {};

    /* Built-in detector: amount threshold breach */
    for (const [label, agg] of Object.entries(windows)) {
      const threshold = this.thresholds[label];
      if (threshold !== undefined && agg.totalAmount >= threshold) {
        envelope._detections.push({
          detector: 'amount_threshold',
          typology: 'CUMULATIVE_AMOUNT_BREACH',
          window: label,
          confidence: 0.8,
          details: `Entity ${envelope.entityId} cumulative amount ${agg.totalAmount} ` +
                   `exceeds ${label} threshold of ${threshold}`,
        });
      }
    }

    /* Built-in detector: velocity threshold breach */
    for (const [label, agg] of Object.entries(windows)) {
      const threshold = this.velocityThresholds[label];
      if (threshold !== undefined && agg.count >= threshold) {
        envelope._detections.push({
          detector: 'velocity_threshold',
          typology: 'VELOCITY_BREACH',
          window: label,
          confidence: 0.7,
          details: `Entity ${envelope.entityId} transaction count ${agg.count} ` +
                   `exceeds ${label} velocity threshold of ${threshold}`,
        });
      }
    }

    /* Built-in detector: structuring (multiple just-under-threshold amounts) */
    const w24h = windows['24h'];
    if (w24h && w24h.count >= 3) {
      const entityData = this._entityWindows.get(envelope.entityId);
      const cutoff24h = new Date(envelope.timestamp).getTime() - DEFAULT_WINDOWS['24h'];
      const recentTxns = entityData.transactions.filter(t => t.timestamp >= cutoff24h);
      const justUnder = recentTxns.filter(t =>
        t.amount >= (this.thresholds['24h'] * 0.4) &&
        t.amount < (this.thresholds['24h'] * 0.6)
      );
      if (justUnder.length >= 3) {
        envelope._detections.push({
          detector: 'structuring',
          typology: 'STRUCTURING',
          window: '24h',
          confidence: 0.75,
          details: `Entity ${envelope.entityId} has ${justUnder.length} transactions ` +
                   `clustered around 40-60% of the 24h threshold, suggesting structuring`,
        });
      }
    }

    /* Run custom detectors */
    const windowData = {
      entity: this._entityWindows.get(envelope.entityId),
      corridors: this._corridorWindows,
      windows,
    };
    for (const detector of this._detectors) {
      const result = await detector(envelope, windowData);
      if (result && result.detected) {
        envelope._detections.push({
          detector: result.detector || 'custom',
          typology: result.typology || 'CUSTOM',
          confidence: result.confidence || 0.5,
          details: result.details || '',
        });
      }
    }
  }

  /**
   * SCORE stage: compute composite risk score from detections and enrichments.
   * @private
   */
  _stageScore(envelope) {
    let score = 0;

    /* Base score from detections */
    for (const d of envelope._detections) {
      score += d.confidence * 40;
    }

    /* Window breach escalation */
    const windows = envelope._enrichments.windows || {};
    let breachCount = 0;
    for (const [label] of Object.entries(windows)) {
      const agg = windows[label];
      if (agg.totalAmount >= (this.thresholds[label] || Infinity)) {
        breachCount++;
      }
      if (agg.count >= (this.velocityThresholds[label] || Infinity)) {
        breachCount++;
      }
    }
    score += breachCount * 5;

    /* Enrichment-based score additions */
    if (envelope._enrichments.entityRiskScore !== undefined) {
      score += envelope._enrichments.entityRiskScore * 0.3;
    }
    if (envelope._enrichments.jurisdictionRisk !== undefined) {
      score += envelope._enrichments.jurisdictionRisk * 0.2;
    }

    /* Cap at 100 */
    envelope._score = Math.min(100, Math.round(score));

    /* Classify risk level */
    if (envelope._score >= RISK_LEVELS.CRITICAL.min) {
      envelope._riskLevel = 'CRITICAL';
    } else if (envelope._score >= RISK_LEVELS.HIGH.min) {
      envelope._riskLevel = 'HIGH';
    } else if (envelope._score >= RISK_LEVELS.MEDIUM.min) {
      envelope._riskLevel = 'MEDIUM';
    } else {
      envelope._riskLevel = 'LOW';
    }
  }

  /**
   * ALERT stage: generate an alert if the score exceeds the threshold.
   * @private
   */
  _stageAlert(envelope) {
    if (envelope._score >= this.alertScoreThreshold) {
      const alert = {
        id: `ALT-${Date.now().toString(36)}-${envelope.id.slice(0, 8)}`,
        txId: envelope.id,
        entityId: envelope.entityId,
        entityName: envelope.entityName,
        amount: envelope.amount,
        score: envelope._score,
        riskLevel: envelope._riskLevel,
        detections: envelope._detections,
        timestamp: new Date().toISOString(),
        originJurisdiction: envelope.originJurisdiction,
        destJurisdiction: envelope.destJurisdiction,
      };

      envelope._alert = alert;
      this._alerts.push(alert);
      this._metrics.totalAlerts++;

      this.emit('alert', alert);
    }
  }

  /**
   * RECORD stage: persist the processed envelope to the audit trail.
   * @private
   */
  _stageRecord(envelope) {
    this._auditTrail.push({
      id: envelope.id,
      entityId: envelope.entityId,
      amount: envelope.amount,
      currency: envelope.currency,
      type: envelope.type,
      timestamp: envelope.timestamp,
      score: envelope._score,
      riskLevel: envelope._riskLevel,
      detections: envelope._detections.length,
      alerted: envelope._alert !== null,
      processedAt: new Date().toISOString(),
      latencyMs: Date.now() - envelope._ingestedAt,
    });
  }
}
