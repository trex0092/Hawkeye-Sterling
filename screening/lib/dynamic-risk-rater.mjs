/**
 * Dynamic Customer Risk Re-Rating Engine.
 *
 * Triggers risk re-rating for counterparties when material events
 * occur (screening result change, adverse media hit, jurisdiction
 * risk change, transaction pattern alert, PEP status change, or
 * regulatory change). Compares the new risk band against the previous
 * band and automatically adjusts the CDD level.
 *
 * Capabilities:
 *   - Event-triggered re-rating with configurable triggers
 *   - Quantitative risk scoring (internal or via external risk-scoring.mjs)
 *   - Risk band comparison and change detection
 *   - Automatic CDD level upgrade: LOW->SDD, MEDIUM->CDD, HIGH->EDD,
 *     CRITICAL->EDD+SM approval
 *   - Per-entity re-rating history (full audit trail)
 *   - Batch re-rate: re-score all counterparties after list refresh
 *   - Statistics: re-ratings performed, upgrades, downgrades
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 13 (ongoing monitoring)
 *   - FATF Recommendation 1 (risk-based approach, ongoing monitoring)
 *   - Cabinet Resolution 134/2025 (risk-based CDD measures)
 *
 * Zero external dependencies.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// -----------------------------------------------------------------------
//  Constants
// -----------------------------------------------------------------------

/** Valid re-rating trigger types. */
export const TRIGGER_TYPES = Object.freeze({
  SCREENING_CHANGE:     'screening_result_change',
  ADVERSE_MEDIA:        'adverse_media_hit',
  JURISDICTION_CHANGE:  'jurisdiction_risk_change',
  TRANSACTION_ALERT:    'transaction_pattern_alert',
  PEP_STATUS_CHANGE:    'pep_status_change',
  REGULATORY_CHANGE:    'regulatory_change',
  MANUAL:               'manual_review',
  LIST_REFRESH:         'sanctions_list_refresh',
  PERIODIC:             'periodic_review',
});

/** Risk bands in ascending order. */
export const RISK_BANDS = Object.freeze({
  LOW:      'LOW',
  MEDIUM:   'MEDIUM',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
});

/** Ordered array for comparison. */
const BAND_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** CDD levels mapped to risk bands. */
export const CDD_LEVELS = Object.freeze({
  LOW:      'SDD',
  MEDIUM:   'CDD',
  HIGH:     'EDD',
  CRITICAL: 'EDD_SM_APPROVAL',
});

/** CDD level descriptions. */
export const CDD_DESCRIPTIONS = Object.freeze({
  SDD:             'Simplified Due Diligence',
  CDD:             'Standard Customer Due Diligence',
  EDD:             'Enhanced Due Diligence',
  EDD_SM_APPROVAL: 'Enhanced Due Diligence with Senior Management Approval',
});

/**
 * Default risk score thresholds for band assignment.
 * Scores are on a 1-20 scale.
 */
const DEFAULT_BAND_THRESHOLDS = {
  LOW:      { min: 1, max: 5 },
  MEDIUM:   { min: 6, max: 10 },
  HIGH:     { min: 11, max: 15 },
  CRITICAL: { min: 16, max: 20 },
};

// -----------------------------------------------------------------------
//  Type definitions
// -----------------------------------------------------------------------

/**
 * @typedef {object} EntityRiskProfile
 * @property {string} entityId - Unique entity identifier
 * @property {string} entityName - Entity display name
 * @property {number} currentScore - Current risk score (1-20)
 * @property {string} currentBand - Current risk band
 * @property {string} cddLevel - Current CDD level
 * @property {string} lastRatedAt - ISO timestamp of last rating
 * @property {string} lastTrigger - Last trigger type
 * @property {Array<ReRatingRecord>} history - Re-rating history
 * @property {object} factors - Current risk factor scores
 */

/**
 * @typedef {object} ReRatingRecord
 * @property {string} id - Unique re-rating identifier
 * @property {string} trigger - Trigger type
 * @property {string} triggerDetail - Description of what triggered re-rating
 * @property {number} previousScore - Score before re-rating
 * @property {string} previousBand - Band before re-rating
 * @property {string} previousCDD - CDD level before re-rating
 * @property {number} newScore - Score after re-rating
 * @property {string} newBand - Band after re-rating
 * @property {string} newCDD - New CDD level
 * @property {string} direction - 'upgrade' | 'downgrade' | 'no_change'
 * @property {boolean} bandChanged - Whether the risk band changed
 * @property {boolean} alertGenerated - Whether an alert was generated
 * @property {object} factors - Risk factor breakdown
 * @property {string} ratedAt - ISO timestamp
 * @property {string} [ratedBy] - Who triggered the re-rating
 */

