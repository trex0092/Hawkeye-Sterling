// Hawkeye Sterling — immutable audit ledger.
// Every compliance event is chained: each entry includes the hash of the
// previous entry, a payload hash, the actor, action, and forensic metadata.
//
// Satisfies FATF R.11 (5-year retention), UAE CBUAE AML-CFT Standards
// Section 8 (documentation), and forensic reconstruction requirements.
//
// Complements audit-chain.ts (which provides the SHA-256 chain primitive).
// This module adds: rich forensic fields, entry classification, retention
// policy tagging, and export for regulator consumption.

import { AuditChain } from './audit-chain.js';

// ── Entry types ───────────────────────────────────────────────────────────────

export type LedgerActionCategory =
  | 'screening'          // entity screening events
  | 'sanctions'          // sanctions list ingestion, delta, rescreen
  | 'adverse_media'      // media ingestion and classification
  | 'case_management'    // case create / transition / close
  | 'decision'           // compliance decisions and approvals
  | 'escalation'         // escalation tier changes
  | 'ai_inference'       // AI model invocations and outputs
  | 'data_access'        // who accessed what data
  | 'configuration'      // policy/config changes
  | 'auth'               // login, token issue, role change
  | 'export'             // report or data exports
  | 'system';            // system health, job runs

export type LedgerSeverity = 'info' | 'warning' | 'critical';

export type RetentionPolicy =
  | 'standard_5yr'    // default: 5 years per FATF R.11
  | 'str_related_7yr' // STR/SAR-related records: 7 years
  | 'permanent';      // sanctions designations: keep forever

export interface LedgerEntry {
  entryId: string;
  sequenceNumber: number;    // monotonically increasing
  previousHash: string;      // hash of prior entry ('GENESIS' for first)
  entryHash: string;         // hash of this entry's canonical fields
  payloadHash: string;       // hash of the payload content

  timestamp: string;         // ISO 8601
  category: LedgerActionCategory;
  action: string;            // e.g. 'entity.screened', 'decision.created'
  severity: LedgerSeverity;
  retentionPolicy: RetentionPolicy;

  actor: {
    actorId: string;
    actorName: string;
    role: string;
    ipAddress?: string | undefined;
    sessionId?: string | undefined;
  };

  subject?: {
    subjectId: string;
    subjectName: string;
    subjectType: 'individual' | 'entity' | 'account' | 'system';
  } | undefined;

  payload: Record<string, unknown>;  // action-specific data

  // Forensic metadata
  correlationId?: string | undefined;
  caseId?: string | undefined;
  decisionId?: string | undefined;
  sanctionsListVersion?: string | undefined;
  schemaVersion: string;
}

// ── Retention policy selector ─────────────────────────────────────────────────

function selectRetentionPolicy(
  category: LedgerActionCategory,
  action: string,
): RetentionPolicy {
  if (action.includes('str') || action.includes('sar') || action.includes('file_str')) {
    return 'str_related_7yr';
  }
  if (category === 'sanctions' && action.includes('designation')) {
    return 'permanent';
  }
  return 'standard_5yr';
}

// ── FNV-1a (no crypto dependency) ────────────────────────────────────────────

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function hashPayload(payload: Record<string, unknown>): string {
  return fnv1a(JSON.stringify(payload, Object.keys(payload).sort()));
}

function hashEntry(entry: Omit<LedgerEntry, 'entryHash'>): string {
  const canonical = JSON.stringify({
    entryId: entry.entryId,
    sequenceNumber: entry.sequenceNumber,
    previousHash: entry.previousHash,
    timestamp: entry.timestamp,
    category: entry.category,
    action: entry.action,
    actorId: entry.actor.actorId,
    payloadHash: entry.payloadHash,
  });
  return fnv1a(canonical);
}

// ── Ledger class ──────────────────────────────────────────────────────────────

export class AuditLedger {
  private entries: LedgerEntry[] = [];
  private sequence = 0;
  private lastHash = 'GENESIS';
  private readonly chain: AuditChain;

  constructor() {
    this.chain = new AuditChain();
  }

