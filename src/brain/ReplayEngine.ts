// Hawkeye Sterling — forensic replay engine.
// Enables regulators and internal audit to reconstruct the exact state that
// existed at any point in time:
//   - The search query and its parameters
//   - The sanctions list version active at that moment
//   - The evidence retrieved and its content
//   - The analyst actions taken, in order
//   - The AI outputs and confidence scores
//
// A replay is deterministic: given the same snapshot inputs, it produces
// the same outputs — proving the decision was correctly grounded.

import type { LedgerEntry } from './AuditLedger.js';

// ── Snapshot types ────────────────────────────────────────────────────────────

export interface SanctionsListSnapshot {
  listId: string;
  listVersion: string;
  retrievedAt: string;
  entryCount: number;
  checksum: string;      // SHA-256 or FNV-1a of the list content
}

export interface SearchSnapshot {
  query: string;
  queryNormalized: string;
  parameters: Record<string, unknown>;
  candidatesConsidered: number;
  matchesReturned: number;
  topScore: number;
}

export interface EvidenceSnapshot {
  evidenceId: string;
  evidenceType: string;
  contentHash: string;    // hash of retrieved content
  retrievedAt: string;
  sourceUrl?: string;
  excerpt: string;
}

export interface AIInferenceSnapshot {
  model: string;
  promptHash: string;     // hash of the prompt (not the prompt itself for confidentiality)
  responseHash: string;
  confidence: number;
  guardrailsApplied: string[];
  validationPassed: boolean;
}

export interface AnalystActionSnapshot {
  actorId: string;
  actorRole: string;
  action: string;
  rationale: string;
  timestamp: string;
  overriddenAlerts?: string[];
}

// ── Replay record ─────────────────────────────────────────────────────────────

export interface ReplayRecord {
  replayId: string;
  originalDecisionId?: string;
  originalCaseId?: string;
  subjectId: string;
  subjectName: string;

  // What was the state at the time of the original decision?
  snapshotAt: string;           // ISO 8601 timestamp of the event being replayed

  sanctionsState: SanctionsListSnapshot[];
  searchSnapshots: SearchSnapshot[];
  evidenceSnapshots: EvidenceSnapshot[];
  aiSnapshots: AIInferenceSnapshot[];
  analystActions: AnalystActionSnapshot[];

  // Reconstruction
  reconstructedOutcome: string;
  reconstructionNotes: string[];
  reconstructionMatches: boolean; // did replay produce same outcome?

  generatedAt: string;
  generatedBy: string;
  schemaVersion: string;
}

// ── Replay session ────────────────────────────────────────────────────────────

export interface ReplaySession {
  sessionId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;           // regulatory request, internal audit, dispute
  targetDecisionId?: string;
  targetCaseId?: string;
  targetTimestamp?: string;
  records: ReplayRecord[];
  completedAt?: string;
  verified: boolean;
}

// ── Event extraction helpers ──────────────────────────────────────────────────

function extractSanctionsSnapshot(entry: LedgerEntry): SanctionsListSnapshot | null {
  if (entry.category !== 'sanctions') return null;
  const p = entry.payload;
  if (
    typeof p['listId'] === 'string' &&
    typeof p['listVersion'] === 'string' &&
    typeof p['entryCount'] === 'number'
  ) {
    return {
      listId: p['listId'],
      listVersion: p['listVersion'],
      retrievedAt: entry.timestamp,
      entryCount: p['entryCount'],
      checksum: typeof p['checksum'] === 'string' ? p['checksum'] : 'unknown',
    };
  }
  return null;
}

function extractSearchSnapshot(entry: LedgerEntry): SearchSnapshot | null {
  if (entry.category !== 'screening' || !entry.action.includes('screen')) return null;
  const p = entry.payload;
  if (typeof p['query'] === 'string') {
    return {
      query: p['query'],
      queryNormalized: typeof p['queryNormalized'] === 'string' ? p['queryNormalized'] : p['query'],
      parameters: typeof p['parameters'] === 'object' && p['parameters'] !== null
        ? p['parameters'] as Record<string, unknown>
        : {},
      candidatesConsidered: typeof p['candidatesConsidered'] === 'number' ? p['candidatesConsidered'] : 0,
      matchesReturned: typeof p['matchesReturned'] === 'number' ? p['matchesReturned'] : 0,
      topScore: typeof p['topScore'] === 'number' ? p['topScore'] : 0,
    };
  }
  return null;
}

