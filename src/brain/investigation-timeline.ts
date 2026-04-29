// Hawkeye Sterling — investigation timeline builder.
// Merges evidence items + audit-chain entries + transactions into a single
// ordered timeline, annotated with actor, phase (intake / screen /
// disposition / escalate / filing / freeze / exit), and a human summary.
// Renders as plain text or structured events.

import type { EvidenceItem } from './evidence.js';
import type { AuditEntry } from './audit-chain.js';

export type TimelinePhase =
  | 'intake'
  | 'cdd'
  | 'screen'
  | 'monitor'
  | 'alert'
  | 'investigate'
  | 'disposition'
  | 'escalate'
  | 'filing'
  | 'freeze'
  | 'exit'
  | 'audit'
  | 'other';

export interface TimelineEvent {
  at: string;             // ISO 8601
  phase: TimelinePhase;
  actor: string;
  summary: string;
  sourceKind: 'evidence' | 'audit' | 'transaction' | 'note';
  sourceId: string;
}

export interface TimelineTransaction {
  id: string;
  at: string;
  amountAed: number;
  channel: string;
  counterparty?: string;
}

function phaseFromAction(action: string): TimelinePhase {
  const a = action.toLowerCase();
  if (/(onboard|cdd|kyc|prospect)/.test(a)) return 'cdd';
  if (/(screen|list_walk|match)/.test(a)) return 'screen';
  if (/(monitor|rescreen|delta)/.test(a)) return 'monitor';
  if (/(alert|flag)/.test(a)) return 'alert';
  if (/(disposition|verdict|approve|clear)/.test(a)) return 'disposition';
  if (/(escalate|heightened)/.test(a)) return 'escalate';
  if (/(str|sar|ffr|pnmr|goaml|filing)/.test(a)) return 'filing';
  if (/(freeze|seize)/.test(a)) return 'freeze';
  if (/(exit|offboard|terminate)/.test(a)) return 'exit';
  if (/(investigat|deep[-_ ]dive|edd)/.test(a)) return 'investigate';
  if (/(audit|lookback|review)/.test(a)) return 'audit';
  if (/(intake|case\.open|case_opened)/.test(a)) return 'intake';
  return 'other';
}

function summariseAudit(entry: AuditEntry): string {
  const payload = entry.payload as Record<string, unknown> | null | undefined;
  if (!payload) return `${entry.action}`;
  const bits: string[] = [`${entry.action}`];
  for (const k of ['caseId', 'subject', 'modeId', 'verdict', 'decision', 'count', 'elapsedMs']) {
    if (k in payload) bits.push(`${k}=${String(payload[k])}`);
  }
  return bits.join(' · ');
}

function summariseEvidence(ev: EvidenceItem): string {
  const bits: string[] = [];
  bits.push(`[${ev.kind}]`);
  if (ev.publisher) bits.push(ev.publisher);
  bits.push(ev.title);
  if (ev.credibility) bits.push(`credibility=${ev.credibility}`);
  return bits.join(' · ');
}

export function buildTimeline(input: {
  evidence?: readonly EvidenceItem[];
  audit?: readonly AuditEntry[];
  transactions?: readonly TimelineTransaction[];
  notes?: readonly { at: string; actor: string; summary: string; id: string }[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const ev of input.evidence ?? []) {
    events.push({
      at: ev.observedAt,
      phase: ev.kind === 'training_data' ? 'other' : 'investigate',
      actor: ev.publisher ?? 'system',
      summary: summariseEvidence(ev),
      sourceKind: 'evidence',
      sourceId: ev.id,
    });
  }

  for (const a of input.audit ?? []) {
    events.push({
      at: a.timestamp,
      phase: phaseFromAction(a.action),
      actor: a.actor,
      summary: summariseAudit(a),
      sourceKind: 'audit',
      sourceId: `seq#${a.seq}`,
    });
  }

  for (const t of input.transactions ?? []) {
    const phase: TimelinePhase = t.amountAed >= 55_000 ? 'alert' : 'monitor';
    events.push({
      at: t.at,
      phase,
      actor: t.counterparty ?? 'counterparty',
      summary: `transaction ${t.channel} · ${t.amountAed.toLocaleString()} AED${t.counterparty ? ` · ${t.counterparty}` : ''}`,
      sourceKind: 'transaction',
      sourceId: t.id,
    });
  }

  for (const n of input.notes ?? []) {
    events.push({ at: n.at, phase: 'other', actor: n.actor, summary: n.summary, sourceKind: 'note', sourceId: n.id });
  }

  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function renderTimeline(events: readonly TimelineEvent[]): string {
  const lines: string[] = [];
  lines.push('Investigation timeline');
  lines.push('======================');
  for (const e of events) {
    lines.push(`${e.at.slice(0, 19).replace('T', ' ')}  [${e.phase.toUpperCase()}]  ${e.actor}  ·  ${e.summary}`);
  }
  return lines.join('\n');
}

export interface PhaseSummary {
  phase: TimelinePhase;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
}

export function summariseByPhase(events: readonly TimelineEvent[]): PhaseSummary[] {
  const map = new Map<TimelinePhase, PhaseSummary>();
  for (const e of events) {
    const cur = map.get(e.phase) ?? { phase: e.phase, count: 0, firstAt: null, lastAt: null };
    cur.count++;
    if (cur.firstAt === null || Date.parse(e.at) < Date.parse(cur.firstAt)) cur.firstAt = e.at;
    if (cur.lastAt === null || Date.parse(e.at) > Date.parse(cur.lastAt)) cur.lastAt = e.at;
    map.set(e.phase, cur);
  }
  return [...map.values()];
}
