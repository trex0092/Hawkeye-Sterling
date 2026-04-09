/**
 * MLRO Approval State Machine.
 *
 * Enforces a structured workflow for compliance filings:
 *
 *   DRAFT -> ANALYST_REVIEW -> MLRO_REVIEW -> APPROVED -> FILED
 *                 |                |              |
 *                 v                v              v
 *              REJECTED       RETURNED       WITHDRAWN
 *
 * State transitions are recorded in a JSON-backed register with timestamps,
 * actors, and reasons. No filing can reach FILED status without passing
 * through MLRO_REVIEW -> APPROVED.
 *
 * References: Federal Decree-Law No. 10/2025, Art. 15-17 (reporting obligations).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const STATES = {
  DRAFT: 'draft',
  ANALYST_REVIEW: 'analyst_review',
  MLRO_REVIEW: 'mlro_review',
  APPROVED: 'approved',
  FILED: 'filed',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  WITHDRAWN: 'withdrawn',
};

const TRANSITIONS = {
  [STATES.DRAFT]:           [STATES.ANALYST_REVIEW, STATES.WITHDRAWN],
  [STATES.ANALYST_REVIEW]:  [STATES.MLRO_REVIEW, STATES.REJECTED, STATES.RETURNED],
  [STATES.MLRO_REVIEW]:     [STATES.APPROVED, STATES.REJECTED, STATES.RETURNED],
  [STATES.APPROVED]:        [STATES.FILED, STATES.WITHDRAWN],
  [STATES.FILED]:           [],
  [STATES.REJECTED]:        [STATES.DRAFT],
  [STATES.RETURNED]:        [STATES.DRAFT],
  [STATES.WITHDRAWN]:       [],
};

const ROLE_PERMISSIONS = {
  analyst: [STATES.ANALYST_REVIEW, STATES.RETURNED],
  mlro:    [STATES.MLRO_REVIEW, STATES.APPROVED, STATES.REJECTED, STATES.RETURNED],
  admin:   Object.values(STATES),
};

export class FilingWorkflow {
  /**
   * @param {string} registerPath - Path to the JSON register file
   */
  constructor(registerPath) {
    this.registerPath = registerPath;
    this.filings = new Map();
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.registerPath)) {
      try {
        const data = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const f of data.filings || []) {
          this.filings.set(f.id, f);
        }
      } catch (err) {
        console.warn(`[mlro-workflow] Failed to load register: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  async save() {
    const data = {
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      filings: [...this.filings.values()],
    };
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Create a new filing in DRAFT state.
   *
   * @param {object} params
   * @param {string} params.type - Filing type (STR, SAR, CTR, DPMSR, CNMR)
   * @param {string} params.subjectName - Subject of the filing
   * @param {string} params.narrative - Description of suspicious activity
   * @param {string} params.createdBy - Actor creating the filing
   * @param {number} [params.amountAed] - Transaction amount
   * @param {string} [params.triggerDate] - Date of trigger event
   * @returns {object} The created filing
   */
  async create(params) {
    await this.load();
    const id = `FIL-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const filing = {
      id,
      type: params.type,
      subjectName: params.subjectName,
      narrative: params.narrative,
      amountAed: params.amountAed || null,
      triggerDate: params.triggerDate || null,
      state: STATES.DRAFT,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      history: [{
        from: null,
        to: STATES.DRAFT,
        actor: params.createdBy,
        timestamp: now,
        reason: 'Filing created',
      }],
      mlroApproval: null,
      filedAt: null,
      goamlReference: null,
    };

    // Calculate deadline (15 business days from trigger date)
    if (params.triggerDate) {
      filing.deadline = calculateDeadline(params.triggerDate, 15);
    }

    this.filings.set(id, filing);
    await this.save();
    return filing;
  }

  /**
   * Transition a filing to a new state.
   *
   * @param {string} filingId - Filing ID
   * @param {string} newState - Target state
   * @param {string} actor - Who is performing the transition
   * @param {string} role - Actor's role (analyst, mlro, admin)
   * @param {string} reason - Reason for the transition
   * @returns {object} Updated filing
   * @throws {Error} If transition is invalid
   */
  async transition(filingId, newState, actor, role, reason) {
    await this.load();
    const filing = this.filings.get(filingId);
    if (!filing) throw new Error(`Filing not found: ${filingId}`);

    // Validate state transition
    const allowed = TRANSITIONS[filing.state];
    if (!allowed || !allowed.includes(newState)) {
      throw new Error(
        `Invalid transition: ${filing.state} -> ${newState}. ` +
        `Allowed: ${(allowed || []).join(', ') || 'none (terminal state)'}`
      );
    }

    // Validate role permissions
    const roleAllowed = ROLE_PERMISSIONS[role];
    if (!roleAllowed || !roleAllowed.includes(newState)) {
      throw new Error(
        `Role '${role}' cannot transition to '${newState}'. ` +
        `Allowed target states for ${role}: ${(roleAllowed || []).join(', ')}`
      );
    }

    // Special validation: FILED requires MLRO approval
    if (newState === STATES.FILED && !filing.mlroApproval) {
      throw new Error(
        'Cannot file without MLRO approval. Filing must pass through mlro_review -> approved states.'
      );
    }

    const now = new Date().toISOString();

    filing.history.push({
      from: filing.state,
      to: newState,
      actor,
      role,
      timestamp: now,
      reason,
    });

    filing.state = newState;
    filing.updatedAt = now;

    // Record MLRO approval
    if (newState === STATES.APPROVED && role === 'mlro') {
      filing.mlroApproval = {
        approvedBy: actor,
        approvedAt: now,
        reason,
        hash: createHash('sha256')
          .update(`${filingId}:${actor}:${now}:${reason}`)
          .digest('hex'),
      };
    }

    // Record filing timestamp
    if (newState === STATES.FILED) {
      filing.filedAt = now;
    }

    await this.save();
    return filing;
  }

  /**
   * Get a filing by ID.
   */
  async get(filingId) {
    await this.load();
    return this.filings.get(filingId) || null;
  }

  /**
   * List all filings, optionally filtered.
   */
  async list(filter = {}) {
    await this.load();
    let filings = [...this.filings.values()];

    if (filter.state) filings = filings.filter(f => f.state === filter.state);
    if (filter.type) filings = filings.filter(f => f.type === filter.type);
    if (filter.subjectName) filings = filings.filter(f =>
      f.subjectName.toLowerCase().includes(filter.subjectName.toLowerCase())
    );

    return filings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Get filings that are approaching their deadline.
   */
  async getUrgent(daysThreshold = 3) {
    await this.load();
    const now = new Date();
    const threshold = daysThreshold * 86400000;

    return [...this.filings.values()]
      .filter(f =>
        f.deadline &&
        f.state !== STATES.FILED &&
        f.state !== STATES.REJECTED &&
        f.state !== STATES.WITHDRAWN
      )
      .filter(f => {
        const deadline = new Date(f.deadline);
        return (deadline - now) <= threshold;
      })
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }
}

function calculateDeadline(triggerDate, businessDays) {
  const date = new Date(triggerDate);
  let count = 0;
  while (count < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return date.toISOString().split('T')[0];
}

export { STATES, TRANSITIONS, ROLE_PERMISSIONS };
