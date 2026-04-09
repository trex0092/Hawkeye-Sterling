/**
 * Investigation Case Management System.
 *
 * Manages the lifecycle of compliance investigation cases from initial
 * opening through evidence gathering, analyst review, MLRO decision,
 * and final disposition (closure or filing with the FIU).
 *
 * Case lifecycle:
 *
 *   OPEN -> INVESTIGATING -> EVIDENCE_GATHERING -> ANALYST_REVIEW -> MLRO_DECISION -> CLOSED
 *                                                                                  -> FILED
 *
 * Each case carries a priority (P1-P4) with an associated SLA. Overdue
 * cases are flagged automatically when queried.
 *
 * Storage follows the JSON-backed register pattern used by mlro-workflow.mjs.
 *
 * References: Federal Decree-Law No. 10/2025 (general reporting obligations).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Case lifecycle states. */
export const CASE_STATES = Object.freeze({
  OPEN:              'open',
  INVESTIGATING:     'investigating',
  EVIDENCE_GATHERING:'evidence_gathering',
  ANALYST_REVIEW:    'analyst_review',
  MLRO_DECISION:     'mlro_decision',
  CLOSED:            'closed',
  FILED:             'filed',
});

/** Valid state transitions. */
export const CASE_TRANSITIONS = Object.freeze({
  [CASE_STATES.OPEN]:              [CASE_STATES.INVESTIGATING, CASE_STATES.CLOSED],
  [CASE_STATES.INVESTIGATING]:     [CASE_STATES.EVIDENCE_GATHERING, CASE_STATES.CLOSED],
  [CASE_STATES.EVIDENCE_GATHERING]:[CASE_STATES.ANALYST_REVIEW, CASE_STATES.INVESTIGATING],
  [CASE_STATES.ANALYST_REVIEW]:    [CASE_STATES.MLRO_DECISION, CASE_STATES.EVIDENCE_GATHERING],
  [CASE_STATES.MLRO_DECISION]:     [CASE_STATES.CLOSED, CASE_STATES.FILED, CASE_STATES.EVIDENCE_GATHERING],
  [CASE_STATES.CLOSED]:            [],
  [CASE_STATES.FILED]:             [],
});

/** Priority definitions with SLA windows in milliseconds. */
export const PRIORITIES = Object.freeze({
  P1: { label: 'Critical',  slaDays: 1,  slaMs: 1  * 24 * 3600_000 },
  P2: { label: 'High',      slaDays: 3,  slaMs: 3  * 24 * 3600_000 },
  P3: { label: 'Medium',    slaDays: 7,  slaMs: 7  * 24 * 3600_000 },
  P4: { label: 'Low',       slaDays: 30, slaMs: 30 * 24 * 3600_000 },
});

/** Evidence entry types. */
export const EVIDENCE_TYPES = Object.freeze({
  NOTE:              'note',
  DOCUMENT:          'document',
  SCREENING_RESULT:  'screening_result',
  TRANSACTION:       'transaction',
  TIMELINE_EVENT:    'timeline_event',
});

/* ------------------------------------------------------------------ */
/*  CaseManager                                                        */
/* ------------------------------------------------------------------ */