/**
 * @typedef {object} ReRatingAlert
 * @property {string} id - Alert identifier
 * @property {string} entityId - Affected entity
 * @property {string} entityName - Entity name
 * @property {string} trigger - What caused the re-rating
 * @property {string} previousBand - Old risk band
 * @property {string} newBand - New risk band
 * @property {string} previousCDD - Old CDD level
 * @property {string} newCDD - New CDD level
 * @property {string} direction - 'upgrade' | 'downgrade'
 * @property {string} action - Required follow-up action
 * @property {boolean} acknowledged - Whether MLRO has acknowledged
 * @property {string} createdAt - ISO timestamp
 */

// -----------------------------------------------------------------------
//  Built-in risk scoring
// -----------------------------------------------------------------------

/**
 * Risk factor weights for the built-in scoring model.
 * These are used when no external risk-scoring module is provided.
 */
const RISK_FACTORS = Object.freeze({
  jurisdiction:      { weight: 3, max: 5, label: 'Jurisdiction risk' },
  customer_type:     { weight: 2, max: 5, label: 'Customer type risk' },
  product_service:   { weight: 2, max: 5, label: 'Product/service risk' },
  delivery_channel:  { weight: 1, max: 5, label: 'Delivery channel risk' },
  transaction_volume:{ weight: 2, max: 5, label: 'Transaction volume risk' },
  pep_status:        { weight: 3, max: 5, label: 'PEP status risk' },
  sanctions_match:   { weight: 3, max: 5, label: 'Sanctions screening risk' },
  adverse_media:     { weight: 2, max: 5, label: 'Adverse media risk' },
  relationship_age:  { weight: 1, max: 5, label: 'Relationship maturity risk' },
  source_of_funds:   { weight: 1, max: 5, label: 'Source of funds transparency' },
});

/**
 * Compute a risk score from individual risk factors using the built-in
 * weighted scoring model.
 *
 * @param {object} factors - Key-value pairs where key is factor name and value is 1-5
 * @returns {{ score: number, band: string, factorBreakdown: object }}
 */
export function computeRiskScore(factors) {
  if (!factors || typeof factors !== 'object') {
    throw new Error('factors object is required');
  }

  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown = {};

  for (const [name, config] of Object.entries(RISK_FACTORS)) {
    const value = typeof factors[name] === 'number' ? factors[name] : 1;
    const clamped = Math.max(1, Math.min(config.max, value));
    const weighted = clamped * config.weight;

    breakdown[name] = {
      label: config.label,
      rawValue: clamped,
      weight: config.weight,
      weightedValue: weighted,
    };

    weightedSum += weighted;
    totalWeight += config.max * config.weight;
  }

  // Normalise to 1-20 scale
  const normalised = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 20)
    : 1;
  const score = Math.max(1, Math.min(20, normalised));

  const band = scoreToBand(score);

  return { score, band, factorBreakdown: breakdown };
}

/**
 * Map a numeric risk score (1-20) to a risk band.
 *
 * @param {number} score
 * @returns {string}
 */
export function scoreToBand(score) {
  if (typeof score !== 'number' || score < 1) return RISK_BANDS.LOW;
  if (score <= DEFAULT_BAND_THRESHOLDS.LOW.max) return RISK_BANDS.LOW;
  if (score <= DEFAULT_BAND_THRESHOLDS.MEDIUM.max) return RISK_BANDS.MEDIUM;
  if (score <= DEFAULT_BAND_THRESHOLDS.HIGH.max) return RISK_BANDS.HIGH;
  return RISK_BANDS.CRITICAL;
}

/**
 * Map a risk band to the required CDD level.
 *
 * @param {string} band
 * @returns {string}
 */
export function bandToCDD(band) {
  return CDD_LEVELS[band] || CDD_LEVELS.MEDIUM;
}

/**
 * Compare two bands and determine the direction of change.
 *
 * @param {string} oldBand
 * @param {string} newBand
 * @returns {'upgrade'|'downgrade'|'no_change'}
 */
export function compareBands(oldBand, newBand) {
  const oldIdx = BAND_ORDER.indexOf(oldBand);
  const newIdx = BAND_ORDER.indexOf(newBand);
  if (newIdx > oldIdx) return 'upgrade';
  if (newIdx < oldIdx) return 'downgrade';
  return 'no_change';
}

// -----------------------------------------------------------------------
//  DynamicRiskRater
// -----------------------------------------------------------------------

/**
 * Dynamic risk re-rating engine. Manages entity risk profiles,
 * processes re-rating triggers, and generates alerts when risk
 * bands change.
 */
