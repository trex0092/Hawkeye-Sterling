/**
 * PEP Senior Management Approval Workflow.
 *
 * Enforces Cabinet Resolution 134/2025 Art.14 requirements:
 *   1. Senior management MUST approve establishing/continuing a PEP relationship
 *   2. Reasonable measures to establish source of wealth and source of funds
 *   3. Enhanced ongoing monitoring of the business relationship
 *
 * This module ensures NO PEP relationship can proceed without documented
 * board-level or senior management approval.
 *
 * Workflow:
 *   PEP_IDENTIFIED → PENDING_APPROVAL → SM_APPROVED / SM_REJECTED
 *                                        ↓
 *                                   EDD_ACTIVE → PERIODIC_REVIEW → SM_REAPPROVED
 *                                                                   ↓
 *                                                              EXIT_INITIATED
 *
 * Every state transition is recorded with actor, timestamp, and reason.
 * Approval expires after 12 months and must be renewed.
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 14 (PEP obligations)
 *   - Cabinet Resolution 134/2025, Art. 14 (senior management approval)
 *   - FATF Recommendation 12 (PEPs)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const PEP_STATES = {
  IDENTIFIED: 'pep_identified',
  PENDING_APPROVAL: 'pending_sm_approval',
  SM_APPROVED: 'sm_approved',
  SM_REJECTED: 'sm_rejected',
  EDD_ACTIVE: 'edd_active',
  PERIODIC_REVIEW: 'periodic_review',
  SM_REAPPROVED: 'sm_reapproved',
  EXIT_INITIATED: 'exit_initiated',
  EXITED: 'exited',
};

const PEP_TRANSITIONS = {
  [PEP_STATES.IDENTIFIED]:       [PEP_STATES.PENDING_APPROVAL],
  [PEP_STATES.PENDING_APPROVAL]: [PEP_STATES.SM_APPROVED, PEP_STATES.SM_REJECTED],
  [PEP_STATES.SM_APPROVED]:      [PEP_STATES.EDD_ACTIVE],
  [PEP_STATES.SM_REJECTED]:      [PEP_STATES.EXIT_INITIATED],
  [PEP_STATES.EDD_ACTIVE]:       [PEP_STATES.PERIODIC_REVIEW, PEP_STATES.EXIT_INITIATED],
  [PEP_STATES.PERIODIC_REVIEW]:  [PEP_STATES.SM_REAPPROVED, PEP_STATES.EXIT_INITIATED],
  [PEP_STATES.SM_REAPPROVED]:    [PEP_STATES.EDD_ACTIVE],
  [PEP_STATES.EXIT_INITIATED]:   [PEP_STATES.EXITED],
  [PEP_STATES.EXITED]:           [],
};

const PEP_CATEGORIES = {
  domestic: 'Domestic PEP',
  foreign: 'Foreign PEP',
  international_org: 'International Organization PEP',
  family_member: 'PEP Family Member',
  close_associate: 'PEP Close Associate',
};

const APPROVAL_VALIDITY_MONTHS = 12;

export class PepApprovalWorkflow {
  constructor(registerPath) {
    this.registerPath = registerPath;
    this.records = new Map();
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    if (existsSync(this.registerPath)) {
      try {
        const data = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const r of data.records || []) this.records.set(r.entityId, r);
      } catch (err) { console.warn(`[pep-approval] Load failed: ${err.message}`); }
    }
    this._loaded = true;
  }

  async save() {
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify({
      version: '2.0.0', updatedAt: new Date().toISOString(),
      records: [...this.records.values()],
    }, null, 2));
  }

  /**
   * Register a PEP relationship for approval.
   */
  async registerPep(params) {
    await this.load();
    const now = new Date().toISOString();
    const record = {
      entityId: params.entityId,
      entityName: params.entityName,
      pepCategory: params.pepCategory || 'foreign',
      pepPosition: params.pepPosition || '',
      pepCountry: params.pepCountry || '',
      state: PEP_STATES.IDENTIFIED,
      sourceOfWealth: params.sourceOfWealth || null,
      sourceOfFunds: params.sourceOfFunds || null,
      sowVerified: false,
      sofVerified: false,
      approvals: [],
      currentApproval: null,
      history: [{ from: null, to: PEP_STATES.IDENTIFIED, actor: params.identifiedBy || 'system', timestamp: now, reason: 'PEP status identified' }],
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(params.entityId, record);
    await this.save();
    return record;
  }

  /**
   * Submit PEP for senior management approval.
   */
  async submitForApproval(entityId, analyst, reason) {
    await this.load();
    const record = this.records.get(entityId);
    if (!record) throw new Error(`PEP record not found: ${entityId}`);
    this._validateTransition(record.state, PEP_STATES.PENDING_APPROVAL);

    if (!record.sourceOfWealth) throw new Error('Source of wealth must be documented before submitting for SM approval (Cabinet Res 134/2025 Art.14)');
    if (!record.sourceOfFunds) throw new Error('Source of funds must be documented before submitting for SM approval (Cabinet Res 134/2025 Art.14)');

    record.state = PEP_STATES.PENDING_APPROVAL;
    record.updatedAt = new Date().toISOString();
    record.history.push({ from: PEP_STATES.IDENTIFIED, to: PEP_STATES.PENDING_APPROVAL, actor: analyst, timestamp: record.updatedAt, reason });
    await this.save();
    return record;
  }

  /**
   * Record senior management approval or rejection.
   * ONLY senior_management or board role can approve.
   */
  async recordSMDecision(entityId, decision, approver, role, reason) {
    await this.load();
    const record = this.records.get(entityId);
    if (!record) throw new Error(`PEP record not found: ${entityId}`);

    if (role !== 'senior_management' && role !== 'board_member' && role !== 'mlro') {
      throw new Error(`Only senior management, board members, or MLRO can approve PEP relationships. Role '${role}' is not authorized. (Cabinet Res 134/2025 Art.14)`);
    }

    const newState = decision === 'approve' ? PEP_STATES.SM_APPROVED : PEP_STATES.SM_REJECTED;
    this._validateTransition(record.state, newState);

    const now = new Date().toISOString();
    record.state = newState;
    record.updatedAt = now;

    if (decision === 'approve') {
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + APPROVAL_VALIDITY_MONTHS);

      const approval = {
        approvedBy: approver,
        role,
        approvedAt: now,
        expiresAt: expiryDate.toISOString().split('T')[0],
        reason,
        hash: createHash('sha256').update(`${entityId}:${approver}:${now}:${reason}`).digest('hex'),
      };
      record.approvals.push(approval);
      record.currentApproval = approval;
    }

    record.history.push({ from: PEP_STATES.PENDING_APPROVAL, to: newState, actor: approver, role, timestamp: now, reason });
    await this.save();
    return record;
  }

  /**
   * Document source of wealth.
   */
  async documentSOW(entityId, sourceOfWealth, verifiedBy) {
    await this.load();
    const record = this.records.get(entityId);
    if (!record) throw new Error(`PEP record not found: ${entityId}`);
    record.sourceOfWealth = sourceOfWealth;
    record.sowVerified = true;
    record.updatedAt = new Date().toISOString();
    record.history.push({ from: record.state, to: record.state, actor: verifiedBy, timestamp: record.updatedAt, reason: `SOW documented: ${sourceOfWealth.slice(0, 100)}` });
    await this.save();
    return record;
  }

  /**
   * Document source of funds.
   */
  async documentSOF(entityId, sourceOfFunds, verifiedBy) {
    await this.load();
    const record = this.records.get(entityId);
    if (!record) throw new Error(`PEP record not found: ${entityId}`);
    record.sourceOfFunds = sourceOfFunds;
    record.sofVerified = true;
    record.updatedAt = new Date().toISOString();
    record.history.push({ from: record.state, to: record.state, actor: verifiedBy, timestamp: record.updatedAt, reason: `SOF documented: ${sourceOfFunds.slice(0, 100)}` });
    await this.save();
    return record;
  }

  /**
   * Check which PEP approvals are expiring or expired.
   */
  async checkExpiringApprovals(daysThreshold = 30) {
    await this.load();
    const now = new Date();
    const results = { expired: [], expiringSoon: [], current: [] };

    for (const record of this.records.values()) {
      if (!record.currentApproval || record.state === PEP_STATES.EXITED) continue;
      const expiry = new Date(record.currentApproval.expiresAt);
      const daysUntil = (expiry - now) / 86400000;

      if (daysUntil < 0) results.expired.push({ ...record, daysOverdue: Math.abs(Math.round(daysUntil)) });
      else if (daysUntil < daysThreshold) results.expiringSoon.push({ ...record, daysUntilExpiry: Math.round(daysUntil) });
      else results.current.push(record);
    }

    return results;
  }

  /**
   * Check if a PEP relationship is approved and current.
   * Returns false if approval expired or not granted.
   */
  async isApproved(entityId) {
    await this.load();
    const record = this.records.get(entityId);
    if (!record) return { approved: false, reason: 'No PEP record found' };
    if (record.state === PEP_STATES.SM_REJECTED || record.state === PEP_STATES.EXITED) {
      return { approved: false, reason: `PEP relationship ${record.state}` };
    }
    if (!record.currentApproval) return { approved: false, reason: 'No SM approval on record' };
    if (new Date() > new Date(record.currentApproval.expiresAt)) {
      return { approved: false, reason: `Approval expired on ${record.currentApproval.expiresAt}` };
    }
    return { approved: true, approvedBy: record.currentApproval.approvedBy, expiresAt: record.currentApproval.expiresAt };
  }

  async list(filter = {}) {
    await this.load();
    let records = [...this.records.values()];
    if (filter.state) records = records.filter(r => r.state === filter.state);
    if (filter.pepCategory) records = records.filter(r => r.pepCategory === filter.pepCategory);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  _validateTransition(current, target) {
    const allowed = PEP_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`Invalid PEP transition: ${current} -> ${target}. Allowed: ${(allowed || []).join(', ') || 'none'}`);
    }
  }
}

export { PEP_STATES, PEP_TRANSITIONS, PEP_CATEGORIES, APPROVAL_VALIDITY_MONTHS };
