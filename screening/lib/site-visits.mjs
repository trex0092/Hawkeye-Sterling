/**
 * Supplier Site Visit Program.
 *
 * Manages the scheduling, execution, and tracking of supplier site visits
 * as part of the due diligence obligations for a Dealer in Precious Metals
 * and Stones. Visit frequency is determined by the supplier's risk rating,
 * and findings from visits feed into the corrective action tracking system.
 *
 * Visit types:
 *   - initial_onboarding: First visit before establishing a relationship
 *   - periodic_review:    Scheduled recurring visit based on risk rating
 *   - triggered:          Ad-hoc visit in response to a risk event
 *   - unannounced:        Surprise visit without prior notification
 *
 * Visit schedule by risk rating:
 *   - high:   annual   (every 12 months)
 *   - medium: biennial (every 24 months)
 *   - low:    triennial (every 36 months)
 *
 * Each visit type has a standardised checklist of 10-15 verification items.
 *
 * References:
 *   - OECD Due Diligence Guidance, Step 4 (carry out independent third-party
 *     audits of supply chain due diligence)
 *   - LBMA Responsible Gold Guidance
 *   - Federal Decree-Law No. 10/2025 (CDD obligations for DNFBPs)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Visit types. */
export const VISIT_TYPES = Object.freeze({
  INITIAL_ONBOARDING: 'initial_onboarding',
  PERIODIC_REVIEW:    'periodic_review',
  TRIGGERED:          'triggered',
  UNANNOUNCED:        'unannounced',
});

/** Supplier risk ratings. */
export const RISK_RATINGS = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
});

/** Visit frequency in months per risk rating. */
export const VISIT_FREQUENCY_MONTHS = Object.freeze({
  [RISK_RATINGS.HIGH]:   12,
  [RISK_RATINGS.MEDIUM]: 24,
  [RISK_RATINGS.LOW]:    36,
});