export class DynamicRiskRater {
  /**
   * @param {string} storePath - Absolute path to the JSON persistence file
   * @param {object} [opts]
   * @param {Function} [opts.scoreFn] - External scoring function.
   *   Signature: (entityId: string, factors: object) => { score: number, band: string }.
   *   If not provided, the built-in computeRiskScore() is used.
   */
  constructor(storePath, opts = {}) {
    if (!storePath || typeof storePath !== 'string') {
      throw new Error('storePath is required and must be a string');
    }

    /** @type {string} */
    this.storePath = storePath;

    /** @type {Map<string, EntityRiskProfile>} */
    this.profiles = new Map();

    /** @type {Array<ReRatingAlert>} */
    this.alerts = [];

    /** @type {Function|null} */
    this.scoreFn = opts.scoreFn || null;

    /** @private */
    this._loaded = false;
  }

  // ---- Persistence ----------------------------------------------------

  /**
   * Load state from disk.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(await readFile(this.storePath, 'utf8'));
        for (const profile of raw.profiles || []) {
          this.profiles.set(profile.entityId, profile);
        }
        this.alerts = raw.alerts || [];
      } catch (err) {
        throw new Error(`Failed to load risk rater state: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist state to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      profileCount: this.profiles.size,
      alertCount: this.alerts.length,
      profiles: [...this.profiles.values()],
      alerts: this.alerts,
    };
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- Entity profile management --------------------------------------

  /**
   * Register or update an entity's risk profile with initial scoring.
   *
   * @param {object} params
   * @param {string} params.entityId - Unique entity identifier
   * @param {string} params.entityName - Display name
   * @param {object} params.factors - Risk factor scores (key: factor name, value: 1-5)
   * @returns {Promise<EntityRiskProfile>}
   */
  async registerEntity(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityId || typeof params.entityId !== 'string') {
      throw new Error('params.entityId is required');
    }
    if (!params.entityName || typeof params.entityName !== 'string') {
      throw new Error('params.entityName is required');
    }
    if (!params.factors || typeof params.factors !== 'object') {
      throw new Error('params.factors is required');
    }

    const scoring = this._score(params.entityId, params.factors);
    const now = new Date().toISOString();

