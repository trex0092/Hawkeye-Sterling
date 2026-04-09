/**
 * Anonymous Whistleblower Reporting Channel.
 *
 * Provides a secure, anonymous mechanism for reporting AML/CFT concerns,
 * sanctions breaches, fraud, misconduct, and sourcing irregularities.
 * No personal data is stored; reporters interact using a unique tracking
 * ID only.
 *
 * Report lifecycle:
 *
 *   RECEIVED -> ACKNOWLEDGED -> UNDER_INVESTIGATION -> RESOLVED -> ARCHIVED
 *
 * Triage priority:
 *   - P1: Sanctions evasion, terrorist financing
 *   - P2: Money laundering, fraud
 *   - P3: Misconduct, policy breach
 *   - P4: Other concerns
 *
 * Tamper evidence: each report is hashed (SHA-256) at creation. The
 * integrity hash covers the tracking ID, category, description, and
 * creation timestamp. Any subsequent modification is recorded in the
 * audit trail but the original hash is preserved for comparison.
 *
 * MLRO notification is triggered automatically for P1 and P2 reports.
 *
 * References:
 *   - OECD Due Diligence Guidance, Step 1 (grievance mechanism)
 *   - LBMA Responsible Gold Guidance v9
 *   - Federal Decree-Law No. 10/2025 (internal reporting obligations)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Report categories. */
export const CATEGORIES = Object.freeze({
  AML_CONCERN:       'aml_concern',
  SANCTIONS_BREACH:  'sanctions_breach',
  FRAUD:             'fraud',
  MISCONDUCT:        'misconduct',
  SOURCING_CONCERN:  'sourcing_concern',
  OTHER:             'other',
});

/** Report lifecycle states. */
export const REPORT_STATES = Object.freeze({
  RECEIVED:             'RECEIVED',
  ACKNOWLEDGED:         'ACKNOWLEDGED',
  UNDER_INVESTIGATION:  'UNDER_INVESTIGATION',
  RESOLVED:             'RESOLVED',
  ARCHIVED:             'ARCHIVED',
});

/** Valid state transitions. */
export const REPORT_TRANSITIONS = Object.freeze({
  [REPORT_STATES.RECEIVED]:            [REPORT_STATES.ACKNOWLEDGED],
  [REPORT_STATES.ACKNOWLEDGED]:        [REPORT_STATES.UNDER_INVESTIGATION],
  [REPORT_STATES.UNDER_INVESTIGATION]: [REPORT_STATES.RESOLVED],
  [REPORT_STATES.RESOLVED]:            [REPORT_STATES.ARCHIVED],
  [REPORT_STATES.ARCHIVED]:            [],
});

/** Triage priority mapping by category. */
export const TRIAGE_PRIORITY = Object.freeze({
  [CATEGORIES.SANCTIONS_BREACH]:  'P1',
  [CATEGORIES.AML_CONCERN]:       'P2',
  [CATEGORIES.FRAUD]:             'P2',
  [CATEGORIES.MISCONDUCT]:        'P3',
  [CATEGORIES.SOURCING_CONCERN]:  'P3',
  [CATEGORIES.OTHER]:             'P4',
});

/** Priority labels. */
export const PRIORITY_LABELS = Object.freeze({
  P1: 'Critical (sanctions/TF)',
  P2: 'High (ML/fraud)',
  P3: 'Medium (misconduct)',
  P4: 'Low (other)',
});

/** Categories that require immediate MLRO notification. */
const MLRO_NOTIFY_PRIORITIES = Object.freeze(['P1', 'P2']);

/* ------------------------------------------------------------------ */
/*  Hashing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute a SHA-256 integrity hash for a report at creation.
 *
 * @param {object} params
 * @param {string} params.trackingId
 * @param {string} params.category
 * @param {string} params.description
 * @param {string} params.createdAt
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeIntegrityHash(params) {
  const payload = [
    params.trackingId,
    params.category,
    params.description,
    params.createdAt,
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ */
/*  Date utility                                                       */
/* ------------------------------------------------------------------ */

/**
 * Format a Date as YYYY-MM-DD.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/* ------------------------------------------------------------------ */
/*  WhistleblowerChannel                                               */
/* ------------------------------------------------------------------ */