/** Visit status. */
export const VISIT_STATUS = Object.freeze({
  SCHEDULED:  'SCHEDULED',
  IN_PROGRESS:'IN_PROGRESS',
  COMPLETED:  'COMPLETED',
  CANCELLED:  'CANCELLED',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Checklists                                                         */
/* ------------------------------------------------------------------ */

/** Checklist items per visit type. */
export const CHECKLISTS = Object.freeze({
  [VISIT_TYPES.INITIAL_ONBOARDING]: [
    { id: 'IO-01', item: 'Valid trade licence verified and recorded' },
    { id: 'IO-02', item: 'Physical premises exist at registered address' },
    { id: 'IO-03', item: 'Ownership structure matches CDD documentation' },
    { id: 'IO-04', item: 'Key personnel identified and present on site' },
    { id: 'IO-05', item: 'Business records and accounting systems available' },
    { id: 'IO-06', item: 'Inventory management system in place' },
    { id: 'IO-07', item: 'Physical security measures adequate (safe, CCTV, access control)' },
    { id: 'IO-08', item: 'AML/CFT policy documentation available on site' },
    { id: 'IO-09', item: 'Source of goods documentation verifiable' },
    { id: 'IO-10', item: 'No indicators of shell company or front operation' },
    { id: 'IO-11', item: 'Transport and logistics arrangements documented' },
    { id: 'IO-12', item: 'Banking relationships confirmed and consistent with declared activity' },
    { id: 'IO-13', item: 'Environmental and labour practices appear acceptable' },
  ],
  [VISIT_TYPES.PERIODIC_REVIEW]: [
    { id: 'PR-01', item: 'Trade licence remains valid and current' },
    { id: 'PR-02', item: 'Premises condition unchanged or improved since last visit' },
    { id: 'PR-03', item: 'Staff present and consistent with business scale' },
    { id: 'PR-04', item: 'Business records available and up to date' },
    { id: 'PR-05', item: 'Inventory consistent with reported transaction volumes' },
    { id: 'PR-06', item: 'Security measures maintained and operational' },
    { id: 'PR-07', item: 'AML controls observed and functioning' },
    { id: 'PR-08', item: 'Source of goods documentation current' },
    { id: 'PR-09', item: 'No adverse media or reputational indicators observed' },
    { id: 'PR-10', item: 'Previous corrective actions addressed' },
    { id: 'PR-11', item: 'Changes in ownership or management identified and documented' },
    { id: 'PR-12', item: 'Compliance training records for supplier staff reviewed' },
  ],
  [VISIT_TYPES.TRIGGERED]: [
    { id: 'TR-01', item: 'Triggering risk event documented and understood' },
    { id: 'TR-02', item: 'Relevant records and documentation requested and reviewed' },
    { id: 'TR-03', item: 'Personnel involved in the event interviewed' },
    { id: 'TR-04', item: 'Physical evidence (inventory, premises) inspected' },
    { id: 'TR-05', item: 'Explanation provided is consistent with available evidence' },
    { id: 'TR-06', item: 'Transaction trail reviewed for anomalies' },
    { id: 'TR-07', item: 'Third-party relationships examined' },
    { id: 'TR-08', item: 'Red flags assessed (structuring, layering, commingling)' },
    { id: 'TR-09', item: 'Corrective action plan discussed if deficiencies found' },
    { id: 'TR-10', item: 'Follow-up actions and timeline agreed' },
    { id: 'TR-11', item: 'Risk rating reviewed and updated if warranted' },
  ],
  [VISIT_TYPES.UNANNOUNCED]: [
    { id: 'UA-01', item: 'Premises accessible and operating normally at time of arrival' },
    { id: 'UA-02', item: 'Key personnel available without prior arrangement' },
    { id: 'UA-03', item: 'Business activity observed is consistent with declared nature' },
    { id: 'UA-04', item: 'Records available without extended preparation time' },
    { id: 'UA-05', item: 'Physical inventory spot-checked against records' },
    { id: 'UA-06', item: 'Security measures in active use (not just for inspections)' },
    { id: 'UA-07', item: 'AML controls functioning in normal operations' },
    { id: 'UA-08', item: 'No undeclared activities or persons observed on premises' },
    { id: 'UA-09', item: 'Storage areas inspected without advance cleanup' },
    { id: 'UA-10', item: 'Staff awareness of AML obligations assessed informally' },
    { id: 'UA-11', item: 'Transport and receiving areas inspected' },
    { id: 'UA-12', item: 'General housekeeping and record organisation observed' },
    { id: 'UA-13', item: 'Environmental conditions and worker safety observed' },
    { id: 'UA-14', item: 'Cooperation level and transparency noted' },
    { id: 'UA-15', item: 'Overall impression documented for comparison with formal visits' },
  ],
});

/* ------------------------------------------------------------------ */
/*  Date utilities                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse a YYYY-MM-DD string into a Date at midnight UTC.
 *
 * @param {string} dateStr
 * @returns {Date}
 */
function parseDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

/**
 * Format a Date as YYYY-MM-DD.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Add calendar months to a date.
 *
 * @param {Date} d
 * @param {number} months
 * @returns {Date}
 */
function addMonths(d, months) {
  const result = new Date(d.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/* ------------------------------------------------------------------ */
/*  SiteVisitManager                                                   */
/* ------------------------------------------------------------------ */

export class SiteVisitManager {
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
    this.visits = new Map();

    /** @type {Map<string, object>} */
    this.suppliers = new Map();

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
        for (const visit of raw.visits || []) {
          this.visits.set(visit.id, visit);
        }
        for (const supplier of raw.suppliers || []) {
          this.suppliers.set(supplier.id, supplier);
        }
      } catch (err) {
        throw new Error(`Failed to load site visit register: ${err.message}`);
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
      visits: [...this.visits.values()],
      suppliers: [...this.suppliers.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Supplier management ----------------------------------------- */

  /**
   * Register a supplier in the visit programme.
   *
   * @param {object} params
   * @param {string} params.name        - Supplier name
   * @param {string} params.location    - Supplier location / address
   * @param {string} params.riskRating  - One of RISK_RATINGS values
   * @param {string} [params.id]        - Optional explicit ID
   * @param {string} [params.notes]     - Additional notes
   * @returns {Promise<object>} The supplier record
   */
  async registerSupplier(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required and must be a string');
    }
    if (!params.location || typeof params.location !== 'string') {
      throw new Error('params.location is required and must be a string');
    }
    if (!params.riskRating || !Object.values(RISK_RATINGS).includes(params.riskRating)) {
      throw new Error(`params.riskRating must be one of: ${Object.values(RISK_RATINGS).join(', ')}`);
    }

    const id = params.id || `SUP-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      name: params.name,
      location: params.location,
      riskRating: params.riskRating,
      notes: params.notes || '',
      active: true,
      registeredAt: now,
      updatedAt: now,
    };

    this.suppliers.set(id, record);
    await this.save();
    return record;
  }

  /**
   * Update a supplier's risk rating.
   *
   * @param {string} supplierId  - Supplier identifier
   * @param {string} riskRating  - New risk rating
   * @returns {Promise<object>} Updated supplier record
   */
  async updateRiskRating(supplierId, riskRating) {
    await this.load();

    const supplier = this.suppliers.get(supplierId);
    if (!supplier) {
      throw new Error(`Supplier not found: ${supplierId}`);
    }
    if (!Object.values(RISK_RATINGS).includes(riskRating)) {
      throw new Error(`riskRating must be one of: ${Object.values(RISK_RATINGS).join(', ')}`);
    }

    supplier.riskRating = riskRating;
    supplier.updatedAt = new Date().toISOString();

    await this.save();
    return supplier;
  }

  /* ---- Visit scheduling -------------------------------------------- */

  /**
   * Calculate the next visit due date for a supplier based on risk rating
   * and the date of the last completed visit.
   *
   * @param {string} supplierId - Supplier identifier
   * @returns {Promise<object>} Object with nextDueDate, frequencyMonths, lastVisitDate
   */
  async calculateNextVisitDue(supplierId) {
    await this.load();

    const supplier = this.suppliers.get(supplierId);
    if (!supplier) {
      throw new Error(`Supplier not found: ${supplierId}`);
    }

    const frequencyMonths = VISIT_FREQUENCY_MONTHS[supplier.riskRating];
    const completedVisits = [...this.visits.values()]
      .filter(v => v.supplierId === supplierId && v.status === VISIT_STATUS.COMPLETED)
      .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));

    const lastVisit = completedVisits.length > 0 ? completedVisits[0] : null;
    let nextDueDate;

    if (lastVisit && lastVisit.completedDate) {
      nextDueDate = fmtDate(addMonths(parseDate(lastVisit.completedDate), frequencyMonths));
    } else {
      // No completed visits; due immediately
      nextDueDate = fmtDate(new Date());
    }

    return {
      supplierId,
      supplierName: supplier.name,
      riskRating: supplier.riskRating,
      frequencyMonths,
      lastVisitDate: lastVisit ? lastVisit.completedDate : null,
      nextDueDate,
    };
  }

  /* ---- Visit creation ---------------------------------------------- */

  /**
   * Schedule a new site visit.
   *
   * @param {object} params
   * @param {string} params.supplierId   - Supplier identifier
   * @param {string} params.visitType    - One of VISIT_TYPES values
   * @param {string} params.scheduledDate - YYYY-MM-DD
   * @param {string} params.inspector    - Inspector name
   * @param {string} [params.location]   - Override supplier location
   * @param {string} [params.notes]      - Additional notes
   * @returns {Promise<object>} The visit record
   */
  async scheduleVisit(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.supplierId || typeof params.supplierId !== 'string') {
      throw new Error('params.supplierId is required');
    }
    if (!params.visitType || !Object.values(VISIT_TYPES).includes(params.visitType)) {
      throw new Error(`params.visitType must be one of: ${Object.values(VISIT_TYPES).join(', ')}`);
    }
    if (!params.scheduledDate || typeof params.scheduledDate !== 'string') {
      throw new Error('params.scheduledDate is required (YYYY-MM-DD)');
    }
    if (!params.inspector || typeof params.inspector !== 'string') {
      throw new Error('params.inspector is required');
    }

    parseDate(params.scheduledDate); // validate date

    const supplier = this.suppliers.get(params.supplierId);
    if (!supplier) {
      throw new Error(`Supplier not found: ${params.supplierId}`);
    }

    const id = `VISIT-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const checklist = (CHECKLISTS[params.visitType] || []).map(item => ({
      ...item,
      checked: false,
      notes: '',
    }));

    const record = {
      id,
      supplierId: params.supplierId,
      supplierName: supplier.name,
      visitType: params.visitType,
      scheduledDate: params.scheduledDate,
      completedDate: null,
      location: params.location || supplier.location,
      inspector: params.inspector,
      status: VISIT_STATUS.SCHEDULED,
      checklist,
      findings: [],
      photosCount: 0,
      documentsCollected: [],
      notes: params.notes || '',
      createdAt: now,
      updatedAt: now,
    };

    this.visits.set(id, record);
    await this.save();
    return record;
  }

  /* ---- Visit execution --------------------------------------------- */

  /**
   * Mark a visit as in progress.
   *
   * @param {string} visitId - Visit identifier
   * @returns {Promise<object>} Updated visit record
   */
  async startVisit(visitId) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (record.status !== VISIT_STATUS.SCHEDULED) {
      throw new Error(`Cannot start visit in state: ${record.status}`);
    }

    record.status = VISIT_STATUS.IN_PROGRESS;
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /**
   * Update a checklist item during a visit.
   *
   * @param {string} visitId      - Visit identifier
   * @param {string} checklistId  - Checklist item ID (e.g., "IO-01")
   * @param {boolean} checked     - Whether the item is verified
   * @param {string} [notes]      - Notes for the item
   * @returns {Promise<object>} Updated checklist item
   */
  async updateChecklistItem(visitId, checklistId, checked, notes) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }

    const item = record.checklist.find(c => c.id === checklistId);
    if (!item) {
      throw new Error(`Checklist item not found: ${checklistId}`);
    }

    item.checked = checked === true;
    if (notes !== undefined) {
      item.notes = notes;
    }
    record.updatedAt = new Date().toISOString();

    await this.save();
    return item;
  }

  /**
   * Record a finding during a visit.
   *
   * @param {string} visitId - Visit identifier
   * @param {object} finding
   * @param {string} finding.description   - Description of the finding
   * @param {string} finding.severity      - critical/high/medium/low
   * @param {string} [finding.checklistId] - Related checklist item ID
   * @param {string} [finding.recommendation] - Recommended corrective action
   * @returns {Promise<object>} The finding entry
   */
  async recordFinding(visitId, finding) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (!finding || !finding.description) {
      throw new Error('finding.description is required');
    }
    if (!finding.severity || !['critical', 'high', 'medium', 'low'].includes(finding.severity)) {
      throw new Error('finding.severity must be one of: critical, high, medium, low');
    }

    const entry = {
      id: `FIND-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      description: finding.description,
      severity: finding.severity,
      checklistId: finding.checklistId || null,
      recommendation: finding.recommendation || null,
      recordedAt: new Date().toISOString(),
    };

    record.findings.push(entry);
    record.updatedAt = entry.recordedAt;

    await this.save();
    return entry;
  }

  /**
   * Record photos taken during the visit.
   *
   * @param {string} visitId - Visit identifier
   * @param {number} count   - Number of photos taken
   * @returns {Promise<object>} Updated visit record
   */
  async recordPhotos(visitId, count) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (typeof count !== 'number' || count < 0) {
      throw new Error('count must be a non-negative number');
    }

    record.photosCount += count;
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /**
   * Record a document collected during the visit.
   *
   * @param {string} visitId   - Visit identifier
   * @param {string} document  - Document description or reference
   * @returns {Promise<object>} Updated visit record
   */
  async recordDocument(visitId, document) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (!document || typeof document !== 'string') {
      throw new Error('document description is required');
    }

    record.documentsCollected.push({
      description: document,
      collectedAt: new Date().toISOString(),
    });
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /**
   * Complete a visit.
   *
   * @param {string} visitId       - Visit identifier
   * @param {string} completedDate - YYYY-MM-DD completion date
   * @param {string} [notes]       - Summary notes
   * @returns {Promise<object>} Updated visit record
   */
  async completeVisit(visitId, completedDate, notes) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (record.status !== VISIT_STATUS.IN_PROGRESS && record.status !== VISIT_STATUS.SCHEDULED) {
      throw new Error(`Cannot complete visit in state: ${record.status}`);
    }
    if (!completedDate) {
      throw new Error('completedDate is required (YYYY-MM-DD)');
    }

    parseDate(completedDate); // validate

    record.status = VISIT_STATUS.COMPLETED;
    record.completedDate = completedDate;
    if (notes) {
      record.notes = record.notes
        ? record.notes + '\n' + notes
        : notes;
    }
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /**
   * Cancel a scheduled visit.
   *
   * @param {string} visitId - Visit identifier
   * @param {string} reason  - Cancellation reason
   * @returns {Promise<object>} Updated visit record
   */
  async cancelVisit(visitId, reason) {
    await this.load();

    const record = this.visits.get(visitId);
    if (!record) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (record.status === VISIT_STATUS.COMPLETED) {
      throw new Error('Cannot cancel a completed visit');
    }

    record.status = VISIT_STATUS.CANCELLED;
    record.notes = record.notes
      ? record.notes + '\nCancelled: ' + (reason || 'No reason provided')
      : 'Cancelled: ' + (reason || 'No reason provided');
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /* ---- Overdue detection ------------------------------------------- */

  /**
   * Detect suppliers with overdue visits.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<object[]>} Array of overdue supplier visit info
   */
  async getOverdueVisits(now = new Date()) {
    await this.load();

    const overdue = [];
    const activeSuppliers = [...this.suppliers.values()].filter(s => s.active);

    for (const supplier of activeSuppliers) {
      const schedule = await this.calculateNextVisitDue(supplier.id);
      const dueDt = parseDate(schedule.nextDueDate);

      if (dueDt.getTime() < now.getTime()) {
        const daysOverdue = Math.ceil((now.getTime() - dueDt.getTime()) / MS_PER_DAY);
        overdue.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          riskRating: supplier.riskRating,
          nextDueDate: schedule.nextDueDate,
          lastVisitDate: schedule.lastVisitDate,
          daysOverdue,
        });
      }
    }

    // Sort by days overdue descending
    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return overdue;
  }

  /* ---- Retrieval --------------------------------------------------- */

  /**
   * Get a single visit by ID.
   *
   * @param {string} visitId
   * @returns {Promise<object|null>}
   */
  async getVisit(visitId) {
    await this.load();
    return this.visits.get(visitId) || null;
  }

  /**
   * List visits with optional filters.
   *
   * @param {object} [filter]
   * @param {string} [filter.supplierId] - Filter by supplier
   * @param {string} [filter.visitType]  - Filter by visit type
   * @param {string} [filter.status]     - Filter by status
   * @param {string} [filter.inspector]  - Filter by inspector
   * @returns {Promise<object[]>}
   */
  async listVisits(filter = {}) {
    await this.load();

    let results = [...this.visits.values()];

    if (filter.supplierId) {
      results = results.filter(v => v.supplierId === filter.supplierId);
    }
    if (filter.visitType) {
      results = results.filter(v => v.visitType === filter.visitType);
    }
    if (filter.status) {
      results = results.filter(v => v.status === filter.status);
    }
    if (filter.inspector) {
      results = results.filter(v => v.inspector === filter.inspector);
    }

    results.sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));
    return results;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute site visit programme statistics.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<object>}
   */
  async statistics(now = new Date()) {
    await this.load();

    const allVisits = [...this.visits.values()];
    const completed = allVisits.filter(v => v.status === VISIT_STATUS.COMPLETED);
    const scheduled = allVisits.filter(v => v.status === VISIT_STATUS.SCHEDULED);
    const cancelled = allVisits.filter(v => v.status === VISIT_STATUS.CANCELLED);

    // Total findings across all completed visits
    let totalFindings = 0;
    const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const v of completed) {
      totalFindings += v.findings.length;
      for (const f of v.findings) {
        if (findingsBySeverity[f.severity] !== undefined) {
          findingsBySeverity[f.severity]++;
        }
      }
    }

    // By visit type
    const byType = {};
    for (const t of Object.values(VISIT_TYPES)) {
      byType[t] = allVisits.filter(v => v.visitType === t).length;
    }

    // Overdue suppliers
    const overdueList = await this.getOverdueVisits(now);

    return {
      totalVisits: allVisits.length,
      completedVisits: completed.length,
      scheduledVisits: scheduled.length,
      cancelledVisits: cancelled.length,
      totalFindings,
      findingsBySeverity,
      byType,
      overdueSuppliers: overdueList.length,
      totalSuppliers: [...this.suppliers.values()].filter(s => s.active).length,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text site visit programme report.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @param {Date}   [options.now]        - Reference date
   * @returns {Promise<string>}
   */
  async generateReport(options = {}) {
    const entityName = options.entityName || 'the Reporting Entity';
    const now = options.now || new Date();
    const stats = await this.statistics(now);
    const overdueList = await this.getOverdueVisits(now);

    const lines = [];
    lines.push('========================================================================');
    lines.push('SUPPLIER SITE VISIT PROGRAMME REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push(`Guidance refs:       OECD DDG Step 4; LBMA RGG`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Statistics
    lines.push('SUMMARY STATISTICS');
    lines.push('');
    lines.push(`Total suppliers:         ${stats.totalSuppliers}`);
    lines.push(`Total visits:            ${stats.totalVisits}`);
    lines.push(`Completed:               ${stats.completedVisits}`);
    lines.push(`Scheduled:               ${stats.scheduledVisits}`);
    lines.push(`Cancelled:               ${stats.cancelledVisits}`);
    lines.push(`Overdue suppliers:       ${stats.overdueSuppliers}`);
    lines.push(`Total findings:          ${stats.totalFindings}`);
    lines.push('');

    lines.push('FINDINGS BY SEVERITY');
    lines.push('');
    for (const [sev, count] of Object.entries(stats.findingsBySeverity)) {
      lines.push(`  ${sev.toUpperCase().padEnd(10)} ${count}`);
    }
    lines.push('');

    lines.push('VISITS BY TYPE');
    lines.push('');
    for (const [type, count] of Object.entries(stats.byType)) {
      lines.push(`  ${type.padEnd(22)} ${count}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Visit frequency reference
    lines.push('VISIT FREQUENCY BY RISK RATING');
    lines.push('');
    for (const [rating, months] of Object.entries(VISIT_FREQUENCY_MONTHS)) {
      lines.push(`  ${rating.toUpperCase().padEnd(10)} every ${months} months`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Overdue visits
    lines.push('OVERDUE SUPPLIER VISITS');
    lines.push('');
    if (overdueList.length === 0) {
      lines.push('No overdue supplier visits.');
    } else {
      for (const entry of overdueList) {
        lines.push(`  ${entry.supplierName} [${entry.riskRating.toUpperCase()}]`);
        lines.push(`    Due: ${entry.nextDueDate} (${entry.daysOverdue} day(s) overdue)`);
        lines.push(`    Last visit: ${entry.lastVisitDate || 'Never'}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Upcoming scheduled visits
    const scheduled = [...this.visits.values()]
      .filter(v => v.status === VISIT_STATUS.SCHEDULED)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    lines.push(`UPCOMING SCHEDULED VISITS (${scheduled.length})`);
    lines.push('');
    if (scheduled.length === 0) {
      lines.push('No scheduled visits.');
    } else {
      for (const v of scheduled) {
        lines.push(`  ${v.id} | ${v.supplierName} | ${v.visitType}`);
        lines.push(`    Date: ${v.scheduledDate} | Inspector: ${v.inspector}`);
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
