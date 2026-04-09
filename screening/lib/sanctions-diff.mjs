/**
 * Sanctions List Diff Viewer.
 *
 * Compares two snapshots of the sanctions store to show what changed
 * between list refreshes. Identifies entities that were ADDED, REMOVED,
 * or MODIFIED (name, country, or programme changes). When current
 * counterparties are affected by newly added entries, alerts are
 * generated for immediate compliance review.
 *
 * Features:
 *   - Side-by-side snapshot comparison
 *   - Diff output: ADDED, REMOVED, MODIFIED with field-level detail
 *   - Risk impact assessment against current counterparty list
 *   - Alert generation for counterparty matches on new entries
 *   - Historical diff archive (per refresh date)
 *   - Plain-text report export
 *
 * Reference: FATF Recommendation 6 (targeted financial sanctions).
 * Legal basis: Federal Decree-Law No. 10/2025 (TFS obligations).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Change types. */
export const CHANGE_TYPES = Object.freeze({
  ADDED:    'ADDED',
  REMOVED:  'REMOVED',
  MODIFIED: 'MODIFIED',
});

/** Fields tracked for modification detection. */
const TRACKED_FIELDS = Object.freeze(['name', 'country', 'programme', 'aliases', 'type']);

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
/*  Comparison logic                                                   */
/* ------------------------------------------------------------------ */

/**
 * Normalise an entity record for comparison purposes.
 * Ensures arrays are sorted and strings are trimmed.
 *
 * @param {object} entity
 * @returns {object} Normalised copy
 */
function normalise(entity) {
  const result = { ...entity };
  if (Array.isArray(result.aliases)) {
    result.aliases = [...result.aliases].sort();
  }
  if (typeof result.name === 'string') {
    result.name = result.name.trim();
  }
  if (typeof result.country === 'string') {
    result.country = result.country.trim();
  }
  if (typeof result.programme === 'string') {
    result.programme = result.programme.trim();
  }
  return result;
}

/**
 * Detect field-level changes between two entity records.
 *
 * @param {object} oldEntity - Entity from the previous snapshot
 * @param {object} newEntity - Entity from the current snapshot
 * @returns {object[]} Array of changed fields with old and new values
 */
function detectFieldChanges(oldEntity, newEntity) {
  const oldNorm = normalise(oldEntity);
  const newNorm = normalise(newEntity);
  const changes = [];

  for (const field of TRACKED_FIELDS) {
    const oldVal = oldNorm[field];
    const newVal = newNorm[field];

    if (oldVal === undefined && newVal === undefined) continue;

    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '');
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '');

    if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
      });
    }
  }

  return changes;
}

/* ------------------------------------------------------------------ */
/*  SanctionsDiffViewer                                                */
/* ------------------------------------------------------------------ */

