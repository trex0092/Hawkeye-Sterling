/**
 * Corrective Action Tracking.
 *
 * Tracks audit findings from initial identification through assignment,
 * implementation, verification, and closure. Each corrective action is
 * linked to the original audit finding and carries a severity-based SLA
 * for timely resolution.
 *
 * Action lifecycle:
 *
 *   IDENTIFIED -> ASSIGNED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED -> CLOSED
 *
 * SLA windows per severity:
 *   - critical: 7 calendar days
 *   - high:    14 calendar days
 *   - medium:  30 calendar days
 *   - low:     90 calendar days
 *
 * Features:
 *   - Full lifecycle management with state transition validation
 *   - Overdue detection against severity SLA
 *   - Reminder generation for approaching and overdue actions
 *   - Link to originating audit finding ID
 *   - Evidence attachment for verification
 *   - Statistics: open by severity, overdue count, avg resolution days
 *   - JSON register persistence
 *   - Plain-text report generation
 *
 * Reference: Federal Decree-Law No. 10/2025 (compliance programme
 * obligations for DNFBPs).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Action lifecycle states. */
export const ACTION_STATES = Object.freeze({
  IDENTIFIED:   'IDENTIFIED',
  ASSIGNED:     'ASSIGNED',
  IN_PROGRESS:  'IN_PROGRESS',
  IMPLEMENTED:  'IMPLEMENTED',
  VERIFIED:     'VERIFIED',
  CLOSED:       'CLOSED',
});

/** Valid forward transitions. */
export const ACTION_TRANSITIONS = Object.freeze({
  [ACTION_STATES.IDENTIFIED]:  [ACTION_STATES.ASSIGNED],
  [ACTION_STATES.ASSIGNED]:    [ACTION_STATES.IN_PROGRESS],
  [ACTION_STATES.IN_PROGRESS]: [ACTION_STATES.IMPLEMENTED],
  [ACTION_STATES.IMPLEMENTED]: [ACTION_STATES.VERIFIED, ACTION_STATES.IN_PROGRESS],
  [ACTION_STATES.VERIFIED]:    [ACTION_STATES.CLOSED],
  [ACTION_STATES.CLOSED]:      [],
});

/** Severity levels. */
export const SEVERITIES = Object.freeze({
  CRITICAL: 'critical',
  HIGH:     'high',
  MEDIUM:   'medium',
  LOW:      'low',
});

/** SLA in calendar days per severity. */
export const SLA_DAYS = Object.freeze({
  [SEVERITIES.CRITICAL]: 7,
  [SEVERITIES.HIGH]:     14,
  [SEVERITIES.MEDIUM]:   30,
  [SEVERITIES.LOW]:      90,
});