export class WhistleblowerChannel {
  /**
   * @param {string} registerPath - Absolute path to the JSON register file.
   */
  constructor(registerPath) {
    if (!registerPath || typeof registerPath !== 'string') {
      throw new Error('registerPath is required and must be a string');
    }

    /** @type {string} */
    this.registerPath = registerPath;

    /** @type {Map<string, object>} */
    this.reports = new Map();

    /** @type {object[]} */
    this.mlroNotifications = [];

    /** @private */
    this._loaded = false;
  }

  /* ---- Persistence ------------------------------------------------- */

  /**
   * Load the register from disk. Safe to call multiple times.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.registerPath)) {
      try {
        const raw = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const report of raw.reports || []) {
          this.reports.set(report.trackingId, report);
        }
        this.mlroNotifications = raw.mlroNotifications || [];
      } catch (err) {
        throw new Error(`Failed to load whistleblower register: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist the register to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      reports: [...this.reports.values()],
      mlroNotifications: this.mlroNotifications,
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Report submission ------------------------------------------- */

  /**
   * Submit an anonymous whistleblower report.
   *
   * No personal data is stored. The reporter receives a tracking ID
   * that can be used to check status anonymously.
   *
   * @param {object} params
   * @param {string} params.category     - One of CATEGORIES values
   * @param {string} params.description  - Detailed description of the concern
   * @param {string[]} [params.evidenceRefs] - Optional document or reference IDs
   * @returns {Promise<object>} Object with trackingId for the reporter and the full record
   */
  async submitReport(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.category || !Object.values(CATEGORIES).includes(params.category)) {
      throw new Error(`params.category must be one of: ${Object.values(CATEGORIES).join(', ')}`);
    }
    if (!params.description || typeof params.description !== 'string') {
      throw new Error('params.description is required and must be a string');
    }

