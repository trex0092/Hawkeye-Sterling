/**
 * Regulatory Change Auto-Detector.
 *
 * Monitors regulatory source URLs for changes by comparing content
 * hashes against stored baselines. When a change is detected, the
 * module classifies the change type, assesses the impact on existing
 * controls, generates a briefing for staff training, and alerts the
 * MLRO for critical regulatory updates.
 *
 * Monitored source categories:
 *   - FATF statements and publications
 *   - UAE Federal Decree-Law amendments
 *   - Ministry of Economy circulars
 *   - Cabinet resolutions
 *   - EOCN guidance and lists
 *
 * Capabilities:
 *   - Content hash comparison (SHA-256) for change detection
 *   - Change type classification: new_regulation, amendment, circular,
 *     guidance, enforcement_action
 *   - Impact assessment against existing controls/procedures
 *   - Regulatory change briefing generation (feeds into training tracker)
 *   - MLRO alert generation for critical changes
 *   - Source URL configuration and management
 *   - Change history and audit trail
 *
 * References:
 *   - Federal Decree-Law No. 10/2025 (ongoing compliance obligation)
 *
 * Zero external dependencies.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// -----------------------------------------------------------------------
//  Constants
// -----------------------------------------------------------------------

/** Recognised change types. */
export const CHANGE_TYPES = Object.freeze({
  NEW_REGULATION:     'new_regulation',
  AMENDMENT:          'amendment',
  CIRCULAR:           'circular',
  GUIDANCE:           'guidance',
  ENFORCEMENT_ACTION: 'enforcement_action',
});

/** Recognised source categories. */
export const SOURCE_CATEGORIES = Object.freeze({
  FATF:       'fatf',
  UAE_FDL:    'uae_fdl',
  MOE:        'moe',
  CABINET:    'cabinet',
  EOCN:       'eocn',
});

/** Impact severity levels. */
export const IMPACT_LEVELS = Object.freeze({
  CRITICAL: 'critical',
  HIGH:     'high',
  MEDIUM:   'medium',
  LOW:      'low',
  INFO:     'info',
});

/** Alert priority levels. */
export const ALERT_PRIORITY = Object.freeze({
  IMMEDIATE:  'immediate',
  HIGH:       'high',
  NORMAL:     'normal',
  LOW:        'low',
});

/**
 * Default control areas that may be affected by regulatory changes.
 * Used in impact assessment to map changes to specific procedures.
 */
const CONTROL_AREAS = Object.freeze([
  'customer_due_diligence',
  'enhanced_due_diligence',
  'ongoing_monitoring',
  'sanctions_screening',
  'pep_screening',
  'transaction_monitoring',
  'suspicious_reporting',
  'record_keeping',
  'staff_training',
  'risk_assessment',
  'beneficial_ownership',
  'targeted_financial_sanctions',
  'internal_controls',
  'senior_management_oversight',
]);

// -----------------------------------------------------------------------
//  Type definitions
// -----------------------------------------------------------------------

/**
 * @typedef {object} RegulatorySource
 * @property {string} id - Unique source identifier
 * @property {string} name - Human-readable source name
 * @property {string} url - Source URL to monitor
 * @property {string} category - One of SOURCE_CATEGORIES
 * @property {boolean} enabled - Whether monitoring is active
 * @property {string|null} lastHash - SHA-256 hash of last fetched content
 * @property {string|null} lastChecked - ISO timestamp of last check
 * @property {string|null} lastChanged - ISO timestamp of last detected change
 * @property {number} checkIntervalHours - Hours between checks
 * @property {string} [notes]
 */

/**
 * @typedef {object} DetectedChange
 * @property {string} id - Unique change identifier
 * @property {string} sourceId - Source that changed
 * @property {string} sourceName - Source name
 * @property {string} sourceCategory - Source category
 * @property {string} changeType - One of CHANGE_TYPES
 * @property {string} impactLevel - One of IMPACT_LEVELS
 * @property {string} previousHash - Previous content hash
 * @property {string} currentHash - New content hash
 * @property {string} summary - Brief description of the change
 * @property {Array<string>} affectedControls - Which control areas are affected
 * @property {Array<object>} alerts - Alerts generated
 * @property {boolean} briefingGenerated - Whether a staff briefing was created
 * @property {boolean} acknowledged - Whether the MLRO has acknowledged
 * @property {string|null} acknowledgedBy - Who acknowledged
 * @property {string|null} acknowledgedAt - When acknowledged
 * @property {string} detectedAt - ISO timestamp
 */