export class SanctionsDiffViewer {
  /**
   * @param {string} registerPath - Absolute path to the JSON register file
   *                                for storing diff history.
   */
  constructor(registerPath) {
    if (!registerPath || typeof registerPath !== 'string') {
      throw new Error('registerPath is required and must be a string');
    }

    /** @type {string} */
    this.registerPath = registerPath;

    /** @type {Map<string, object>} */
    this.diffs = new Map();

    /** @type {Map<string, object>} */
    this.alerts = new Map();

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
        for (const diff of raw.diffs || []) {
          this.diffs.set(diff.id, diff);
        }
        for (const alert of raw.alerts || []) {
          this.alerts.set(alert.id, alert);
        }
      } catch (err) {
        throw new Error(`Failed to load sanctions diff register: ${err.message}`);
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
      diffs: [...this.diffs.values()],
      alerts: [...this.alerts.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Snapshot comparison ----------------------------------------- */

  /**
   * Compare two sanctions list snapshots and produce a diff.
   *
   * Each snapshot is an array of entity objects. Each entity must have
   * at minimum an `id` field (the sanctions list entry identifier) and
   * a `name` field.
   *
   * @param {object} params
   * @param {object[]} params.previousSnapshot - Entities from the previous refresh
   * @param {object[]} params.currentSnapshot  - Entities from the current refresh
   * @param {string} [params.listName]         - Name of the sanctions list
   * @param {string} [params.refreshDate]      - Date of the current refresh (YYYY-MM-DD)
   * @returns {Promise<object>} Diff result with added, removed, modified arrays
   */
  async compare(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!Array.isArray(params.previousSnapshot)) {
      throw new Error('params.previousSnapshot must be an array');
    }
    if (!Array.isArray(params.currentSnapshot)) {
      throw new Error('params.currentSnapshot must be an array');
    }

    const prevMap = new Map();
    for (const entity of params.previousSnapshot) {
      if (!entity.id) {
        throw new Error('Each entity in previousSnapshot must have an id field');
      }
      prevMap.set(entity.id, entity);
    }

    const currMap = new Map();
    for (const entity of params.currentSnapshot) {
      if (!entity.id) {
        throw new Error('Each entity in currentSnapshot must have an id field');
      }
      currMap.set(entity.id, entity);
    }

    const added = [];
    const removed = [];
    const modified = [];

    // Detect ADDED and MODIFIED
    for (const [id, currEntity] of currMap) {
      const prevEntity = prevMap.get(id);
      if (!prevEntity) {
        added.push({
          entityId: id,
          entity: currEntity,
          changeType: CHANGE_TYPES.ADDED,
        });
      } else {
        const fieldChanges = detectFieldChanges(prevEntity, currEntity);
        if (fieldChanges.length > 0) {
          modified.push({
            entityId: id,
            previousEntity: prevEntity,
            currentEntity: currEntity,
            changeType: CHANGE_TYPES.MODIFIED,
            fieldChanges,
          });
        }
      }
    }

    // Detect REMOVED
    for (const [id, prevEntity] of prevMap) {
      if (!currMap.has(id)) {
        removed.push({
          entityId: id,
          entity: prevEntity,
          changeType: CHANGE_TYPES.REMOVED,
        });
      }
    }

    const diffId = `DIFF-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const refreshDate = params.refreshDate || fmtDate(new Date());

    const diffRecord = {
      id: diffId,
      listName: params.listName || 'Unknown List',
      refreshDate,
      previousCount: params.previousSnapshot.length,
      currentCount: params.currentSnapshot.length,
      added,
      removed,
      modified,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
        totalChanges: added.length + removed.length + modified.length,
      },
      createdAt: now,
    };

    this.diffs.set(diffId, diffRecord);
    await this.save();

    return diffRecord;
  }

  /* ---- Risk impact assessment -------------------------------------- */

  /**
   * Assess the risk impact of a diff against current counterparties.
   * Checks if any newly added or modified entities match names in the
   * counterparty list.
   *
   * @param {string} diffId            - Diff record ID
   * @param {object[]} counterparties  - Array of counterparty objects with at least `name` and optionally `id`
   * @returns {Promise<object>} Impact assessment with affected counterparties
   */
  async assessImpact(diffId, counterparties) {
    await this.load();

    const diff = this.diffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff not found: ${diffId}`);
    }
    if (!Array.isArray(counterparties)) {
      throw new Error('counterparties must be an array');
    }

    const affectedCounterparties = [];

    // Build a set of newly added/modified entity names for matching
    const newEntities = [
      ...diff.added.map(a => a.entity),
      ...diff.modified.map(m => m.currentEntity),
    ];

    for (const counterparty of counterparties) {
      if (!counterparty.name) continue;
      const cpNameLower = counterparty.name.toLowerCase().trim();

      for (const entity of newEntities) {
        const entityNameLower = (entity.name || '').toLowerCase().trim();
        const entityAliases = (entity.aliases || []).map(a => a.toLowerCase().trim());

        const nameMatch = cpNameLower === entityNameLower ||
          entityNameLower.includes(cpNameLower) ||
          cpNameLower.includes(entityNameLower);
        const aliasMatch = entityAliases.some(
          alias => alias === cpNameLower || alias.includes(cpNameLower) || cpNameLower.includes(alias)
        );

        if (nameMatch || aliasMatch) {
          affectedCounterparties.push({
            counterpartyName: counterparty.name,
            counterpartyId: counterparty.id || null,
            matchedEntityId: entity.id,
            matchedEntityName: entity.name,
            matchType: nameMatch ? 'name' : 'alias',
            programme: entity.programme || null,
          });
        }
      }
    }