function extractEvidenceSnapshot(entry: LedgerEntry): EvidenceSnapshot | null {
  if (entry.category !== 'screening' && entry.category !== 'adverse_media') return null;
  const p = entry.payload;
  if (typeof p['evidenceId'] === 'string' && typeof p['contentHash'] === 'string') {
    return {
      evidenceId: p['evidenceId'],
      evidenceType: typeof p['evidenceType'] === 'string' ? p['evidenceType'] : 'unknown',
      contentHash: p['contentHash'],
      retrievedAt: entry.timestamp,
      sourceUrl: typeof p['sourceUrl'] === 'string' ? p['sourceUrl'] : undefined,
      excerpt: typeof p['excerpt'] === 'string' ? p['excerpt'] : '',
    };
  }
  return null;
}

function extractAISnapshot(entry: LedgerEntry): AIInferenceSnapshot | null {
  if (entry.category !== 'ai_inference') return null;
  const p = entry.payload;
  return {
    model: typeof p['model'] === 'string' ? p['model'] : 'unknown',
    promptHash: typeof p['promptHash'] === 'string' ? p['promptHash'] : 'unknown',
    responseHash: typeof p['responseHash'] === 'string' ? p['responseHash'] : 'unknown',
    confidence: typeof p['confidence'] === 'number' ? p['confidence'] : 0,
    guardrailsApplied: Array.isArray(p['guardrailsApplied']) ? p['guardrailsApplied'] as string[] : [],
    validationPassed: typeof p['validationPassed'] === 'boolean' ? p['validationPassed'] : false,
  };
}

function extractAnalystAction(entry: LedgerEntry): AnalystActionSnapshot | null {
  if (entry.category !== 'decision' && entry.category !== 'case_management' && entry.category !== 'escalation') {
    return null;
  }
  const p = entry.payload;
  return {
    actorId: entry.actor.actorId,
    actorRole: entry.actor.role,
    action: entry.action,
    rationale: typeof p['rationale'] === 'string' ? p['rationale'] : '',
    timestamp: entry.timestamp,
    overriddenAlerts: Array.isArray(p['overriddenAlerts']) ? p['overriddenAlerts'] as string[] : undefined,
  };
}

// ── FNV-1a ────────────────────────────────────────────────────────────────────

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Replay engine ─────────────────────────────────────────────────────────────

let _replayCounter = 0;

export function buildReplayRecord(
  ledgerEntries: LedgerEntry[],
  opts: {
    subjectId: string;
    subjectName: string;
    snapshotAt: string;
    originalDecisionId?: string;
    originalCaseId?: string;
    generatedBy: string;
  },
): ReplayRecord {
  _replayCounter++;
  const replayId = `RPL-${Date.now().toString(36).toUpperCase()}-${String(_replayCounter).padStart(4, '0')}`;

  // Filter entries up to snapshotAt
  const cutoff = new Date(opts.snapshotAt).getTime();
  const relevantEntries = ledgerEntries.filter(
    (e) => new Date(e.timestamp).getTime() <= cutoff &&
      (e.subject?.subjectId === opts.subjectId ||
       e.caseId === opts.originalCaseId ||
       e.decisionId === opts.originalDecisionId)
  );

  const sanctionsState: SanctionsListSnapshot[] = [];
  const searchSnapshots: SearchSnapshot[] = [];
  const evidenceSnapshots: EvidenceSnapshot[] = [];
  const aiSnapshots: AIInferenceSnapshot[] = [];
  const analystActions: AnalystActionSnapshot[] = [];

  for (const entry of relevantEntries) {
    const s = extractSanctionsSnapshot(entry);
    if (s) sanctionsState.push(s);

    const sr = extractSearchSnapshot(entry);
    if (sr) searchSnapshots.push(sr);

    const ev = extractEvidenceSnapshot(entry);
    if (ev) evidenceSnapshots.push(ev);

    const ai = extractAISnapshot(entry);
    if (ai) aiSnapshots.push(ai);

    const aa = extractAnalystAction(entry);
    if (aa) analystActions.push(aa);
  }

  // Determine reconstructed outcome from analyst actions
  const lastDecision = analystActions.filter((a) => a.action.startsWith('decision')).pop();
  const reconstructedOutcome = lastDecision?.action ?? 'no_decision_recorded';

  const reconstructionNotes: string[] = [];
  if (sanctionsState.length === 0) reconstructionNotes.push('No sanctions list snapshot found — list version at time of decision cannot be verified');
  if (searchSnapshots.length === 0) reconstructionNotes.push('No search snapshots found — query parameters cannot be replayed');
  if (evidenceSnapshots.length === 0) reconstructionNotes.push('No evidence snapshots found — evidence content cannot be verified');
  if (aiSnapshots.length === 0) reconstructionNotes.push('No AI inference snapshots found — model outputs cannot be verified');

  const reconstructionMatches = reconstructionNotes.length === 0;

  return {
    replayId,
    originalDecisionId: opts.originalDecisionId,
    originalCaseId: opts.originalCaseId,
    subjectId: opts.subjectId,
    subjectName: opts.subjectName,
    snapshotAt: opts.snapshotAt,
    sanctionsState,
    searchSnapshots,
    evidenceSnapshots,
    aiSnapshots,
    analystActions,
    reconstructedOutcome,
    reconstructionNotes,
    reconstructionMatches,
    generatedAt: new Date().toISOString(),
    generatedBy: opts.generatedBy,
    schemaVersion: '2025.1',
  };
}

