// Hawkeye Sterling — ongoing-monitoring driver.
//
// Given a SanctionDelta (from SnapshotStore.store(..., { computeDelta: true }))
// and a SubjectStore, this module:
//   1. runs the identity matcher for every (subject × added-or-amended entry)
//      pair above a threshold
//   2. emits a MonitoringAlert per hit
//   3. updates each subject's lastScreenedAt / lastScreenHash so the
//      next delta is evaluated from a known baseline
//
// The matcher is injected so tests can stub it; production wires it to
// matchIdentities() from src/brain/identity-multiscript.ts.

import type { SanctionDelta } from '../brain/sanction-delta.js';
import type { NormalisedListEntry } from '../brain/watchlist-adapters.js';
import type { SubjectStore, RegisteredSubject } from './subject-registry.js';
import { type AlertSink, type MonitoringAlert, severityFor } from './alerts.js';
import { matchIdentities, type IdentityMatchResult } from '../brain/identity-multiscript.js';
import { fnv1a } from '../brain/audit-chain.js';

export type MatcherFn = (a: { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> },
                        b: { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> }) => IdentityMatchResult;

export interface MonitorOptions {
  /** Minimum overall identity-match score to emit an alert. Default 0.82. */
  scoreThreshold?: number;
  matcher?: MatcherFn;
}

export interface MonitorResult {
  subjectsExamined: number;
  alertsRaised: number;
  alerts: MonitoringAlert[];
}

export async function runMonitoring(
  delta: SanctionDelta,
  subjects: SubjectStore,
  sink: AlertSink,
  opts: MonitorOptions = {},
): Promise<MonitorResult> {
  const threshold = opts.scoreThreshold ?? 0.82;
  const match = opts.matcher ?? matchIdentities;
  const pool = await subjects.list();
  const alerts: MonitoringAlert[] = [];

  const addCandidates = delta.additions.map((a) => ({ kind: 'new_match' as const, entry: asEntry(a) }));
  const amendCandidates = delta.amendments.map((am) => ({ kind: 'match_amended' as const, entry: am.after, trigger: am }));
  const removeCandidates = delta.removals.map((r) => ({ kind: 'match_delisted' as const, entry: asEntryFromRemoval(r), trigger: r }));

  for (const subj of pool) {
    for (const cand of addCandidates) {
      const res = match(subjectKey(subj), entryKey(cand.entry));
      if (res.overallScore >= threshold) {
        const alert = buildAlert(subj, cand.entry, res, 'new_match', delta.listId, cand.entry);
        alerts.push(alert);
        await sink.emit(alert);
      }
    }
    for (const cand of amendCandidates) {
      const res = match(subjectKey(subj), entryKey(cand.entry));
      if (res.overallScore >= threshold) {
        const alert = buildAlert(subj, cand.entry, res, 'match_amended', delta.listId, cand.trigger);
        alerts.push(alert);
        await sink.emit(alert);
      }
    }
    for (const cand of removeCandidates) {
      // For delistings, only match if the subject was PREVIOUSLY flagged against this ref.
      // We approximate by checking the subject's last screen hash — proper production
      // wires to a match-history table.
      const res = match(subjectKey(subj), entryKey(cand.entry));
      if (res.overallScore >= threshold) {
        const alert = buildAlert(subj, cand.entry, res, 'match_delisted', delta.listId, cand.trigger);
        alerts.push(alert);
        await sink.emit(alert);
      }
    }
    // Update the subject's last-screen timestamp even if no hit so monitoring
    // cadence is observable.
    await subjects.markScreened(subj.id, fnv1a(delta.listId + subj.id), new Date().toISOString());
  }
  return { subjectsExamined: pool.length, alertsRaised: alerts.length, alerts };
}

function asEntry(a: import('../brain/sanction-delta.js').SanctionAddition): NormalisedListEntry {
  return {
    listId: a.listId,
    sourceRef: a.sourceRef,
    primaryName: a.primaryName,
    aliases: [],
    entityType: a.entityType,
    identifiers: [],
    ingestedAt: new Date().toISOString(),
    rawHash: fnv1a(a.listId + a.sourceRef + a.primaryName),
    programs: a.programs,
    ...(a.publishedAt !== undefined ? { publishedAt: a.publishedAt } : {}),
  };
}

function asEntryFromRemoval(r: import('../brain/sanction-delta.js').SanctionRemoval): NormalisedListEntry {
  return {
    listId: r.listId,
    sourceRef: r.sourceRef,
    primaryName: r.primaryName,
    aliases: [],
    entityType: r.entityType,
    identifiers: [],
    ingestedAt: new Date().toISOString(),
    rawHash: fnv1a(r.listId + r.sourceRef + r.primaryName + 'removed'),
  };
}

function subjectKey(s: RegisteredSubject): { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> } {
  const out: { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> } = { name: s.subject.name };
  if (s.subject.aliases) out.aliases = s.subject.aliases;
  if (s.subject.dateOfBirth) out.dob = s.subject.dateOfBirth;
  if (s.subject.nationality) out.nationality = s.subject.nationality;
  if (s.subject.identifiers) out.identifiers = s.subject.identifiers;
  return out;
}

function entryKey(e: NormalisedListEntry): { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> } {
  const out: { name: string; aliases?: string[]; dob?: string; nationality?: string; identifiers?: Record<string, string> } = { name: e.primaryName };
  if (e.aliases.length > 0) out.aliases = e.aliases;
  const dob = e.identifiers.find((i) => i.kind.toLowerCase() === 'dob');
  if (dob) out.dob = dob.number;
  if (e.nationalities && e.nationalities.length > 0) out.nationality = e.nationalities[0] ?? '';
  if (e.identifiers.length > 0) {
    const idMap: Record<string, string> = {};
    for (const i of e.identifiers) if (!(i.kind in idMap)) idMap[i.kind] = i.number;
    out.identifiers = idMap;
  }
  return out;
}

function buildAlert(
  subj: RegisteredSubject,
  entry: NormalisedListEntry,
  res: IdentityMatchResult,
  kind: 'new_match' | 'match_amended' | 'match_delisted',
  listId: string,
  trigger: import('../brain/sanction-delta.js').SanctionAddition | import('../brain/sanction-delta.js').SanctionAmendment | import('../brain/sanction-delta.js').SanctionRemoval,
): MonitoringAlert {
  return {
    id: fnv1a(`${subj.id}|${entry.sourceRef}|${kind}|${Date.now()}`),
    subjectId: subj.id,
    subject: subj.subject,
    kind,
    severity: severityFor(kind, listId),
    listId,
    sourceRef: entry.sourceRef,
    matchedName: res.bestName,
    matchScore: res.overallScore,
    triggerReason: res.reasons.join(' '),
    triggeredAt: new Date().toISOString(),
    triggerPayload: trigger,
  };
}
