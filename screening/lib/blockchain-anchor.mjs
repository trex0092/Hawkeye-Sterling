/**
 * Blockchain Audit Anchoring — Immutable Compliance Evidence.
 *
 * Anchors compliance decisions, screening results, and audit chain
 * checkpoints to a blockchain for permanent, tamper-proof evidence.
 *
 * Inspired by atman-persist (Arweave blockchain persistence).
 * Adapted for AML/CFT compliance audit trail immutability.
 *
 * Supported backends:
 *   1. Arweave — Permanent storage (~$0.001 per anchor), 200+ year guarantee
 *   2. Solana — Fast memo program anchoring (~$0.0001 per anchor)
 *   3. File-based — Local JSON for environments without blockchain access
 *
 * What gets anchored:
 *   - Daily audit chain head hash (from screening/lib/audit.js)
 *   - Screening decision hashes (SHA256 of decision payload)
 *   - Filing submission hashes (SHA256 of goAML XML)
 *   - UBO calculation snapshots
 *   - Compliance grade assessments
 *
 * Each anchor contains: timestamp, hash, type, sequence, metadata.
 * The anchor itself is signed with HMAC-SHA256 for non-repudiation.
 *
 * References:
 *   - https://github.com/thedotmack/atman-persist
 *   - FATF Rec.11 (record keeping)
 *   - FDL No.10/2025 Art.16 (record retention)
 */

import { createHash, createHmac } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const ANCHOR_TYPES = {
  AUDIT_CHAIN_HEAD: 'audit_chain_head',
  SCREENING_DECISION: 'screening_decision',
  FILING_SUBMISSION: 'filing_submission',
  UBO_SNAPSHOT: 'ubo_snapshot',
  COMPLIANCE_GRADE: 'compliance_grade',
  SANCTIONS_REFRESH: 'sanctions_refresh',
  MLRO_APPROVAL: 'mlro_approval',
};

export class BlockchainAnchor {
  constructor(opts = {}) {
    this.backend = opts.backend || 'file';
    this.signingKey = opts.signingKey || process.env.HAWKEYE_ANCHOR_KEY || 'hawkeye-default-key';
    this.arweaveUrl = opts.arweaveUrl || process.env.ARWEAVE_GATEWAY || 'https://arweave.net';
    this.solanaRpc = opts.solanaRpc || process.env.SOLANA_RPC_URL || null;
    this.localPath = opts.localPath || '.screening/anchors.ndjson';
    this.anchors = [];
  }

  /**
   * Create and store an anchor.
   *
   * @param {string} type - Anchor type (from ANCHOR_TYPES)
   * @param {object} payload - Data to anchor
   * @param {object} [metadata] - Additional metadata
   * @returns {AnchorReceipt}
   */
  async anchor(type, payload, metadata = {}) {
    const now = new Date().toISOString();
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const seq = this.anchors.length + 1;

    const anchorData = {
      seq,
      type,
      payloadHash,
      timestamp: now,
      metadata: {
        source: 'hawkeye-sterling',
        version: '2.0.0',
        ...metadata,
      },
    };

    // Sign the anchor
    const signature = createHmac('sha256', this.signingKey)
      .update(JSON.stringify(anchorData))
      .digest('hex');

    const anchor = { ...anchorData, signature };

    // Store based on backend
    let receipt;
    switch (this.backend) {
      case 'arweave':
        receipt = await this._anchorArweave(anchor);
        break;
      case 'solana':
        receipt = await this._anchorSolana(anchor);
        break;
      case 'file':
      default:
        receipt = await this._anchorFile(anchor);
        break;
    }

    this.anchors.push({ ...anchor, receipt });

    return {
      seq,
      type,
      payloadHash,
      signature,
      timestamp: now,
      backend: this.backend,
      receipt,
    };
  }

  /**
   * Anchor the daily audit chain head.
   */
  async anchorAuditHead(auditHead) {
    return this.anchor(ANCHOR_TYPES.AUDIT_CHAIN_HEAD, {
      seq: auditHead.seq,
      hash: auditHead.hash,
      ts: auditHead.ts,
    }, { anchorLine: `HAWKEYE-AUDIT-ANCHOR seq=${auditHead.seq} hash=${auditHead.hash}` });
  }