/** Finding source types. */
export const SOURCES = Object.freeze({
  AUDIT:           'audit',
  INSPECTION:      'inspection',
  SELF_ASSESSMENT: 'self-assessment',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
 * Add calendar days to a date.
 *
 * @param {Date} d
 * @param {number} days
 * @returns {Date}
 */
function addDays(d, days) {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/* ------------------------------------------------------------------ */
/*  CorrectiveActionTracker                                            */
/* ------------------------------------------------------------------ */

export class CorrectiveActionTracker {
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
    this.actions = new Map();

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
        for (const action of raw.actions || []) {
          this.actions.set(action.id, action);
        }
      } catch (err) {
        throw new Error(`Failed to load corrective action register: ${err.message}`);
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
      actions: [...this.actions.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Action creation --------------------------------------------- */

  /**
   * Create a new corrective action from an audit finding.
   *
   * @param {object} params
   * @param {string} params.finding       - Description of the finding
   * @param {string} params.source        - One of SOURCES values (audit/inspection/self-assessment)
   * @param {string} params.severity      - One of SEVERITIES values
   * @param {string} params.findingId     - Originating audit finding ID
   * @param {string} [params.assignee]    - Person or team responsible
   * @param {string} [params.dueDate]     - Override SLA due date (YYYY-MM-DD)
   * @param {string} [params.createdBy]   - Actor creating the action
   * @param {string} [params.notes]       - Additional context
   * @returns {Promise<object>} The created action record
   */
  async create(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.finding || typeof params.finding !== 'string') {
      throw new Error('params.finding is required and must be a string');
    }
    if (!params.source || !Object.values(SOURCES).includes(params.source)) {
      throw new Error(`params.source must be one of: ${Object.values(SOURCES).join(', ')}`);
    }
    if (!params.severity || !Object.values(SEVERITIES).includes(params.severity)) {
      throw new Error(`params.severity must be one of: ${Object.values(SEVERITIES).join(', ')}`);
    }
    if (!params.findingId || typeof params.findingId !== 'string') {
      throw new Error('params.findingId is required and must be a string');
    }

    const id = `CA-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const createdDate = fmtDate(new Date());
    const slaDays = SLA_DAYS[params.severity];
    const dueDate = params.dueDate || fmtDate(addDays(parseDate(createdDate), slaDays));

    const initialState = params.assignee
      ? ACTION_STATES.ASSIGNED
      : ACTION_STATES.IDENTIFIED;

    const record = {
      id,
      finding: params.finding,
      source: params.source,
      severity: params.severity,
      findingId: params.findingId,
      assignee: params.assignee || null,
      dueDate,
      slaDays,
      state: initialState,
      evidence: [],
      verifiedBy: null,
      verifiedAt: null,
      closedAt: null,
      notes: params.notes || '',
      createdBy: params.createdBy || 'system',
      createdAt: now,
      updatedAt: now,
      history: [{
        from: null,
        to: initialState,
        actor: params.createdBy || 'system',
        timestamp: now,
        note: params.assignee
          ? `Action identified and assigned to ${params.assignee}`
          : 'Action identified from audit finding',
      }],
    };

    this.actions.set(id, record);
    await this.save();
    return record;
  }

  /* ---- State transitions ------------------------------------------- */

  /**
   * Transition an action to a new lifecycle state.
   *
   * @param {string} actionId  - Action identifier
   * @param {string} newState  - Target state from ACTION_STATES
   * @param {string} actor     - Who is performing the transition
   * @param {string} [note]    - Reason or notes
   * @returns {Promise<object>} Updated action record
   */
  async transition(actionId, newState, actor, note) {
    await this.load();

    const record = this.actions.get(actionId);
    if (!record) {
      throw new Error(`Corrective action not found: ${actionId}`);
    }
    if (!Object.values(ACTION_STATES).includes(newState)) {
      throw new Error(`Unknown state: ${newState}`);
    }

    const allowed = ACTION_TRANSITIONS[record.state];
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
      actor,
      timestamp: now,
      note: note || '',
    });

    record.state = newState;
    record.updatedAt = now;

    if (newState === ACTION_STATES.VERIFIED) {
      record.verifiedBy = actor;
      record.verifiedAt = now;
    }

    if (newState === ACTION_STATES.CLOSED) {
      record.closedAt = now;
    }

    await this.save();
    return record;
  }

  /* ---- Assignment -------------------------------------------------- */

  /**
   * Assign or reassign an action to a responsible party.
   *
   * @param {string} actionId  - Action identifier
   * @param {string} assignee  - Person or team
   * @param {string} actor     - Who is performing the assignment
   * @returns {Promise<object>} Updated action record
   */
  async assign(actionId, assignee, actor) {
    await this.load();

    const record = this.actions.get(actionId);
    if (!record) {
      throw new Error(`Corrective action not found: ${actionId}`);
    }
    if (!assignee || typeof assignee !== 'string') {
      throw new Error('assignee is required and must be a string');
    }

    const previousAssignee = record.assignee;
    record.assignee = assignee;
    record.updatedAt = new Date().toISOString();

    const noteText = previousAssignee
      ? `Reassigned from ${previousAssignee} to ${assignee}`
      : `Assigned to ${assignee}`;

    record.history.push({
      from: record.state,
      to: record.state,
      actor,
      timestamp: record.updatedAt,
      note: noteText,
    });

    // Auto-transition from IDENTIFIED to ASSIGNED if not already past that
    if (record.state === ACTION_STATES.IDENTIFIED) {
      record.state = ACTION_STATES.ASSIGNED;
      record.history.push({
        from: ACTION_STATES.IDENTIFIED,
        to: ACTION_STATES.ASSIGNED,
        actor,
        timestamp: record.updatedAt,
        note: 'Auto-transitioned on assignment',
      });
    }

    await this.save();
    return record;
  }

  /* ---- Evidence ---------------------------------------------------- */

  /**
   * Attach evidence to a corrective action (for verification).
   *
   * @param {string} actionId  - Action identifier
   * @param {object} evidence
   * @param {string} evidence.description - What the evidence demonstrates
   * @param {string} evidence.reference   - Document path or reference ID
   * @param {string} evidence.addedBy     - Who attached the evidence
   * @returns {Promise<object>} The evidence entry
   */
  async addEvidence(actionId, evidence) {
    await this.load();

    const record = this.actions.get(actionId);
    if (!record) {
      throw new Error(`Corrective action not found: ${actionId}`);
    }
    if (!evidence || !evidence.description) {
      throw new Error('evidence.description is required');
    }
    if (!evidence.addedBy) {
      throw new Error('evidence.addedBy is required');
    }

    const entry = {
      id: `EV-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      description: evidence.description,
      reference: evidence.reference || null,
      addedBy: evidence.addedBy,
      addedAt: new Date().toISOString(),
    };

    record.evidence.push(entry);
    record.updatedAt = entry.addedAt;
    record.history.push({
      from: record.state,
      to: record.state,
      actor: evidence.addedBy,
      timestamp: entry.addedAt,
      note: `Evidence attached: ${evidence.description}`,
    });

    await this.save();
    return entry;
  }

  /* ---- Retrieval --------------------------------------------------- */

  /**
   * Get a single action by ID.
   *
   * @param {string} actionId
   * @returns {Promise<object|null>}
   */
  async get(actionId) {
    await this.load();
    return this.actions.get(actionId) || null;
  }

  /**
   * List actions with optional filters.
   *
   * @param {object} [filter]
   * @param {string} [filter.state]     - Filter by state
   * @param {string} [filter.severity]  - Filter by severity
   * @param {string} [filter.source]    - Filter by source
   * @param {string} [filter.assignee]  - Filter by assignee
   * @param {string} [filter.findingId] - Filter by originating finding ID
   * @param {boolean} [filter.overdue]  - If true, return only overdue actions
   * @returns {Promise<object[]>}
   */
  async list(filter = {}) {
    await this.load();

    let results = [...this.actions.values()];

    if (filter.state) {
      results = results.filter(a => a.state === filter.state);
    }
    if (filter.severity) {
      results = results.filter(a => a.severity === filter.severity);
    }
    if (filter.source) {
      results = results.filter(a => a.source === filter.source);
    }
    if (filter.assignee) {
      results = results.filter(a => a.assignee === filter.assignee);
    }
    if (filter.findingId) {
      results = results.filter(a => a.findingId === filter.findingId);
    }

    const now = new Date();
    for (const a of results) {
      a._overdue = isOverdue(a, now);
    }

    if (filter.overdue === true) {
      results = results.filter(a => a._overdue);
    }

    // Sort by severity (critical first), then by due date
    const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
    results.sort((a, b) => {
      const sa = severityOrder[a.severity] || 99;
      const sb = severityOrder[b.severity] || 99;
      if (sa !== sb) return sa - sb;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    return results;
  }

  /* ---- Overdue detection ------------------------------------------- */

  /**
   * Return all overdue corrective actions.
   *
   * @returns {Promise<object[]>}
   */
  async getOverdue() {
    return this.list({ overdue: true });
  }

  /* ---- Reminder generation ----------------------------------------- */

  /**
   * Generate reminders for actions approaching or past their SLA deadline.
   *
   * @param {object} [options]
   * @param {number} [options.warningDays] - Days before due date to warn (default: 3)
   * @returns {Promise<object[]>} Array of reminder objects
   */
  async generateReminders(options = {}) {
    await this.load();

    const warningDays = options.warningDays ?? 3;
    const now = new Date();
    const reminders = [];
    const terminalStates = [ACTION_STATES.VERIFIED, ACTION_STATES.CLOSED];

    for (const action of this.actions.values()) {
      if (terminalStates.includes(action.state)) continue;
      if (!action.dueDate) continue;

      const dueDt = parseDate(action.dueDate);
      const daysRemaining = Math.ceil((dueDt.getTime() - now.getTime()) / MS_PER_DAY);

      if (daysRemaining < 0) {
        reminders.push({
          actionId: action.id,
          severity: action.severity,
          assignee: action.assignee,
          finding: action.finding,
          dueDate: action.dueDate,
          daysOverdue: Math.abs(daysRemaining),
          type: 'OVERDUE',
          message: `Corrective action ${action.id} is ${Math.abs(daysRemaining)} day(s) overdue. Severity: ${action.severity}. Assignee: ${action.assignee || 'unassigned'}.`,
        });
      } else if (daysRemaining <= warningDays) {
        reminders.push({
          actionId: action.id,
          severity: action.severity,
          assignee: action.assignee,
          finding: action.finding,
          dueDate: action.dueDate,
          daysRemaining,
          type: 'WARNING',
          message: `Corrective action ${action.id} is due in ${daysRemaining} day(s). Severity: ${action.severity}. Assignee: ${action.assignee || 'unassigned'}.`,
        });
      }
    }

    // Sort: overdue first, then by days remaining/overdue
    reminders.sort((a, b) => {
      if (a.type === 'OVERDUE' && b.type !== 'OVERDUE') return -1;
      if (a.type !== 'OVERDUE' && b.type === 'OVERDUE') return 1;
      if (a.type === 'OVERDUE') return (b.daysOverdue || 0) - (a.daysOverdue || 0);
      return (a.daysRemaining || 0) - (b.daysRemaining || 0);
    });

    return reminders;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute corrective action statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const all = [...this.actions.values()];
    const now = new Date();
    const terminalStates = [ACTION_STATES.VERIFIED, ACTION_STATES.CLOSED];

    const openActions = all.filter(a => !terminalStates.includes(a.state));
    const closedActions = all.filter(a => terminalStates.includes(a.state));

    // Open by severity
    const openBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of openActions) {
      if (openBySeverity[a.severity] !== undefined) {
        openBySeverity[a.severity]++;
      }
    }

    // Open by state
    const openByState = {};
    for (const s of Object.values(ACTION_STATES)) {
      openByState[s] = 0;
    }
    for (const a of all) {
      openByState[a.state] = (openByState[a.state] || 0) + 1;
    }

    // Overdue count
    let overdueCount = 0;
    for (const a of openActions) {
      if (isOverdue(a, now)) overdueCount++;
    }

    // Average resolution days for closed actions
    let totalResolutionMs = 0;
    let resolvedCount = 0;
    for (const a of closedActions) {
      if (a.closedAt && a.createdAt) {
        totalResolutionMs += new Date(a.closedAt).getTime() - new Date(a.createdAt).getTime();
        resolvedCount++;
      }
    }
    const avgResolutionDays = resolvedCount > 0
      ? Math.round((totalResolutionMs / resolvedCount / MS_PER_DAY) * 10) / 10
      : 0;

    // By source
    const bySource = {};
    for (const s of Object.values(SOURCES)) {
      bySource[s] = all.filter(a => a.source === s).length;
    }

    return {
      totalActions: all.length,
      openActions: openActions.length,
      closedActions: closedActions.length,
      openBySeverity,
      openByState,
      overdueCount,
      avgResolutionDays,
      bySource,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text corrective action report.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @returns {Promise<string>}
   */
  async generateReport(options = {}) {
    const entityName = options.entityName || 'the Reporting Entity';
    const now = new Date();
    const stats = await this.statistics();
    const overdue = await this.getOverdue();
    const reminders = await this.generateReminders();

    const lines = [];
    lines.push('========================================================================');
    lines.push('CORRECTIVE ACTION TRACKING REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Statistics
    lines.push('SUMMARY STATISTICS');
    lines.push('');
    lines.push(`Total actions:           ${stats.totalActions}`);
    lines.push(`Open actions:            ${stats.openActions}`);
    lines.push(`Closed/verified:         ${stats.closedActions}`);
    lines.push(`Overdue:                 ${stats.overdueCount}`);
    lines.push(`Avg resolution (days):   ${stats.avgResolutionDays}`);
    lines.push('');

    lines.push('OPEN BY SEVERITY');
    lines.push('');
    for (const [sev, count] of Object.entries(stats.openBySeverity)) {
      const sla = SLA_DAYS[sev];
      lines.push(`  ${sev.toUpperCase().padEnd(10)} ${String(count).padStart(4)}  (SLA: ${sla} days)`);
    }
    lines.push('');

    lines.push('BY SOURCE');
    lines.push('');
    for (const [src, count] of Object.entries(stats.bySource)) {
      lines.push(`  ${src.padEnd(18)} ${count}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Overdue actions
    lines.push('OVERDUE ACTIONS');
    lines.push('');
    if (overdue.length === 0) {
      lines.push('No overdue corrective actions.');
    } else {
      for (const a of overdue) {
        const daysOver = Math.ceil((now.getTime() - parseDate(a.dueDate).getTime()) / MS_PER_DAY);
        lines.push(`  [${a.severity.toUpperCase()}] ${a.id}`);
        lines.push(`    Finding:   ${a.finding}`);
        lines.push(`    Assignee:  ${a.assignee || 'Unassigned'}`);
        lines.push(`    Due:       ${a.dueDate} (${daysOver} day(s) overdue)`);
        lines.push(`    State:     ${a.state}`);
        lines.push(`    Source:    ${a.source} (Finding: ${a.findingId})`);
        lines.push('');
      }
    }
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Reminders
    lines.push('ACTIVE REMINDERS');
    lines.push('');
    if (reminders.length === 0) {
      lines.push('No active reminders.');
    } else {
      for (const r of reminders) {
        lines.push(`  [${r.type}] ${r.message}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // All open actions
    const openActions = await this.list();
    const nonTerminal = openActions.filter(a =>
      a.state !== ACTION_STATES.VERIFIED && a.state !== ACTION_STATES.CLOSED
    );

    lines.push(`ALL OPEN ACTIONS (${nonTerminal.length})`);
    lines.push('');
    if (nonTerminal.length === 0) {
      lines.push('No open corrective actions.');
    } else {
      for (const a of nonTerminal) {
        const overdueFlag = a._overdue ? ' [OVERDUE]' : '';
        lines.push(`  ${a.id} [${a.severity.toUpperCase()}] ${a.state}${overdueFlag}`);
        lines.push(`    ${a.finding}`);
        lines.push(`    Assignee: ${a.assignee || 'Unassigned'} | Due: ${a.dueDate} | Source: ${a.source}`);
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Determine whether an action has exceeded its SLA deadline.
 *
 * @param {object} record - Action record
 * @param {Date} [now]    - Reference date
 * @returns {boolean}
 */
function isOverdue(record, now = new Date()) {
  const terminalStates = [ACTION_STATES.VERIFIED, ACTION_STATES.CLOSED];
  if (terminalStates.includes(record.state)) return false;
  if (!record.dueDate) return false;
  return parseDate(record.dueDate).getTime() < now.getTime();
}