    /** @type {EntityRiskProfile} */
    const profile = {
      entityId: params.entityId,
      entityName: params.entityName,
      currentScore: scoring.score,
      currentBand: scoring.band,
      cddLevel: bandToCDD(scoring.band),
      lastRatedAt: now,
      lastTrigger: TRIGGER_TYPES.MANUAL,
      history: [{
        id: `RR-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        trigger: TRIGGER_TYPES.MANUAL,
        triggerDetail: 'Initial registration and risk assessment',
        previousScore: 0,
        previousBand: 'N/A',
        previousCDD: 'N/A',
        newScore: scoring.score,
        newBand: scoring.band,
        newCDD: bandToCDD(scoring.band),
        direction: 'no_change',
        bandChanged: false,
        alertGenerated: false,
        factors: scoring.factorBreakdown || params.factors,
        ratedAt: now,
        ratedBy: 'system',
      }],
      factors: params.factors,
    };

    this.profiles.set(params.entityId, profile);
    await this.save();
    return profile;
  }

  /**
   * Get an entity's current risk profile.
   *
   * @param {string} entityId
   * @returns {EntityRiskProfile|null}
   */
  getProfile(entityId) {
    return this.profiles.get(entityId) || null;
  }

  /**
   * List all entity profiles, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.band] - Filter by current risk band
   * @param {string} [filters.cddLevel] - Filter by CDD level
   * @returns {Promise<Array<EntityRiskProfile>>}
   */
  async listProfiles(filters = {}) {
    await this.load();

    let results = [...this.profiles.values()];

    if (filters.band) {
      results = results.filter(p => p.currentBand === filters.band);
    }
    if (filters.cddLevel) {
      results = results.filter(p => p.cddLevel === filters.cddLevel);
    }

    results.sort((a, b) => b.currentScore - a.currentScore);
    return results;
  }

  // ---- Re-rating ------------------------------------------------------

  /**
   * Trigger a risk re-rating for an entity.
   *
   * @param {object} params
   * @param {string} params.entityId - Entity to re-rate
   * @param {string} params.trigger - One of TRIGGER_TYPES values
   * @param {string} [params.triggerDetail] - Description of what triggered re-rating
   * @param {object} [params.updatedFactors] - Updated risk factor scores (merged with existing)
   * @param {string} [params.ratedBy] - Who initiated the re-rating
   * @returns {Promise<{ profile: EntityRiskProfile, record: ReRatingRecord, alert: ReRatingAlert|null }>}
   */
  async reRate(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityId || typeof params.entityId !== 'string') {
      throw new Error('params.entityId is required');
    }

    const validTriggers = Object.values(TRIGGER_TYPES);
    if (!validTriggers.includes(params.trigger)) {
      throw new Error(`params.trigger must be one of: ${validTriggers.join(', ')}`);
    }

    const profile = this.profiles.get(params.entityId);
    if (!profile) {
      throw new Error(`Entity not found: ${params.entityId}`);
    }

    // Merge updated factors with existing
    const mergedFactors = { ...profile.factors };
    if (params.updatedFactors && typeof params.updatedFactors === 'object') {
      for (const [key, value] of Object.entries(params.updatedFactors)) {
        mergedFactors[key] = value;
      }
    }

    // Compute new score
    const previousScore = profile.currentScore;
    const previousBand = profile.currentBand;
    const previousCDD = profile.cddLevel;

    const scoring = this._score(params.entityId, mergedFactors);
    const newBand = scoring.band;
    const newCDD = bandToCDD(newBand);
    const direction = compareBands(previousBand, newBand);
    const bandChanged = previousBand !== newBand;

    const now = new Date().toISOString();

    // Create re-rating record
    /** @type {ReRatingRecord} */
    const record = {
      id: `RR-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      trigger: params.trigger,
      triggerDetail: params.triggerDetail || `Re-rating triggered by ${params.trigger}`,
      previousScore,
      previousBand,
      previousCDD,
      newScore: scoring.score,
      newBand,
      newCDD,
      direction,
      bandChanged,
      alertGenerated: false,
      factors: scoring.factorBreakdown || mergedFactors,
      ratedAt: now,
      ratedBy: params.ratedBy || 'system',
    };

    // Update profile
    profile.currentScore = scoring.score;
    profile.currentBand = newBand;
    profile.cddLevel = newCDD;
    profile.lastRatedAt = now;
    profile.lastTrigger = params.trigger;
    profile.factors = mergedFactors;
    profile.history.push(record);

    // Generate alert if band changed
    let alert = null;
    if (bandChanged) {
      alert = this._generateAlert(profile, record);
      record.alertGenerated = true;
    }

    await this.save();
    return { profile, record, alert };
  }

  /**
   * Batch re-rate all registered entities. Typically called after a
   * sanctions list refresh, jurisdiction risk change, or regulatory
   * update that may affect multiple counterparties.
   *
   * @param {object} params
   * @param {string} params.trigger - Trigger type for all re-ratings
   * @param {string} [params.triggerDetail] - Description
   * @param {object} [params.globalFactorOverrides] - Factors to update for all entities
   * @param {string} [params.ratedBy]
   * @returns {Promise<{ total: number, reRated: number, bandChanges: number, upgrades: number, downgrades: number, errors: Array<{ entityId: string, error: string }> }>}
   */
  async batchReRate(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }

    const validTriggers = Object.values(TRIGGER_TYPES);
    if (!validTriggers.includes(params.trigger)) {
      throw new Error(`params.trigger must be one of: ${validTriggers.join(', ')}`);
    }

    const entities = [...this.profiles.keys()];
    let reRated = 0;
    let bandChanges = 0;
    let upgrades = 0;
    let downgrades = 0;
    const errors = [];

    for (const entityId of entities) {
      try {
        const result = await this.reRate({
          entityId,
          trigger: params.trigger,
          triggerDetail: params.triggerDetail || `Batch re-rating: ${params.trigger}`,
          updatedFactors: params.globalFactorOverrides || {},
          ratedBy: params.ratedBy || 'system',
        });

        reRated++;

        if (result.record.bandChanged) {
          bandChanges++;
          if (result.record.direction === 'upgrade') upgrades++;
          if (result.record.direction === 'downgrade') downgrades++;
        }
      } catch (err) {
        errors.push({ entityId, error: err.message });
      }
    }

    return {
      total: entities.length,
      reRated,
      bandChanges,
      upgrades,
      downgrades,
      errors,
    };
  }

  // ---- Internal scoring -----------------------------------------------

  /**
   * Score an entity using the configured scoring function or the
   * built-in model.
   *
   * @param {string} entityId
   * @param {object} factors
   * @returns {{ score: number, band: string, factorBreakdown: object|undefined }}
   */
  _score(entityId, factors) {
    if (this.scoreFn !== null) {
      const result = this.scoreFn(entityId, factors);
      if (!result || typeof result.score !== 'number' || typeof result.band !== 'string') {
        throw new Error('External scoreFn must return { score: number, band: string }');
      }
      return result;
    }
    return computeRiskScore(factors);
  }