/**
 * @typedef {object} MLROAlert
 * @property {string} id - Alert identifier
 * @property {string} changeId - Related change ID
 * @property {string} priority - One of ALERT_PRIORITY
 * @property {string} subject - Alert subject line
 * @property {string} body - Alert body text
 * @property {boolean} read - Whether the alert has been read
 * @property {string} createdAt - ISO timestamp
 */

// -----------------------------------------------------------------------
//  RegulatoryChangeDetector
// -----------------------------------------------------------------------

/**
 * Regulatory change auto-detector. Monitors configured source URLs,
 * detects content changes, assesses impact, and generates alerts.
 */
export class RegulatoryChangeDetector {
  /**
   * @param {string} storePath - Absolute path to the JSON persistence file
   * @param {object} [opts]
   * @param {Function} [opts.fetchFn] - Custom fetch function for retrieving URLs.
   *   Signature: (url: string) => Promise<string>. If not provided, the
   *   module uses a stub that must be overridden before calling checkAll().
   */
  constructor(storePath, opts = {}) {
    if (!storePath || typeof storePath !== 'string') {
      throw new Error('storePath is required and must be a string');
    }

    /** @type {string} */
    this.storePath = storePath;

    /** @type {Map<string, RegulatorySource>} */
    this.sources = new Map();

    /** @type {Array<DetectedChange>} */
    this.changes = [];

    /** @type {Array<MLROAlert>} */
    this.alerts = [];

    /** @type {Function} */
    this.fetchFn = opts.fetchFn || null;

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
        for (const src of raw.sources || []) {
          this.sources.set(src.id, src);
        }
        this.changes = raw.changes || [];
        this.alerts = raw.alerts || [];
      } catch (err) {
        throw new Error(`Failed to load regulatory change state: ${err.message}`);
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
      sourceCount: this.sources.size,
      changeCount: this.changes.length,
      alertCount: this.alerts.length,
      sources: [...this.sources.values()],
      changes: this.changes,
      alerts: this.alerts,
    };
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- Source management ----------------------------------------------

  /**
   * Add a regulatory source to monitor.
   *
   * @param {object} params
   * @param {string} params.name - Source name
   * @param {string} params.url - Source URL
   * @param {string} params.category - One of SOURCE_CATEGORIES values
   * @param {number} [params.checkIntervalHours] - Check interval (default 24)
   * @param {string} [params.notes]
   * @param {string} [params.id] - Explicit ID
   * @returns {Promise<RegulatorySource>}
   */
  async addSource(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required');
    }
    if (!params.url || typeof params.url !== 'string') {
      throw new Error('params.url is required');
    }
    const validCategories = Object.values(SOURCE_CATEGORIES);
    if (!validCategories.includes(params.category)) {
      throw new Error(`params.category must be one of: ${validCategories.join(', ')}`);
    }