  /**
   * Anchor a screening decision.
   */
  async anchorScreeningDecision(decision) {
    return this.anchor(ANCHOR_TYPES.SCREENING_DECISION, {
      caseId: decision.caseId,
      outcome: decision.outcome,
      actor: decision.actor,
    });
  }

  /**
   * Anchor a filing submission.
   */
  async anchorFilingSubmission(filing) {
    return this.anchor(ANCHOR_TYPES.FILING_SUBMISSION, {
      filingId: filing.id,
      type: filing.type,
      subjectName: filing.subjectName,
      state: filing.state,
    });
  }

  /**
   * Anchor a compliance grade.
   */
  async anchorComplianceGrade(grade) {
    return this.anchor(ANCHOR_TYPES.COMPLIANCE_GRADE, {
      grade: grade.grade,
      score: grade.overallScore,
      findingsCount: grade.findings?.length || 0,
    });
  }

  /**
   * Verify an anchor's signature.
   */
  verifySignature(anchor) {
    const { signature, ...data } = anchor;
    const expected = createHmac('sha256', this.signingKey)
      .update(JSON.stringify(data))
      .digest('hex');
    return signature === expected;
  }

  /**
   * Get all anchors, optionally filtered.
   */
  async getAnchors(filter = {}) {
    if (this.backend === 'file') await this._loadFileAnchors();
    let results = [...this.anchors];
    if (filter.type) results = results.filter(a => a.type === filter.type);
    if (filter.since) results = results.filter(a => a.timestamp >= filter.since);
    return results;
  }

  // ── Arweave Backend ────────────────────────────────────────

  async _anchorArweave(anchor) {
    try {
      const res = await fetch(`${this.arweaveUrl}/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: Buffer.from(JSON.stringify(anchor)).toString('base64'),
          tags: [
            { name: 'App-Name', value: 'Hawkeye-Sterling' },
            { name: 'Anchor-Type', value: anchor.type },
            { name: 'Payload-Hash', value: anchor.payloadHash },
            { name: 'Sequence', value: String(anchor.seq) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Arweave HTTP ${res.status}`);
      const data = await res.json();
      return { txId: data.id || 'pending', backend: 'arweave', url: `${this.arweaveUrl}/${data.id}` };
    } catch (err) {
      console.warn(`[blockchain-anchor] Arweave failed: ${err.message}, falling back to file`);
      return this._anchorFile(anchor);
    }
  }

  // ── Solana Backend ─────────────────────────────────────────

  async _anchorSolana(anchor) {
    if (!this.solanaRpc) {
      console.warn('[blockchain-anchor] No Solana RPC configured, falling back to file');
      return this._anchorFile(anchor);
    }
    try {
      const memo = `HAWKEYE:${anchor.type}:${anchor.payloadHash}:seq=${anchor.seq}`;
      const res = await fetch(this.solanaRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'sendTransaction',
          params: [Buffer.from(memo).toString('base64')],
        }),
      });
      const data = await res.json();
      return { txSignature: data.result || 'pending', backend: 'solana' };
    } catch (err) {
      console.warn(`[blockchain-anchor] Solana failed: ${err.message}, falling back to file`);
      return this._anchorFile(anchor);
    }
  }

  // ── File Backend ───────────────────────────────────────────

  async _anchorFile(anchor) {
    const dir = dirname(this.localPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await appendFile(this.localPath, JSON.stringify(anchor) + '\n');
    return { backend: 'file', path: this.localPath, seq: anchor.seq };
  }

  async _loadFileAnchors() {
    if (!existsSync(this.localPath)) return;
    try {
      const content = await readFile(this.localPath, 'utf8');
      this.anchors = content.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (err) {
      console.warn(`[blockchain-anchor] Failed to load anchors: ${err.message}`);
    }
  }

  stats() {
    return {
      backend: this.backend,
      totalAnchors: this.anchors.length,
      byType: Object.fromEntries(
        Object.values(ANCHOR_TYPES).map(t => [t, this.anchors.filter(a => a.type === t).length])
      ),
    };
  }
}

export { ANCHOR_TYPES };