    return {
      diffId,
      listName: diff.listName,
      refreshDate: diff.refreshDate,
      totalChanges: diff.summary.totalChanges,
      counterpartiesScreened: counterparties.length,
      affectedCounterparties,
      affectedCount: affectedCounterparties.length,
      riskLevel: affectedCounterparties.length > 0 ? 'HIGH' : 'NONE',
      assessedAt: new Date().toISOString(),
    };
  }

  /* ---- Alert generation -------------------------------------------- */

  /**
   * Generate alerts for counterparties matching newly added entities.
   *
   * @param {string} diffId            - Diff record ID
   * @param {object[]} counterparties  - Array of counterparty objects
   * @returns {Promise<object[]>} Array of generated alert objects
   */
  async generateAlerts(diffId, counterparties) {
    const impact = await this.assessImpact(diffId, counterparties);
    const generatedAlerts = [];

    for (const affected of impact.affectedCounterparties) {
      const alertId = `ALERT-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const alert = {
        id: alertId,
        diffId,
        listName: impact.listName,
        refreshDate: impact.refreshDate,
        counterpartyName: affected.counterpartyName,
        counterpartyId: affected.counterpartyId,
        matchedEntityId: affected.matchedEntityId,
        matchedEntityName: affected.matchedEntityName,
        matchType: affected.matchType,
        programme: affected.programme,
        severity: 'critical',
        status: 'open',
        message: `Counterparty "${affected.counterpartyName}" matches newly listed entity "${affected.matchedEntityName}" (${affected.matchedEntityId}) on ${impact.listName}. Immediate review required.`,
        createdAt: now,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      };

      this.alerts.set(alertId, alert);
      generatedAlerts.push(alert);
    }

    if (generatedAlerts.length > 0) {
      await this.save();
    }

    return generatedAlerts;
  }

  /**
   * Resolve an alert.
   *
   * @param {string} alertId    - Alert identifier
   * @param {string} resolvedBy - Who resolved the alert
   * @param {string} resolution - Resolution description
   * @returns {Promise<object>} Updated alert
   */
  async resolveAlert(alertId, resolvedBy, resolution) {
    await this.load();

    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }
    if (!resolvedBy) {
      throw new Error('resolvedBy is required');
    }
    if (!resolution) {
      throw new Error('resolution is required');
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = resolvedBy;
    alert.resolution = resolution;

    await this.save();
    return alert;
  }

  /**
   * Get all open (unresolved) alerts.
   *
   * @returns {Promise<object[]>}
   */
  async getOpenAlerts() {
    await this.load();
    return [...this.alerts.values()].filter(a => a.status === 'open');
  }

  /* ---- Retrieval --------------------------------------------------- */

  /**
   * Get a diff record by ID.
   *
   * @param {string} diffId
   * @returns {Promise<object|null>}
   */
  async getDiff(diffId) {
    await this.load();
    return this.diffs.get(diffId) || null;
  }

  /**
   * List all diffs in the archive, sorted by refresh date (most recent first).
   *
   * @returns {Promise<object[]>}
   */
  async listDiffs() {
    await this.load();
    const results = [...this.diffs.values()];
    results.sort((a, b) => (b.refreshDate || '').localeCompare(a.refreshDate || ''));
    return results;
  }

  /**
   * Get a diff by refresh date.
   *
   * @param {string} refreshDate - YYYY-MM-DD
   * @returns {Promise<object|null>}
   */
  async getDiffByDate(refreshDate) {
    await this.load();
    for (const diff of this.diffs.values()) {
      if (diff.refreshDate === refreshDate) {
        return diff;
      }
    }
    return null;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute sanctions diff statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const allDiffs = [...this.diffs.values()];
    const allAlerts = [...this.alerts.values()];

    let totalAdded = 0;
    let totalRemoved = 0;
    let totalModified = 0;
    for (const d of allDiffs) {
      totalAdded += d.summary.addedCount;
      totalRemoved += d.summary.removedCount;
      totalModified += d.summary.modifiedCount;
    }

    const openAlerts = allAlerts.filter(a => a.status === 'open').length;
    const resolvedAlerts = allAlerts.filter(a => a.status === 'resolved').length;

    return {
      totalDiffs: allDiffs.length,
      totalAdded,
      totalRemoved,
      totalModified,
      totalAlerts: allAlerts.length,
      openAlerts,
      resolvedAlerts,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text diff report for a specific diff.
   *
   * @param {string} diffId
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @returns {Promise<string>}
   */
  async generateDiffReport(diffId, options = {}) {
    await this.load();

    const diff = this.diffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff not found: ${diffId}`);
    }

    const entityName = options.entityName || 'the Reporting Entity';
    const now = new Date();

    const lines = [];
    lines.push('========================================================================');
    lines.push('SANCTIONS LIST DIFF REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`List:                ${diff.listName}`);
    lines.push(`Refresh date:        ${diff.refreshDate}`);
    lines.push(`Previous count:      ${diff.previousCount}`);
    lines.push(`Current count:       ${diff.currentCount}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push(`Reference:           FATF Rec. 6`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Summary
    lines.push('CHANGE SUMMARY');
    lines.push('');
    lines.push(`Entities added:      ${diff.summary.addedCount}`);
    lines.push(`Entities removed:    ${diff.summary.removedCount}`);
    lines.push(`Entities modified:   ${diff.summary.modifiedCount}`);
    lines.push(`Total changes:       ${diff.summary.totalChanges}`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Added entities
    lines.push(`ADDED ENTITIES (${diff.added.length})`);
    lines.push('');
    if (diff.added.length === 0) {
      lines.push('No entities added.');
    } else {
      for (const entry of diff.added) {
        const e = entry.entity;
        lines.push(`  [+] ${e.name || 'Unknown'} (${entry.entityId})`);
        if (e.country) lines.push(`      Country:   ${e.country}`);
        if (e.programme) lines.push(`      Programme: ${e.programme}`);
        if (e.aliases && e.aliases.length > 0) {
          lines.push(`      Aliases:   ${e.aliases.join('; ')}`);
        }
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Removed entities
    lines.push(`REMOVED ENTITIES (${diff.removed.length})`);
    lines.push('');
    if (diff.removed.length === 0) {
      lines.push('No entities removed.');
    } else {
      for (const entry of diff.removed) {
        const e = entry.entity;
        lines.push(`  [-] ${e.name || 'Unknown'} (${entry.entityId})`);
        if (e.country) lines.push(`      Country:   ${e.country}`);
        if (e.programme) lines.push(`      Programme: ${e.programme}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Modified entities
    lines.push(`MODIFIED ENTITIES (${diff.modified.length})`);
    lines.push('');
    if (diff.modified.length === 0) {
      lines.push('No entities modified.');
    } else {
      for (const entry of diff.modified) {
        lines.push(`  [~] ${entry.currentEntity.name || 'Unknown'} (${entry.entityId})`);
        for (const change of entry.fieldChanges) {
          const oldVal = Array.isArray(change.oldValue)
            ? change.oldValue.join('; ')
            : String(change.oldValue ?? 'N/A');
          const newVal = Array.isArray(change.newValue)
            ? change.newValue.join('; ')
            : String(change.newValue ?? 'N/A');
          lines.push(`      ${change.field}: "${oldVal}" -> "${newVal}"`);
        }
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Open alerts for this diff
    const relatedAlerts = [...this.alerts.values()].filter(a => a.diffId === diffId);
    lines.push(`COUNTERPARTY ALERTS (${relatedAlerts.length})`);
    lines.push('');
    if (relatedAlerts.length === 0) {
      lines.push('No counterparty alerts generated for this refresh.');
    } else {
      for (const alert of relatedAlerts) {
        const statusLabel = alert.status === 'open' ? '[OPEN]' : '[RESOLVED]';
        lines.push(`  ${statusLabel} ${alert.id}`);
        lines.push(`    ${alert.message}`);
        if (alert.resolution) {
          lines.push(`    Resolution: ${alert.resolution} (by ${alert.resolvedBy})`);
        }
      }
    }
    lines.push('');
    lines.push('========================================================================');
    lines.push('');
    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate a summary report across all historical diffs.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @returns {Promise<string>}
   */
  async generateSummaryReport(options = {}) {
    const entityName = options.entityName || 'the Reporting Entity';
    const now = new Date();
    const stats = await this.statistics();
    const allDiffs = await this.listDiffs();
    const openAlerts = await this.getOpenAlerts();

    const lines = [];
    lines.push('========================================================================');
    lines.push('SANCTIONS LIST MONITORING SUMMARY REPORT');
    lines.push('========================================================================');
    lines.push('');

    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push(`Reference:           FATF Rec. 6`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    lines.push('AGGREGATE STATISTICS');
    lines.push('');
    lines.push(`Total list refreshes:    ${stats.totalDiffs}`);
    lines.push(`Total entities added:    ${stats.totalAdded}`);
    lines.push(`Total entities removed:  ${stats.totalRemoved}`);
    lines.push(`Total entities modified: ${stats.totalModified}`);
    lines.push(`Total alerts generated:  ${stats.totalAlerts}`);
    lines.push(`Open alerts:             ${stats.openAlerts}`);
    lines.push(`Resolved alerts:         ${stats.resolvedAlerts}`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Refresh history
    lines.push(`REFRESH HISTORY (${allDiffs.length})`);
    lines.push('');
    if (allDiffs.length === 0) {
      lines.push('No sanctions list refreshes recorded.');
    } else {
      for (const d of allDiffs) {
        lines.push(`  ${d.refreshDate} | ${d.listName} | +${d.summary.addedCount} -${d.summary.removedCount} ~${d.summary.modifiedCount}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Open alerts
    lines.push(`OPEN ALERTS (${openAlerts.length})`);
    lines.push('');
    if (openAlerts.length === 0) {
      lines.push('No open counterparty alerts.');
    } else {
      for (const alert of openAlerts) {
        lines.push(`  [${alert.severity.toUpperCase()}] ${alert.id}`);
        lines.push(`    ${alert.message}`);
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