    const trackingId = `WB-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const priority = TRIAGE_PRIORITY[params.category];

    const integrityHash = computeIntegrityHash({
      trackingId,
      category: params.category,
      description: params.description,
      createdAt: now,
    });

    const record = {
      trackingId,
      category: params.category,
      description: params.description,
      evidenceRefs: Array.isArray(params.evidenceRefs) ? [...params.evidenceRefs] : [],
      priority,
      state: REPORT_STATES.RECEIVED,
      integrityHash,
      resolution: null,
      investigationNotes: [],
      createdAt: now,
      updatedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      archivedAt: null,
      history: [{
        from: null,
        to: REPORT_STATES.RECEIVED,
        timestamp: now,
        note: `Anonymous report received. Priority: ${priority} (${PRIORITY_LABELS[priority]}).`,
      }],
    };

    this.reports.set(trackingId, record);

    // Trigger MLRO notification for P1/P2
    if (MLRO_NOTIFY_PRIORITIES.includes(priority)) {
      const notification = {
        id: `NOTIFY-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        trackingId,
        priority,
        category: params.category,
        message: `Whistleblower report ${trackingId} requires immediate MLRO attention. Priority: ${priority} (${PRIORITY_LABELS[priority]}). Category: ${params.category}.`,
        createdAt: now,
        acknowledged: false,
      };
      this.mlroNotifications.push(notification);
    }

    await this.save();

    return {
      trackingId,
      priority,
      mlroNotified: MLRO_NOTIFY_PRIORITIES.includes(priority),
      record,
    };
  }

  /* ---- State transitions ------------------------------------------- */

  /**
   * Transition a report to a new lifecycle state.
   *
   * @param {string} trackingId - Report tracking ID
   * @param {string} newState   - Target state from REPORT_STATES
   * @param {string} [note]     - Notes for the transition
   * @returns {Promise<object>} Updated report record
   */
  async transition(trackingId, newState, note) {
    await this.load();

    const record = this.reports.get(trackingId);
    if (!record) {
      throw new Error(`Report not found: ${trackingId}`);
    }
    if (!Object.values(REPORT_STATES).includes(newState)) {
      throw new Error(`Unknown state: ${newState}`);
    }

    const allowed = REPORT_TRANSITIONS[record.state];
    if (!allowed || !allowed.includes(newState)) {
      throw new Error(
        `Invalid transition: ${record.state} -> ${newState}. ` +
        `Allowed: ${(allowed || []).join(', ') || 'none (terminal state)'}`
      );
    }

    const now = new Date().toISOString();
    record.history.push({
      from: record.state,
      to: newState,
      timestamp: now,
      note: note || '',
    });

    record.state = newState;
    record.updatedAt = now;

    if (newState === REPORT_STATES.ACKNOWLEDGED) {
      record.acknowledgedAt = now;
    }
    if (newState === REPORT_STATES.RESOLVED) {
      record.resolvedAt = now;
      record.resolution = note || null;
    }
    if (newState === REPORT_STATES.ARCHIVED) {
      record.archivedAt = now;
    }

    await this.save();
    return record;
  }

  /* ---- Investigation notes ----------------------------------------- */

  /**
   * Add an investigation note to a report.
   *
   * @param {string} trackingId - Report tracking ID
   * @param {string} noteText   - Note content
   * @returns {Promise<object>} The note entry
   */
  async addInvestigationNote(trackingId, noteText) {
    await this.load();

    const record = this.reports.get(trackingId);
    if (!record) {
      throw new Error(`Report not found: ${trackingId}`);
    }
    if (!noteText || typeof noteText !== 'string') {
      throw new Error('noteText is required and must be a string');
    }

    const entry = {
      id: `NOTE-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      text: noteText,
      addedAt: new Date().toISOString(),
    };

    record.investigationNotes.push(entry);
    record.updatedAt = entry.addedAt;

    await this.save();
    return entry;
  }

  /* ---- Anonymous status check -------------------------------------- */

  /**
   * Check the status of a report using only the tracking ID.
   * Returns minimal information to protect investigation integrity.
   *
   * @param {string} trackingId - Report tracking ID
   * @returns {Promise<object|null>} Status object or null if not found
   */
  async checkStatus(trackingId) {
    await this.load();

    const record = this.reports.get(trackingId);
    if (!record) return null;

    return {
      trackingId: record.trackingId,
      state: record.state,
      priority: record.priority,
      receivedAt: record.createdAt,
      acknowledgedAt: record.acknowledgedAt,
      resolvedAt: record.resolvedAt,
      resolution: record.state === REPORT_STATES.RESOLVED || record.state === REPORT_STATES.ARCHIVED
        ? record.resolution
        : null,
    };
  }

  /* ---- Integrity verification -------------------------------------- */

  /**
   * Verify the tamper-evidence hash of a report.
   *
   * @param {string} trackingId - Report tracking ID
   * @returns {Promise<object>} Verification result
   */
  async verifyIntegrity(trackingId) {
    await this.load();

    const record = this.reports.get(trackingId);
    if (!record) {
      throw new Error(`Report not found: ${trackingId}`);
    }

    const recomputedHash = computeIntegrityHash({
      trackingId: record.trackingId,
      category: record.category,
      description: record.description,
      createdAt: record.createdAt,
    });

    const valid = recomputedHash === record.integrityHash;

    return {
      trackingId: record.trackingId,
      storedHash: record.integrityHash,
      computedHash: recomputedHash,
      valid,
      message: valid
        ? 'Integrity check passed. Report has not been tampered with.'
        : 'INTEGRITY CHECK FAILED. Report may have been altered after submission.',
    };
  }

  /* ---- MLRO notifications ------------------------------------------ */

  /**
   * Get all pending (unacknowledged) MLRO notifications.
   *
   * @returns {Promise<object[]>}
   */
  async getPendingNotifications() {
    await this.load();
    return this.mlroNotifications.filter(n => !n.acknowledged);
  }

  /**
   * Acknowledge an MLRO notification.
   *
   * @param {string} notificationId - Notification ID
   * @returns {Promise<object>} Updated notification
   */
  async acknowledgeNotification(notificationId) {
    await this.load();

    const notification = this.mlroNotifications.find(n => n.id === notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    notification.acknowledged = true;
    notification.acknowledgedAt = new Date().toISOString();

    await this.save();
    return notification;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute whistleblower report statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const all = [...this.reports.values()];

    // By state
    const byState = {};
    for (const s of Object.values(REPORT_STATES)) {
      byState[s] = 0;
    }
    for (const r of all) {
      byState[r.state] = (byState[r.state] || 0) + 1;
    }

    // By category
    const byCategory = {};
    for (const c of Object.values(CATEGORIES)) {
      byCategory[c] = 0;
    }
    for (const r of all) {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }

    // By priority
    const byPriority = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const r of all) {
      if (byPriority[r.priority] !== undefined) {
        byPriority[r.priority]++;
      }
    }

    // Average time to acknowledge (ms)
    const acknowledgedReports = all.filter(r => r.acknowledgedAt !== null);
    let avgAcknowledgeMs = 0;
    if (acknowledgedReports.length > 0) {
      const totalMs = acknowledgedReports.reduce((sum, r) => {
        return sum + (new Date(r.acknowledgedAt).getTime() - new Date(r.createdAt).getTime());
      }, 0);
      avgAcknowledgeMs = totalMs / acknowledgedReports.length;
    }

    // Average time to resolve (ms)
    const resolvedReports = all.filter(r => r.resolvedAt !== null);
    let avgResolveMs = 0;
    if (resolvedReports.length > 0) {
      const totalMs = resolvedReports.reduce((sum, r) => {
        return sum + (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime());
      }, 0);
      avgResolveMs = totalMs / resolvedReports.length;
    }

    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    return {
      totalReports: all.length,
      byState,
      byCategory,
      byPriority,
      pendingNotifications: this.mlroNotifications.filter(n => !n.acknowledged).length,
      avgAcknowledgeDays: acknowledgedReports.length > 0
        ? Math.round((avgAcknowledgeMs / MS_PER_DAY) * 10) / 10
        : 0,
      avgResolveDays: resolvedReports.length > 0
        ? Math.round((avgResolveMs / MS_PER_DAY) * 10) / 10
        : 0,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text whistleblower channel report.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @returns {Promise<string>}
   */
  async generateReport(options = {}) {
    const entityName = options.entityName || 'the Reporting Entity';
    const now = new Date();
    const stats = await this.statistics();
    const pending = await this.getPendingNotifications();

    const lines = [];
    lines.push('========================================================================');
    lines.push('ANONYMOUS WHISTLEBLOWER REPORTING CHANNEL REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push(`Guidance refs:       OECD DDG Step 1; LBMA RGG v9`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Statistics
    lines.push('SUMMARY STATISTICS');
    lines.push('');
    lines.push(`Total reports:               ${stats.totalReports}`);
    lines.push(`Avg time to acknowledge:     ${stats.avgAcknowledgeDays} day(s)`);
    lines.push(`Avg time to resolve:         ${stats.avgResolveDays} day(s)`);
    lines.push(`Pending MLRO notifications:  ${stats.pendingNotifications}`);
    lines.push('');

    lines.push('BY STATE');
    lines.push('');
    for (const [state, count] of Object.entries(stats.byState)) {
      lines.push(`  ${state.padEnd(24)} ${count}`);
    }
    lines.push('');

    lines.push('BY PRIORITY');
    lines.push('');
    for (const [pri, count] of Object.entries(stats.byPriority)) {
      lines.push(`  ${pri} (${PRIORITY_LABELS[pri]}): ${count}`);
    }
    lines.push('');

    lines.push('BY CATEGORY');
    lines.push('');
    for (const [cat, count] of Object.entries(stats.byCategory)) {
      lines.push(`  ${cat.padEnd(22)} ${count}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Pending MLRO notifications
    lines.push('PENDING MLRO NOTIFICATIONS');
    lines.push('');
    if (pending.length === 0) {
      lines.push('No pending MLRO notifications.');
    } else {
      for (const n of pending) {
        lines.push(`  [${n.priority}] ${n.message}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Active reports (non-archived)
    const active = [...this.reports.values()].filter(
      r => r.state !== REPORT_STATES.ARCHIVED
    );
    lines.push(`ACTIVE REPORTS (${active.length})`);
    lines.push('');
    if (active.length === 0) {
      lines.push('No active reports.');
    } else {
      for (const r of active) {
        lines.push(`  ${r.trackingId} [${r.priority}] ${r.state}`);
        lines.push(`    Category: ${r.category} | Received: ${r.createdAt.split('T')[0]}`);
      }
    }
    lines.push('');
    lines.push('========================================================================');
    lines.push('');
    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }
}