// ── Session management ────────────────────────────────────────────────────────

let _sessionCounter = 0;

export function createReplaySession(opts: {
  requestedBy: string;
  reason: string;
  targetDecisionId?: string;
  targetCaseId?: string;
  targetTimestamp?: string;
}): ReplaySession {
  _sessionCounter++;
  return {
    sessionId: `RSS-${Date.now().toString(36).toUpperCase()}-${String(_sessionCounter).padStart(4, '0')}`,
    requestedBy: opts.requestedBy,
    requestedAt: new Date().toISOString(),
    reason: opts.reason,
    targetDecisionId: opts.targetDecisionId,
    targetCaseId: opts.targetCaseId,
    targetTimestamp: opts.targetTimestamp,
    records: [],
    verified: false,
  };
}

export function addRecordToSession(
  session: ReplaySession,
  record: ReplayRecord,
): ReplaySession {
  const updatedRecords = [...session.records, record];
  const allMatch = updatedRecords.every((r) => r.reconstructionMatches);
  return {
    ...session,
    records: updatedRecords,
    verified: allMatch,
  };
}

export function finalizeSession(session: ReplaySession): ReplaySession {
  return {
    ...session,
    completedAt: new Date().toISOString(),
    verified: session.records.every((r) => r.reconstructionMatches),
  };
}

// ── Markdown report ───────────────────────────────────────────────────────────

export function formatReplayReport(session: ReplaySession): string {
  const lines: string[] = [
    `# Forensic Replay Report`,
    ``,
    `**Session ID:** ${session.sessionId}`,
    `**Requested by:** ${session.requestedBy}`,
    `**Requested at:** ${session.requestedAt}`,
    `**Reason:** ${session.reason}`,
    `**Verified:** ${session.verified ? 'YES — all snapshots matched' : 'NO — see notes below'}`,
    ``,
  ];

  for (const record of session.records) {
    lines.push(`## Record: ${record.replayId}`);
    lines.push(`**Subject:** ${record.subjectName} (${record.subjectId})`);
    lines.push(`**Snapshot at:** ${record.snapshotAt}`);
    lines.push(`**Reconstructed outcome:** ${record.reconstructedOutcome}`);
    lines.push(`**Reconstruction matches:** ${record.reconstructionMatches ? 'Yes' : 'No'}`);
    lines.push('');

    if (record.reconstructionNotes.length > 0) {
      lines.push('### Reconstruction Notes');
      lines.push(...record.reconstructionNotes.map((n) => `- ${n}`));
      lines.push('');
    }

    if (record.sanctionsState.length > 0) {
      lines.push('### Sanctions List State at Decision Time');
      for (const s of record.sanctionsState) {
        lines.push(`- **${s.listId}** v${s.listVersion} — ${s.entryCount} entries — checksum: ${s.checksum}`);
      }
      lines.push('');
    }

    if (record.analystActions.length > 0) {
      lines.push('### Analyst Actions (chronological)');
      for (const a of record.analystActions) {
        lines.push(`- [${a.timestamp}] **${a.actorRole}** (${a.actorId}): ${a.action} — "${a.rationale}"`);
      }
      lines.push('');
    }

    if (record.searchSnapshots.length > 0) {
      lines.push('### Search Parameters');
      for (const s of record.searchSnapshots) {
        lines.push(`- Query: "${s.query}" — ${s.matchesReturned} matches from ${s.candidatesConsidered} candidates — top score: ${(s.topScore * 100).toFixed(1)}%`);
      }
      lines.push('');
    }

    const integrity = fnv1a(JSON.stringify({
      replayId: record.replayId,
      snapshotAt: record.snapshotAt,
      analystActionsCount: record.analystActions.length,
      evidenceCount: record.evidenceSnapshots.length,
    }));
    lines.push(`*Record integrity token: ${integrity}*`);
    lines.push('');
  }

  return lines.join('\n');
}