export class CaseManager {
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
    this.cases = new Map();
    /** @private */
    this._loaded = false;
  }

  /* ---- Persistence ------------------------------------------------ */

  /**
   * Load the register from disk. Safe to call multiple times.
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.registerPath)) {
      try {
        const raw = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const c of raw.cases || []) {
          this.cases.set(c.id, c);
        }
      } catch (err) {
        throw new Error(`Failed to load case register: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist the register to disk.
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      cases: [...this.cases.values()],
    };
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Case creation ---------------------------------------------- */

  /**
   * Open a new investigation case.
   *
   * @param {object} params
   * @param {string} params.title       - Short description of the case
   * @param {string} params.priority    - P1 | P2 | P3 | P4
   * @param {string} params.createdBy   - Actor opening the case
   * @param {string} [params.entityName]   - Primary entity under investigation
   * @param {string} [params.entityId]     - Internal entity identifier
   * @param {string} [params.description]  - Extended narrative
   * @param {string[]} [params.screeningIds]  - Linked screening result IDs
   * @param {string[]} [params.filingIds]     - Linked filing IDs
   * @param {string[]} [params.transactionIds]- Linked transaction IDs
   * @returns {Promise<object>} The created case record
   */
  async create(params) {
    await this.load();

    if (!params || !params.title) {
      throw new Error('params.title is required');
    }
    if (!params.priority || !PRIORITIES[params.priority]) {
      throw new Error(`params.priority must be one of: ${Object.keys(PRIORITIES).join(', ')}`);
    }
    if (!params.createdBy) {
      throw new Error('params.createdBy is required');
    }

    const id = `CASE-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const slaDef = PRIORITIES[params.priority];
    const dueDate = new Date(Date.now() + slaDef.slaMs).toISOString();

    const record = {
      id,
      title: params.title,
      description: params.description || '',
      state: CASE_STATES.OPEN,
      priority: params.priority,

      /* Linked entities and artefacts */
      entityName: params.entityName || null,
      entityId: params.entityId || null,
      screeningIds: Array.isArray(params.screeningIds) ? [...params.screeningIds] : [],
      filingIds: Array.isArray(params.filingIds) ? [...params.filingIds] : [],
      transactionIds: Array.isArray(params.transactionIds) ? [...params.transactionIds] : [],

      /* Assignment */
      assignee: null,
      escalatedToMlro: false,

      /* SLA */
      dueDate,
      slaDays: slaDef.slaDays,

      /* Evidence chain */
      evidence: [],

      /* Linked cases */
      linkedCaseIds: [],

      /* Audit trail */
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      closureReason: null,
      history: [{
        from: null,
        to: CASE_STATES.OPEN,
        actor: params.createdBy,
        timestamp: now,
        note: 'Case opened',
      }],
    };

    this.cases.set(id, record);
    await this.save();
    return record;
  }

  /* ---- State transitions ------------------------------------------ */

  /**
   * Transition a case to a new lifecycle state.
   *
   * @param {string} caseId   - Case identifier
   * @param {string} newState - Target state from CASE_STATES
   * @param {string} actor    - Who is performing the transition
   * @param {string} note     - Reason or notes for the transition
   * @returns {Promise<object>} Updated case record
   * @throws {Error} If the transition is invalid
   */
  async transition(caseId, newState, actor, note) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);

    if (!Object.values(CASE_STATES).includes(newState)) {
      throw new Error(`Unknown state: ${newState}`);
    }

    const allowed = CASE_TRANSITIONS[record.state];
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

    if (newState === CASE_STATES.CLOSED || newState === CASE_STATES.FILED) {
      record.closedAt = now;
      record.closureReason = note || '';
    }

    await this.save();
    return record;
  }

  /* ---- Assignment ------------------------------------------------- */

  /**
   * Assign a case to an analyst.
   *
   * @param {string} caseId   - Case identifier
   * @param {string} assignee - Analyst name or ID
   * @param {string} actor    - Who is performing the assignment
   * @returns {Promise<object>} Updated case record
   */
  async assign(caseId, assignee, actor) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);
    if (!assignee) throw new Error('assignee is required');

    const previousAssignee = record.assignee;
    record.assignee = assignee;
    record.updatedAt = new Date().toISOString();
    record.history.push({
      from: record.state,
      to: record.state,
      actor,
      timestamp: record.updatedAt,
      note: previousAssignee
        ? `Reassigned from ${previousAssignee} to ${assignee}`
        : `Assigned to ${assignee}`,
    });

    await this.save();
    return record;
  }

  /**
   * Reassign a case to a different analyst.
   *
   * @param {string} caseId      - Case identifier
   * @param {string} newAssignee - New analyst name or ID
   * @param {string} actor       - Who is performing the reassignment
   * @param {string} [reason]    - Reason for reassignment
   * @returns {Promise<object>} Updated case record
   */
  async reassign(caseId, newAssignee, actor, reason) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);
    if (!newAssignee) throw new Error('newAssignee is required');
    if (!record.assignee) {
      throw new Error(`Case ${caseId} has no current assignee. Use assign() instead.`);
    }

    const previousAssignee = record.assignee;
    record.assignee = newAssignee;
    record.updatedAt = new Date().toISOString();
    record.history.push({
      from: record.state,
      to: record.state,
      actor,
      timestamp: record.updatedAt,
      note: `Reassigned from ${previousAssignee} to ${newAssignee}` +
            (reason ? `: ${reason}` : ''),
    });

    await this.save();
    return record;
  }

  /**
   * Escalate a case to the MLRO.
   *
   * @param {string} caseId - Case identifier
   * @param {string} actor  - Who is escalating
   * @param {string} reason - Reason for escalation
   * @returns {Promise<object>} Updated case record
   */
  async escalateToMlro(caseId, actor, reason) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);
    if (!reason) throw new Error('reason is required for MLRO escalation');

    record.escalatedToMlro = true;
    record.updatedAt = new Date().toISOString();
    record.history.push({
      from: record.state,
      to: record.state,
      actor,
      timestamp: record.updatedAt,
      note: `Escalated to MLRO: ${reason}`,
    });

    await this.save();
    return record;
  }

  /* ---- Evidence chain --------------------------------------------- */

  /**
   * Attach evidence to a case.
   *
   * @param {string} caseId - Case identifier
   * @param {object} evidence
   * @param {string} evidence.type     - One of EVIDENCE_TYPES values
   * @param {string} evidence.title    - Short description
   * @param {string} evidence.content  - Body text, path, or reference ID
   * @param {string} evidence.addedBy  - Actor attaching the evidence
   * @param {object} [evidence.metadata] - Additional structured data
   * @returns {Promise<object>} The created evidence entry
   */
  async addEvidence(caseId, evidence) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);

    if (!evidence || !evidence.type) {
      throw new Error('evidence.type is required');
    }
    const validTypes = Object.values(EVIDENCE_TYPES);
    if (!validTypes.includes(evidence.type)) {
      throw new Error(`evidence.type must be one of: ${validTypes.join(', ')}`);
    }
    if (!evidence.title) throw new Error('evidence.title is required');
    if (!evidence.addedBy) throw new Error('evidence.addedBy is required');

    const entry = {
      id: `EV-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      type: evidence.type,
      title: evidence.title,
      content: evidence.content || '',
      metadata: evidence.metadata || {},
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
      note: `Evidence added: [${evidence.type}] ${evidence.title}`,
    });

    await this.save();
    return entry;
  }

  /* ---- Case linking ----------------------------------------------- */

  /**
   * Link two related cases for coordinated investigation.
   *
   * @param {string} caseIdA - First case identifier
   * @param {string} caseIdB - Second case identifier
   * @param {string} actor   - Who is creating the link
   * @returns {Promise<void>}
   */
  async linkCases(caseIdA, caseIdB, actor) {
    await this.load();
    const a = this.cases.get(caseIdA);
    const b = this.cases.get(caseIdB);
    if (!a) throw new Error(`Case not found: ${caseIdA}`);
    if (!b) throw new Error(`Case not found: ${caseIdB}`);
    if (caseIdA === caseIdB) throw new Error('Cannot link a case to itself');

    const now = new Date().toISOString();

    if (!a.linkedCaseIds.includes(caseIdB)) {
      a.linkedCaseIds.push(caseIdB);
      a.updatedAt = now;
      a.history.push({
        from: a.state, to: a.state, actor, timestamp: now,
        note: `Linked to case ${caseIdB}`,
      });
    }

    if (!b.linkedCaseIds.includes(caseIdA)) {
      b.linkedCaseIds.push(caseIdA);
      b.updatedAt = now;
      b.history.push({
        from: b.state, to: b.state, actor, timestamp: now,
        note: `Linked to case ${caseIdA}`,
      });
    }

    await this.save();
  }

  /* ---- Retrieval -------------------------------------------------- */

  /**
   * Get a single case by ID.
   *
   * @param {string} caseId
   * @returns {Promise<object|null>}
   */
  async get(caseId) {
    await this.load();
    const record = this.cases.get(caseId) || null;
    if (record) {
      record._overdue = isOverdue(record);
    }
    return record;
  }

  /**
   * Search cases by various criteria.
   *
   * @param {object} [filter]
   * @param {string} [filter.entityName]  - Partial match on entity name (case-insensitive)
   * @param {string} [filter.entityId]    - Exact match on entity ID
   * @param {string} [filter.state]       - Exact match on state
   * @param {string} [filter.priority]    - Exact match on priority (P1-P4)
   * @param {string} [filter.assignee]    - Exact match on assignee
   * @param {string} [filter.dateFrom]    - Created on or after (ISO date string)
   * @param {string} [filter.dateTo]      - Created on or before (ISO date string)
   * @param {boolean} [filter.overdue]    - If true, return only overdue cases
   * @returns {Promise<object[]>} Matching cases, sorted by priority then due date
   */
  async search(filter = {}) {
    await this.load();
    let results = [...this.cases.values()];

    if (filter.entityName) {
      const lower = filter.entityName.toLowerCase();
      results = results.filter(c =>
        c.entityName && c.entityName.toLowerCase().includes(lower)
      );
    }

    if (filter.entityId) {
      results = results.filter(c => c.entityId === filter.entityId);
    }

    if (filter.state) {
      results = results.filter(c => c.state === filter.state);
    }

    if (filter.priority) {
      results = results.filter(c => c.priority === filter.priority);
    }

    if (filter.assignee) {
      results = results.filter(c => c.assignee === filter.assignee);
    }

    if (filter.dateFrom) {
      results = results.filter(c => c.createdAt >= filter.dateFrom);
    }

    if (filter.dateTo) {
      results = results.filter(c => c.createdAt <= filter.dateTo);
    }

    /* Annotate overdue flag */
    for (const c of results) {
      c._overdue = isOverdue(c);
    }

    if (filter.overdue === true) {
      results = results.filter(c => c._overdue);
    }

    /* Sort: priority ascending (P1 first), then due date ascending */
    const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
    results.sort((a, b) => {
      const pa = priorityOrder[a.priority] || 99;
      const pb = priorityOrder[b.priority] || 99;
      if (pa !== pb) return pa - pb;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    return results;
  }

  /**
   * Return all overdue cases (SLA deadline exceeded, case still open).
   *
   * @returns {Promise<object[]>}
   */
  async getOverdue() {
    return this.search({ overdue: true });
  }

  /* ---- Statistics ------------------------------------------------- */

  /**
   * Calculate case management statistics.
   *
   * @returns {Promise<object>} Statistics summary
   */
  async statistics() {
    await this.load();
    const all = [...this.cases.values()];
    const now = Date.now();

    const terminalStates = [CASE_STATES.CLOSED, CASE_STATES.FILED];
    const openCases = all.filter(c => !terminalStates.includes(c.state));
    const closedCases = all.filter(c => terminalStates.includes(c.state));

    /* Open cases by priority */
    const openByPriority = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const c of openCases) {
      if (openByPriority[c.priority] !== undefined) {
        openByPriority[c.priority]++;
      }
    }

    /* Overdue count */
    let overdueCount = 0;
    for (const c of openCases) {
      if (isOverdue(c)) overdueCount++;
    }

    /* Average resolution time (ms) for closed cases */
    let totalResolutionMs = 0;
    let resolvedCount = 0;
    for (const c of closedCases) {
      if (c.closedAt && c.createdAt) {
        totalResolutionMs += new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime();
        resolvedCount++;
      }
    }
    const avgResolutionMs = resolvedCount > 0 ? totalResolutionMs / resolvedCount : 0;
    const avgResolutionDays = resolvedCount > 0
      ? Math.round((avgResolutionMs / 86400_000) * 10) / 10
      : 0;

    /* Cases by state */
    const byState = {};
    for (const s of Object.values(CASE_STATES)) {
      byState[s] = 0;
    }
    for (const c of all) {
      byState[c.state] = (byState[c.state] || 0) + 1;
    }

    /* Escalation count */
    const escalatedCount = all.filter(c => c.escalatedToMlro).length;

    return {
      totalCases: all.length,
      openCases: openCases.length,
      closedCases: closedCases.length,
      openByPriority,
      byState,
      overdueCount,
      escalatedCount,
      avgResolutionDays,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Export ------------------------------------------------------ */

  /**
   * Generate a plain-text case summary suitable for regulator review.
   *
   * @param {string} caseId
   * @returns {Promise<string>} Plain text summary
   */
  async exportSummary(caseId) {
    await this.load();
    const record = this.cases.get(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);

    const lines = [];
    lines.push('INVESTIGATION CASE SUMMARY');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Case ID:      ${record.id}`);
    lines.push(`Title:        ${record.title}`);
    lines.push(`State:        ${record.state.toUpperCase()}`);
    lines.push(`Priority:     ${record.priority} (${PRIORITIES[record.priority]?.label || 'Unknown'})`);
    lines.push(`Entity:       ${record.entityName || 'N/A'} (${record.entityId || 'N/A'})`);
    lines.push(`Assignee:     ${record.assignee || 'Unassigned'}`);
    lines.push(`Escalated:    ${record.escalatedToMlro ? 'Yes' : 'No'}`);
    lines.push(`Created:      ${record.createdAt}`);
    lines.push(`Due Date:     ${record.dueDate}`);
    lines.push(`Overdue:      ${isOverdue(record) ? 'YES' : 'No'}`);

    if (record.closedAt) {
      lines.push(`Closed:       ${record.closedAt}`);
      lines.push(`Closure:      ${record.closureReason || 'N/A'}`);
    }

    if (record.description) {
      lines.push('');
      lines.push('DESCRIPTION');
      lines.push('-'.repeat(60));
      lines.push(record.description);
    }

    /* Linked artefacts */
    lines.push('');
    lines.push('LINKED ARTEFACTS');
    lines.push('-'.repeat(60));
    if (record.screeningIds.length > 0) {
      lines.push(`Screening Results: ${record.screeningIds.join(', ')}`);
    }
    if (record.filingIds.length > 0) {
      lines.push(`Filings:           ${record.filingIds.join(', ')}`);
    }
    if (record.transactionIds.length > 0) {
      lines.push(`Transactions:      ${record.transactionIds.join(', ')}`);
    }
    if (record.linkedCaseIds.length > 0) {
      lines.push(`Linked Cases:      ${record.linkedCaseIds.join(', ')}`);
    }
    if (
      record.screeningIds.length === 0 &&
      record.filingIds.length === 0 &&
      record.transactionIds.length === 0 &&
      record.linkedCaseIds.length === 0
    ) {
      lines.push('None');
    }

    /* Evidence */
    lines.push('');
    lines.push(`EVIDENCE (${record.evidence.length} item(s))`);
    lines.push('-'.repeat(60));
    if (record.evidence.length === 0) {
      lines.push('No evidence attached.');
    } else {
      for (const ev of record.evidence) {
        lines.push(`  [${ev.type}] ${ev.title}`);
        lines.push(`    ID: ${ev.id}  |  Added by: ${ev.addedBy}  |  ${ev.addedAt}`);
        if (ev.content) {
          lines.push(`    ${ev.content}`);
        }
      }
    }

    /* History */
    lines.push('');
    lines.push(`CASE HISTORY (${record.history.length} event(s))`);
    lines.push('-'.repeat(60));
    for (const h of record.history) {
      const transition = h.from
        ? `${h.from} -> ${h.to}`
        : `-> ${h.to}`;
      lines.push(`  ${h.timestamp}  ${h.actor}  ${transition}`);
      if (h.note) {
        lines.push(`    ${h.note}`);
      }
    }

    lines.push('');
    lines.push('='.repeat(60));
    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Determine whether a case has exceeded its SLA deadline.
 *
 * @param {object} record - Case record
 * @returns {boolean}
 */
function isOverdue(record) {
  const terminalStates = [CASE_STATES.CLOSED, CASE_STATES.FILED];
  if (terminalStates.includes(record.state)) return false;
  if (!record.dueDate) return false;
  return new Date(record.dueDate).getTime() < Date.now();
}