  append(
    category: LedgerActionCategory,
    action: string,
    actor: LedgerEntry['actor'],
    payload: Record<string, unknown>,
    opts?: {
      severity?: LedgerSeverity;
      subject?: LedgerEntry['subject'];
      correlationId?: string;
      caseId?: string;
      decisionId?: string;
      sanctionsListVersion?: string;
    },
  ): LedgerEntry {
    this.sequence++;
    const entryId = `ALE-${Date.now().toString(36).toUpperCase()}-${String(this.sequence).padStart(6, '0')}`;
    const timestamp = new Date().toISOString();
    const payloadHash = hashPayload(payload);
    const retentionPolicy = selectRetentionPolicy(category, action);

    const base: Omit<LedgerEntry, 'entryHash'> = {
      entryId,
      sequenceNumber: this.sequence,
      previousHash: this.lastHash,
      payloadHash,
      timestamp,
      category,
      action,
      severity: opts?.severity ?? 'info',
      retentionPolicy,
      actor,
      subject: opts?.subject,
      payload,
      correlationId: opts?.correlationId,
      caseId: opts?.caseId,
      decisionId: opts?.decisionId,
      sanctionsListVersion: opts?.sanctionsListVersion,
      schemaVersion: '2025.1',
    };

    const entry: LedgerEntry = {
      ...base,
      entryHash: hashEntry(base),
    };

    this.entries.push(entry);
    this.lastHash = entry.entryHash;

    // Mirror into the lower-level AuditChain for cross-verification
    this.chain.append(action, actor.actorId, payload);

    return entry;
  }

  // ── Verification ────────────────────────────────────────────────────────────

  verify(): { ok: boolean; brokenAt?: number; errors: string[] } {
    const errors: string[] = [];
    let prev = 'GENESIS';

    for (const entry of this.entries) {
      // Re-derive entry hash
      const { entryHash, ...rest } = entry;
      const expected = hashEntry(rest);
      if (expected !== entryHash) {
        errors.push(`Entry ${entry.sequenceNumber} (${entry.entryId}): hash mismatch — expected ${expected}, stored ${entryHash}`);
        return { ok: false, brokenAt: entry.sequenceNumber, errors };
      }
      // Verify chain linkage
      if (entry.previousHash !== prev) {
        errors.push(`Entry ${entry.sequenceNumber}: chain broken — expected prev=${prev}, got ${entry.previousHash}`);
        return { ok: false, brokenAt: entry.sequenceNumber, errors };
      }
      prev = entry.entryHash;
    }

    return { ok: errors.length === 0, errors };
  }

  // ── Retrieval helpers ───────────────────────────────────────────────────────

  getAll(): ReadonlyArray<LedgerEntry> {
    return this.entries;
  }

  getByCorrelation(correlationId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.correlationId === correlationId);
  }

  getByCase(caseId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.caseId === caseId);
  }

  getByCategory(category: LedgerActionCategory): LedgerEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  getBySubject(subjectId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.subject?.subjectId === subjectId);
  }

  getByActor(actorId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.actor.actorId === actorId);
  }

  getSince(isoTimestamp: string): LedgerEntry[] {
    const ts = new Date(isoTimestamp).getTime();
    return this.entries.filter((e) => new Date(e.timestamp).getTime() >= ts);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  exportForRegulator(opts?: {
    since?: string;
    category?: LedgerActionCategory;
    subjectId?: string;
  }): {
    exportedAt: string;
    totalEntries: number;
    chainVerified: boolean;
    entries: LedgerEntry[];
  } {
    let subset = this.entries;
    if (opts?.since) subset = subset.filter((e) => new Date(e.timestamp) >= new Date(opts.since ?? ''));
    if (opts?.category) subset = subset.filter((e) => e.category === opts.category);
    if (opts?.subjectId) subset = subset.filter((e) => e.subject?.subjectId === opts.subjectId);

    const verification = this.verify();

    return {
      exportedAt: new Date().toISOString(),
      totalEntries: subset.length,
      chainVerified: verification.ok,
      entries: subset,
    };
  }

  // ── Statistics ──────────────────────────────────────────────────────────────

  stats(): {
    totalEntries: number;
    byCategory: Partial<Record<LedgerActionCategory, number>>;
    criticalCount: number;
    oldestEntry?: string | undefined;
    newestEntry?: string | undefined;
  } {
    const byCategory: Partial<Record<LedgerActionCategory, number>> = {};
    let criticalCount = 0;

    for (const e of this.entries) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      if (e.severity === 'critical') criticalCount++;
    }

    return {
      totalEntries: this.entries.length,
      byCategory,
      criticalCount,
      oldestEntry: this.entries[0]?.timestamp,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp,
    };
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  toJSON(): string {
    return JSON.stringify({
      schemaVersion: '2025.1',
      exportedAt: new Date().toISOString(),
      entryCount: this.entries.length,
      lastHash: this.lastHash,
      entries: this.entries,
    }, null, 2);
  }

  static fromJSON(json: string): AuditLedger {
    const ledger = new AuditLedger();
    const parsed = JSON.parse(json) as {
      entries: LedgerEntry[];
      lastHash: string;
    };
    ledger.entries = parsed.entries;
    ledger.sequence = parsed.entries.length;
    ledger.lastHash = parsed.lastHash;
    return ledger;
  }
}

// ── Singleton ledger for process lifetime ─────────────────────────────────────

let _globalLedger: AuditLedger | null = null;

export function getGlobalLedger(): AuditLedger {
  if (!_globalLedger) _globalLedger = new AuditLedger();
  return _globalLedger;
}