  // ---- Alert generation -----------------------------------------------

  /**
   * Generate an alert when a risk band change is detected.
   *
   * @param {EntityRiskProfile} profile
   * @param {ReRatingRecord} record
   * @returns {ReRatingAlert}
   */
  _generateAlert(profile, record) {
    const id = `RRA-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    let action;
    if (record.direction === 'upgrade') {
      if (record.newBand === RISK_BANDS.CRITICAL) {
        action = 'Escalate to Senior Management for approval. Apply EDD immediately. Consider filing an STR if suspicious indicators are present.';
      } else if (record.newBand === RISK_BANDS.HIGH) {
        action = 'Apply Enhanced Due Diligence immediately. Review source of wealth and source of funds documentation.';
      } else {
        action = `Apply ${CDD_DESCRIPTIONS[record.newCDD]} measures within five business days.`;
      }
    } else {
      action = `Adjust due diligence measures to ${CDD_DESCRIPTIONS[record.newCDD]}. Document the basis for the downgrade.`;
    }

    /** @type {ReRatingAlert} */
    const alert = {
      id,
      entityId: profile.entityId,
      entityName: profile.entityName,
      trigger: record.trigger,
      previousBand: record.previousBand,
      newBand: record.newBand,
      previousCDD: record.previousCDD,
      newCDD: record.newCDD,
      direction: record.direction,
      action,
      acknowledged: false,
      createdAt: new Date().toISOString(),
    };

    this.alerts.push(alert);
    return alert;
  }

  // ---- Alert management -----------------------------------------------

  /**
   * Get all unacknowledged re-rating alerts.
   *
   * @returns {Promise<Array<ReRatingAlert>>}
   */
  async getUnacknowledgedAlerts() {
    await this.load();
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Acknowledge a re-rating alert.
   *
   * @param {string} alertId
   * @param {string} [acknowledgedBy]
   * @returns {Promise<boolean>}
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    await this.load();
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy || 'MLRO';
    alert.acknowledgedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  // ---- Re-rating history ----------------------------------------------

  /**
   * Get the full re-rating history for an entity.
   *
   * @param {string} entityId
   * @param {object} [filters]
   * @param {string} [filters.since] - ISO timestamp
   * @param {number} [filters.limit]
   * @returns {Promise<Array<ReRatingRecord>>}
   */
  async getHistory(entityId, filters = {}) {
    await this.load();

    const profile = this.profiles.get(entityId);
    if (!profile) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    let records = [...profile.history];

    if (filters.since) {
      records = records.filter(r => r.ratedAt >= filters.since);
    }

    records.sort((a, b) => b.ratedAt.localeCompare(a.ratedAt));

    if (filters.limit) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  // ---- Statistics -----------------------------------------------------

  /**
   * Compute re-rating statistics across all entities.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const profiles = [...this.profiles.values()];

    const bandCounts = {};
    for (const band of BAND_ORDER) {
      bandCounts[band] = profiles.filter(p => p.currentBand === band).length;
    }

    const cddCounts = {};
    for (const [band, cdd] of Object.entries(CDD_LEVELS)) {
      cddCounts[cdd] = profiles.filter(p => p.cddLevel === cdd).length;
    }

    let totalReRatings = 0;
    let totalUpgrades = 0;
    let totalDowngrades = 0;
    let totalBandChanges = 0;

    const triggerCounts = {};
    for (const trigger of Object.values(TRIGGER_TYPES)) {
      triggerCounts[trigger] = 0;
    }

    for (const profile of profiles) {
      for (const record of profile.history) {
        totalReRatings++;
        if (record.bandChanged) {
          totalBandChanges++;
          if (record.direction === 'upgrade') totalUpgrades++;
          if (record.direction === 'downgrade') totalDowngrades++;
        }
        if (triggerCounts[record.trigger] !== undefined) {
          triggerCounts[record.trigger]++;
        }
      }
    }

    // Average score
    const scores = profiles.map(p => p.currentScore);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

    return {
      totalEntities: profiles.length,
      bandDistribution: bandCounts,
      cddDistribution: cddCounts,
      averageScore: avgScore,
      totalReRatings,
      totalBandChanges,
      totalUpgrades,
      totalDowngrades,
      totalAlerts: this.alerts.length,
      unacknowledgedAlerts: this.alerts.filter(a => !a.acknowledged).length,
      triggerCounts,
    };
  }
}

export { RISK_FACTORS, DEFAULT_BAND_THRESHOLDS, BAND_ORDER };