    const id = params.id || `SRC-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    /** @type {RegulatorySource} */
    const source = {
      id,
      name: params.name,
      url: params.url,
      category: params.category,
      enabled: true,
      lastHash: null,
      lastChecked: null,
      lastChanged: null,
      checkIntervalHours: params.checkIntervalHours || 24,
      notes: params.notes || '',
    };

    this.sources.set(id, source);
    await this.save();
    return source;
  }

  /**
   * Remove a source by ID.
   *
   * @param {string} sourceId
   * @returns {Promise<boolean>}
   */
  async removeSource(sourceId) {
    await this.load();
    const deleted = this.sources.delete(sourceId);
    if (deleted) await this.save();
    return deleted;
  }

  /**
   * Enable or disable a source.
   *
   * @param {string} sourceId
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  async setSourceEnabled(sourceId, enabled) {
    await this.load();
    const source = this.sources.get(sourceId);
    if (!source) return false;
    source.enabled = enabled;
    await this.save();
    return true;
  }

  /**
   * List all sources, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.category]
   * @param {boolean} [filters.enabledOnly]
   * @returns {Promise<Array<RegulatorySource>>}
   */
  async listSources(filters = {}) {
    await this.load();
    let results = [...this.sources.values()];
    if (filters.category) {
      results = results.filter(s => s.category === filters.category);
    }
    if (filters.enabledOnly) {
      results = results.filter(s => s.enabled);
    }
    return results;
  }

  // ---- Hash computation -----------------------------------------------

  /**
   * Compute the SHA-256 hash of a content string.
   *
   * @param {string} content
   * @returns {string}
   */
  computeHash(content) {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  // ---- Change detection -----------------------------------------------

  /**
   * Check a single source for changes. Fetches the URL content, computes
   * the hash, and compares against the stored baseline.
   *
   * @param {string} sourceId
   * @returns {Promise<{ changed: boolean, change: DetectedChange|null }>}
   */
  async checkSource(sourceId) {
    await this.load();

    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }
    if (!this.fetchFn) {
      throw new Error('No fetch function configured. Provide fetchFn in constructor options.');
    }

    let content;
    try {
      content = await this.fetchFn(source.url);
    } catch (err) {
      source.lastChecked = new Date().toISOString();
      await this.save();
      throw new Error(`Failed to fetch source "${source.name}": ${err.message}`);
    }

    if (typeof content !== 'string') {
      throw new Error(`Fetch function must return a string for source "${source.name}"`);
    }

    const currentHash = this.computeHash(content);
    const now = new Date().toISOString();
    source.lastChecked = now;

    // First check: establish baseline
    if (source.lastHash === null) {
      source.lastHash = currentHash;
      await this.save();
      return { changed: false, change: null };
    }

    // Compare hashes
    if (currentHash === source.lastHash) {
      await this.save();
      return { changed: false, change: null };
    }

    // Change detected
    const previousHash = source.lastHash;
    source.lastHash = currentHash;
    source.lastChanged = now;

    const change = this._createChange(source, previousHash, currentHash, content);
    this.changes.push(change);

    // Generate alerts
    const alert = this._generateAlert(change);
    if (alert !== null) {
      this.alerts.push(alert);
      change.alerts.push(alert);
    }

    await this.save();
    return { changed: true, change };
  }

  /**
   * Check all enabled sources for changes. Sources that are not yet due
   * for a check (based on checkIntervalHours) are skipped.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.force] - Check all sources regardless of interval
   * @returns {Promise<{ checked: number, changed: number, errors: Array<{ sourceId: string, error: string }>, changes: Array<DetectedChange> }>}
   */
  async checkAll(opts = {}) {
    await this.load();

    const force = opts.force === true;
    const now = new Date();
    const enabledSources = [...this.sources.values()].filter(s => s.enabled);

    let checked = 0;
    let changed = 0;
    const errors = [];
    const detectedChanges = [];

    for (const source of enabledSources) {
      // Check interval
      if (!force && source.lastChecked !== null) {
        const lastCheckedDate = new Date(source.lastChecked);
        const intervalMs = source.checkIntervalHours * 60 * 60 * 1000;
        if (now.getTime() - lastCheckedDate.getTime() < intervalMs) {
          continue;
        }
      }

      try {
        const result = await this.checkSource(source.id);
        checked++;
        if (result.changed) {
          changed++;
          detectedChanges.push(result.change);
        }
      } catch (err) {
        errors.push({ sourceId: source.id, error: err.message });
      }
    }

    return { checked, changed, errors, changes: detectedChanges };
  }

  // ---- Change creation ------------------------------------------------

  /**
   * Create a DetectedChange record from a source change.
   *
   * @param {RegulatorySource} source
   * @param {string} previousHash
   * @param {string} currentHash
   * @param {string} content - Fetched content (used for classification)
   * @returns {DetectedChange}
   */
  _createChange(source, previousHash, currentHash, content) {
    const changeType = this._classifyChangeType(source, content);
    const impactLevel = this._assessImpactLevel(source, changeType);
    const affectedControls = this._identifyAffectedControls(source, changeType, content);

    const id = `CHG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    return {
      id,
      sourceId: source.id,
      sourceName: source.name,
      sourceCategory: source.category,
      changeType,
      impactLevel,
      previousHash,
      currentHash,
      summary: `Change detected in ${source.name} (${source.category}): content hash changed`,
      affectedControls,
      alerts: [],
      briefingGenerated: false,
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      detectedAt: new Date().toISOString(),
    };
  }

  /**
   * Classify the type of regulatory change based on the source category
   * and content keywords.
   *
   * @param {RegulatorySource} source
   * @param {string} content
   * @returns {string}
   */
  _classifyChangeType(source, content) {
    const lower = content.toLowerCase();

    if (lower.includes('enforcement') || lower.includes('penalty') || lower.includes('fine')) {
      return CHANGE_TYPES.ENFORCEMENT_ACTION;
    }
    if (lower.includes('amend') || lower.includes('revision') || lower.includes('repeal')) {
      return CHANGE_TYPES.AMENDMENT;
    }
    if (lower.includes('circular') || lower.includes('notice')) {
      return CHANGE_TYPES.CIRCULAR;
    }
    if (lower.includes('guidance') || lower.includes('guideline') || lower.includes('best practice')) {
      return CHANGE_TYPES.GUIDANCE;
    }

    // Default based on category
    if (source.category === SOURCE_CATEGORIES.UAE_FDL) return CHANGE_TYPES.AMENDMENT;
    if (source.category === SOURCE_CATEGORIES.MOE) return CHANGE_TYPES.CIRCULAR;
    if (source.category === SOURCE_CATEGORIES.CABINET) return CHANGE_TYPES.NEW_REGULATION;
    if (source.category === SOURCE_CATEGORIES.FATF) return CHANGE_TYPES.GUIDANCE;
    if (source.category === SOURCE_CATEGORIES.EOCN) return CHANGE_TYPES.GUIDANCE;

    return CHANGE_TYPES.GUIDANCE;
  }

  /**
   * Assess the impact level of a detected change.
   *
   * @param {RegulatorySource} source
   * @param {string} changeType
   * @returns {string}
   */
  _assessImpactLevel(source, changeType) {
    // New regulations and amendments from primary law are always critical
    if (source.category === SOURCE_CATEGORIES.UAE_FDL) {
      if (changeType === CHANGE_TYPES.NEW_REGULATION || changeType === CHANGE_TYPES.AMENDMENT) {
        return IMPACT_LEVELS.CRITICAL;
      }
    }

    // Cabinet resolutions are high impact
    if (source.category === SOURCE_CATEGORIES.CABINET) {
      return IMPACT_LEVELS.HIGH;
    }

    // Enforcement actions are high impact (lessons learned)
    if (changeType === CHANGE_TYPES.ENFORCEMENT_ACTION) {
      return IMPACT_LEVELS.HIGH;
    }

    // FATF statements can be critical or high
    if (source.category === SOURCE_CATEGORIES.FATF) {
      if (changeType === CHANGE_TYPES.NEW_REGULATION) return IMPACT_LEVELS.CRITICAL;
      return IMPACT_LEVELS.HIGH;
    }

    // EOCN guidance is medium to high
    if (source.category === SOURCE_CATEGORIES.EOCN) {
      return IMPACT_LEVELS.MEDIUM;
    }

    // MoE circulars are medium
    if (source.category === SOURCE_CATEGORIES.MOE) {
      return IMPACT_LEVELS.MEDIUM;
    }

    return IMPACT_LEVELS.LOW;
  }

  /**
   * Identify which internal controls/procedures are likely affected
   * by a regulatory change.
   *
   * @param {RegulatorySource} source
   * @param {string} changeType
   * @param {string} content
   * @returns {Array<string>}
   */
  _identifyAffectedControls(source, changeType, content) {
    const affected = new Set();
    const lower = content.toLowerCase();

    // Keyword-based control mapping
    const controlKeywords = {
      customer_due_diligence: ['due diligence', 'cdd', 'kyc', 'know your customer', 'identification'],
      enhanced_due_diligence: ['enhanced due diligence', 'edd', 'high risk', 'high-risk'],
      ongoing_monitoring: ['ongoing monitoring', 'continuous monitoring', 'periodic review'],
      sanctions_screening: ['sanctions', 'designated', 'frozen', 'asset freeze', 'travel ban'],
      pep_screening: ['politically exposed', 'pep', 'senior political figure'],
      transaction_monitoring: ['transaction monitoring', 'unusual transaction', 'threshold'],
      suspicious_reporting: ['suspicious', 'str', 'sar', 'goaml', 'filing'],
      record_keeping: ['record', 'retention', 'archive', 'documentation'],
      staff_training: ['training', 'awareness', 'competence'],
      risk_assessment: ['risk assessment', 'risk-based', 'risk based approach'],
      beneficial_ownership: ['beneficial owner', 'ubo', 'ultimate beneficial'],
      targeted_financial_sanctions: ['targeted financial sanctions', 'tfs', 'proliferation financing'],
      internal_controls: ['internal control', 'compliance programme', 'compliance program', 'audit'],
      senior_management_oversight: ['senior management', 'board', 'governance', 'oversight'],
    };

    for (const [control, keywords] of Object.entries(controlKeywords)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          affected.add(control);
          break;
        }
      }
    }

    // Category-based defaults (if no keyword matches found)
    if (affected.size === 0) {
      if (source.category === SOURCE_CATEGORIES.EOCN) {
        affected.add('sanctions_screening');
        affected.add('targeted_financial_sanctions');
      } else if (source.category === SOURCE_CATEGORIES.FATF) {
        affected.add('risk_assessment');
        affected.add('internal_controls');
      } else {
        affected.add('internal_controls');
      }
    }

    // All changes require training update consideration
    affected.add('staff_training');

    return [...affected];
  }

  // ---- Alert generation -----------------------------------------------

  /**
   * Generate an MLRO alert for a detected change if the impact
   * warrants it.
   *
   * @param {DetectedChange} change
   * @returns {MLROAlert|null}
   */
  _generateAlert(change) {
    // Only generate alerts for medium impact and above
    const alertLevels = {
      [IMPACT_LEVELS.CRITICAL]: ALERT_PRIORITY.IMMEDIATE,
      [IMPACT_LEVELS.HIGH]:     ALERT_PRIORITY.HIGH,
      [IMPACT_LEVELS.MEDIUM]:   ALERT_PRIORITY.NORMAL,
    };

    const priority = alertLevels[change.impactLevel];
    if (!priority) return null;

    const id = `ALT-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    const subject = `[${priority.toUpperCase()}] Regulatory change detected: ${change.sourceName}`;

    const bodyLines = [
      `REGULATORY CHANGE ALERT`,
      ``,
      `Source:          ${change.sourceName} (${change.sourceCategory})`,
      `Change type:     ${change.changeType}`,
      `Impact level:    ${change.impactLevel}`,
      `Detected:        ${change.detectedAt}`,
      ``,
      `SUMMARY`,
      ``,
      change.summary,
      ``,
      `AFFECTED CONTROLS`,
      ``,
    ];

    for (const control of change.affectedControls) {
      bodyLines.push(`  - ${control.replace(/_/g, ' ')}`);
    }

    bodyLines.push('');
    bodyLines.push('ACTION REQUIRED');
    bodyLines.push('');

    if (change.impactLevel === IMPACT_LEVELS.CRITICAL) {
      bodyLines.push('Review this change immediately and assess whether existing policies and procedures require amendment.');
    } else if (change.impactLevel === IMPACT_LEVELS.HIGH) {
      bodyLines.push('Review this change within one business day and determine whether control updates are needed.');
    } else {
      bodyLines.push('Review this change during the next compliance review cycle.');
    }

    bodyLines.push('');
    bodyLines.push('For review by the MLRO.');

    return {
      id,
      changeId: change.id,
      priority,
      subject,
      body: bodyLines.join('\n'),
      read: false,
      createdAt: new Date().toISOString(),
    };
  }

  // ---- Briefing generation --------------------------------------------

  /**
   * Generate a plain-text regulatory change briefing for staff training.
   * This output is intended to feed into the training tracker as a
   * regulatory change briefing event.
   *
   * @param {string} changeId
   * @returns {Promise<string>}
   */
  async generateBriefing(changeId) {
    await this.load();

    const change = this.changes.find(c => c.id === changeId);
    if (!change) {
      throw new Error(`Change not found: ${changeId}`);
    }

    const lines = [];
    lines.push('========================================================================');
    lines.push('REGULATORY CHANGE BRIEFING');
    lines.push('========================================================================');
    lines.push('');
    lines.push('BRIEFING METADATA');
    lines.push('');
    lines.push(`Change reference:    ${change.id}`);
    lines.push(`Source:              ${change.sourceName}`);
    lines.push(`Category:            ${change.sourceCategory}`);
    lines.push(`Change type:         ${change.changeType}`);
    lines.push(`Impact level:        ${change.impactLevel}`);
    lines.push(`Detected:            ${change.detectedAt}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');
    lines.push('CHANGE DESCRIPTION');
    lines.push('');
    lines.push(change.summary);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');
    lines.push('AFFECTED CONTROLS AND PROCEDURES');
    lines.push('');

    for (const control of change.affectedControls) {
      const formatted = control.replace(/_/g, ' ');
      lines.push(`  ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}`);
    }

    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');
    lines.push('STAFF AWARENESS REQUIREMENTS');
    lines.push('');
    lines.push('All relevant staff must be briefed on this regulatory change.');
    lines.push('Training records must be updated to reflect completion of this briefing.');
    lines.push('');

    if (change.impactLevel === IMPACT_LEVELS.CRITICAL || change.impactLevel === IMPACT_LEVELS.HIGH) {
      lines.push('This change has been classified as high-impact. Ensure all compliance');
      lines.push('and operational staff complete this briefing within five business days.');
    } else {
      lines.push('This change has been classified as standard impact. Ensure all relevant');
      lines.push('staff complete this briefing within the current training cycle.');
    }

    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');
    lines.push('For review by the MLRO.');
    lines.push('');

    // Mark briefing as generated
    change.briefingGenerated = true;
    await this.save();

    return lines.join('\n');
  }

  // ---- Alert management -----------------------------------------------

  /**
   * Get all unread MLRO alerts.
   *
   * @returns {Promise<Array<MLROAlert>>}
   */
  async getUnreadAlerts() {
    await this.load();
    return this.alerts.filter(a => !a.read);
  }

  /**
   * Mark an alert as read.
   *
   * @param {string} alertId
   * @returns {Promise<boolean>}
   */
  async markAlertRead(alertId) {
    await this.load();
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;
    alert.read = true;
    await this.save();
    return true;
  }

  /**
   * Acknowledge a detected change.
   *
   * @param {string} changeId
   * @param {string} acknowledgedBy - Name of the person acknowledging
   * @returns {Promise<boolean>}
   */
  async acknowledgeChange(changeId, acknowledgedBy) {
    await this.load();
    const change = this.changes.find(c => c.id === changeId);
    if (!change) return false;

    change.acknowledged = true;
    change.acknowledgedBy = acknowledgedBy;
    change.acknowledgedAt = new Date().toISOString();

    await this.save();
    return true;
  }

  // ---- Manual change registration -------------------------------------

  /**
   * Manually register a regulatory change that was identified outside
   * the automated monitoring system (e.g. through manual review or
   * external notification).
   *
   * @param {object} params
   * @param {string} params.sourceName - Name of the regulatory source
   * @param {string} params.sourceCategory - One of SOURCE_CATEGORIES
   * @param {string} params.changeType - One of CHANGE_TYPES
   * @param {string} params.impactLevel - One of IMPACT_LEVELS
   * @param {string} params.summary - Description of the change
   * @param {Array<string>} [params.affectedControls] - Control areas affected
   * @returns {Promise<DetectedChange>}
   */
  async registerManualChange(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.sourceName || typeof params.sourceName !== 'string') {
      throw new Error('params.sourceName is required');
    }

    const validCategories = Object.values(SOURCE_CATEGORIES);
    if (!validCategories.includes(params.sourceCategory)) {
      throw new Error(`params.sourceCategory must be one of: ${validCategories.join(', ')}`);
    }

    const validTypes = Object.values(CHANGE_TYPES);
    if (!validTypes.includes(params.changeType)) {
      throw new Error(`params.changeType must be one of: ${validTypes.join(', ')}`);
    }

    const validLevels = Object.values(IMPACT_LEVELS);
    if (!validLevels.includes(params.impactLevel)) {
      throw new Error(`params.impactLevel must be one of: ${validLevels.join(', ')}`);
    }

    const id = `CHG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    /** @type {DetectedChange} */
    const change = {
      id,
      sourceId: 'manual',
      sourceName: params.sourceName,
      sourceCategory: params.sourceCategory,
      changeType: params.changeType,
      impactLevel: params.impactLevel,
      previousHash: 'N/A',
      currentHash: 'N/A',
      summary: params.summary,
      affectedControls: params.affectedControls || ['internal_controls', 'staff_training'],
      alerts: [],
      briefingGenerated: false,
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      detectedAt: new Date().toISOString(),
    };

    this.changes.push(change);

    const alert = this._generateAlert(change);
    if (alert !== null) {
      this.alerts.push(alert);
      change.alerts.push(alert);
    }

    await this.save();
    return change;
  }

  // ---- Change history -------------------------------------------------

  /**
   * Get detected changes, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.sourceCategory]
   * @param {string} [filters.changeType]
   * @param {string} [filters.impactLevel]
   * @param {boolean} [filters.unacknowledgedOnly]
   * @param {string} [filters.since] - ISO timestamp
   * @param {number} [filters.limit]
   * @returns {Promise<Array<DetectedChange>>}
   */
  async getChanges(filters = {}) {
    await this.load();

    let results = [...this.changes];

    if (filters.sourceCategory) {
      results = results.filter(c => c.sourceCategory === filters.sourceCategory);
    }
    if (filters.changeType) {
      results = results.filter(c => c.changeType === filters.changeType);
    }
    if (filters.impactLevel) {
      results = results.filter(c => c.impactLevel === filters.impactLevel);
    }
    if (filters.unacknowledgedOnly) {
      results = results.filter(c => !c.acknowledged);
    }
    if (filters.since) {
      results = results.filter(c => c.detectedAt >= filters.since);
    }

    // Sort by detection date descending
    results.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  // ---- Statistics -----------------------------------------------------

  /**
   * Compute monitoring statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const sources = [...this.sources.values()];
    const byCategory = {};
    for (const cat of Object.values(SOURCE_CATEGORIES)) {
      byCategory[cat] = {
        sources: sources.filter(s => s.category === cat).length,
        changes: this.changes.filter(c => c.sourceCategory === cat).length,
      };
    }

    const byImpact = {};
    for (const level of Object.values(IMPACT_LEVELS)) {
      byImpact[level] = this.changes.filter(c => c.impactLevel === level).length;
    }

    const byType = {};
    for (const type of Object.values(CHANGE_TYPES)) {
      byType[type] = this.changes.filter(c => c.changeType === type).length;
    }

    return {
      totalSources: sources.length,
      enabledSources: sources.filter(s => s.enabled).length,
      totalChanges: this.changes.length,
      unacknowledgedChanges: this.changes.filter(c => !c.acknowledged).length,
      totalAlerts: this.alerts.length,
      unreadAlerts: this.alerts.filter(a => !a.read).length,
      briefingsGenerated: this.changes.filter(c => c.briefingGenerated).length,
      byCategory,
      byImpact,
      byType,
    };
  }
}

export { CONTROL_AREAS };
