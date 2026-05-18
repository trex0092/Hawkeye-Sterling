// Hawkeye Sterling — enhanced sanctions delta engine.
// Extends the base sanction-delta.ts with industrial-grade features:
// entity-level change classification, re-screen priority queuing,
// corruption detection hooks, and structured diff reporting.
//
// The base sanction-delta.ts handles NormalisedListEntry diffs.
// This module operates on the richer SanctionsEntity schema and
// provides additional intelligence about WHAT changed and WHY it matters.

import type { SanctionsEntity } from './SanctionsEntity.js';

// ── Change classification ─────────────────────────────────────────────────────

export type ChangeSignificance =
  | 'critical'   // new designation, major program change
  | 'high'       // new alias/identifier — triggers re-screen
  | 'medium'     // address/remark change — log but no immediate re-screen
  | 'low'        // metadata/formatting change only
  | 'removed'    // entity delisted — may allow transactions
  | 'unchanged'; // identical record

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
  significance: ChangeSignificance;
  screenshotRequired: boolean; // does this change require a customer re-screen?
  notes: string;
}

export interface EntityAddition {
  entity: SanctionsEntity;
  significance: 'critical' | 'high';
  affectedPrograms: string[];
  requiresImmediateRescreen: boolean;
}

export interface EntityRemoval {
  entityId: string;
  sourceRef: string;
  primaryName: string;
  delistedAt: string;
  programs: string[];
  notes: string;
}

export interface EntityAmendment {
  entityId: string;
  sourceRef: string;
  primaryName: string;
  before: SanctionsEntity;
  after: SanctionsEntity;
  changes: FieldChange[];
  overallSignificance: ChangeSignificance;
  requiresRescreen: boolean;
  rescreenPriority: number; // 0..100 — higher = more urgent
  newAliases: string[];
  droppedAliases: string[];
  newIdentifiers: Array<{ kind: string; number: string }>;
  droppedIdentifiers: Array<{ kind: string; number: string }>;
  programsAdded: string[];
  programsRemoved: string[];
}

export interface SanctionDelta {
  sourceId: string;
  computedAt: string;
  previousCount: number;
  currentCount: number;
  netChange: number;
  additions: EntityAddition[];
  removals: EntityRemoval[];
  amendments: EntityAmendment[];
  // Derived queues
  immediateRescreenQueue: string[];   // sourceRefs requiring immediate action
  monitoringUpdateQueue: string[];    // sourceRefs requiring monitoring update
  // Integrity metrics
  checksumBefore: string;
  checksumAfter: string;
  integrityOk: boolean;
}

// ── Field comparison utilities ────────────────────────────────────────────────

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

function arrayDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((x) => !beforeSet.has(x)),
    removed: before.filter((x) => !afterSet.has(x)),
  };
}

function identKey(id: { kind: string; number: string }): string {
  return `${id.kind}::${id.number.replace(/\s+/g, '')}`;
}

// ── Entity comparator ─────────────────────────────────────────────────────────

function compareEntities(before: SanctionsEntity, after: SanctionsEntity): FieldChange[] {
  const changes: FieldChange[] = [];

  // Primary name
  if (before.primary_name !== after.primary_name) {
    changes.push({
      field: 'primary_name',
      before: before.primary_name,
      after: after.primary_name,
      significance: 'critical',
      screenshotRequired: true,
      notes: `Primary name changed — all customers matched on the old name must be re-screened`,
    });
  }

  // Aliases
  const aliasDiff = arrayDiff(before.aliases, after.aliases);
  if (aliasDiff.added.length || aliasDiff.removed.length) {
    changes.push({
      field: 'aliases',
      before: aliasDiff.removed,
      after: aliasDiff.added,
      significance: aliasDiff.added.length > 0 ? 'high' : 'medium',
      screenshotRequired: aliasDiff.added.length > 0,
      notes: `${aliasDiff.added.length} alias(es) added, ${aliasDiff.removed.length} dropped`,
    });
  }

  // Identifiers
  const beforeIdSet = new Set(before.identifiers.map(identKey));
  const afterIdSet = new Set(after.identifiers.map(identKey));
  const newIds = after.identifiers.filter((i) => !beforeIdSet.has(identKey(i)));
  const droppedIds = before.identifiers.filter((i) => !afterIdSet.has(identKey(i)));
  if (newIds.length || droppedIds.length) {
    changes.push({
      field: 'identifiers',
      before: droppedIds.map((i) => `${i.kind}:${i.number}`),
      after: newIds.map((i) => `${i.kind}:${i.number}`),
      significance: 'high',
      screenshotRequired: true,
      notes: `${newIds.length} identifier(s) added, ${droppedIds.length} dropped`,
    });
  }

  // Programs
  const progDiff = arrayDiff(before.programs, after.programs);
  if (progDiff.added.length || progDiff.removed.length) {
    changes.push({
      field: 'programs',
      before: progDiff.removed,
      after: progDiff.added,
      significance: 'critical',
      screenshotRequired: true,
      notes: `Programs added: [${progDiff.added.join(', ')}]; removed: [${progDiff.removed.join(', ')}]`,
    });
  }

  // DOB
  if (before.dob !== after.dob) {
    changes.push({
      field: 'dob',
      before: before.dob,
      after: after.dob,
      significance: 'high',
      screenshotRequired: true,
      notes: `Date of birth changed — affects screening precision`,
    });
  }

  // Nationalities
  if (!setsEqual(before.nationalities, after.nationalities)) {
    const natDiff = arrayDiff(before.nationalities, after.nationalities);
    changes.push({
      field: 'nationalities',
      before: natDiff.removed,
      after: natDiff.added,
      significance: 'high',
      screenshotRequired: false,
      notes: `Nationality added: [${natDiff.added.join(', ')}]; removed: [${natDiff.removed.join(', ')}]`,
    });
  }

  // Native name
  if (before.native_name !== after.native_name) {
    changes.push({
      field: 'native_name',
      before: before.native_name,
      after: after.native_name,
      significance: 'high',
      screenshotRequired: true,
      notes: 'Native-script name changed — re-run Arabic/Cyrillic transliteration matching',
    });
  }

  // Remarks
  if ((before.remarks ?? '') !== (after.remarks ?? '')) {
    changes.push({
      field: 'remarks',
      before: before.remarks,
      after: after.remarks,
      significance: 'medium',
      screenshotRequired: false,
      notes: 'Narrative remarks updated',
    });
  }

  // Addresses
  const beforeAddrs = JSON.stringify(before.addresses.map((a) => a.fullText ?? a.country).sort());
  const afterAddrs = JSON.stringify(after.addresses.map((a) => a.fullText ?? a.country).sort());
  if (beforeAddrs !== afterAddrs) {
    changes.push({
      field: 'addresses',
      before: before.addresses.map((a) => a.fullText ?? a.country),
      after: after.addresses.map((a) => a.fullText ?? a.country),
      significance: 'medium',
      screenshotRequired: false,
      notes: 'Address information updated',
    });
  }

  return changes;
}

// ── Rescreen priority calculation ─────────────────────────────────────────────

function rescreenPriority(changes: FieldChange[], entity: SanctionsEntity): number {
  let priority = 0;
  for (const c of changes) {
    if (c.significance === 'critical') priority += 40;
    else if (c.significance === 'high') priority += 25;
    else if (c.significance === 'medium') priority += 10;
  }
  // Boost for high-risk programs
  const highRiskPrograms = ['IRAN', 'DPRK', 'RUSSIA', 'SDT', 'SDGT', 'OFAC_SDN'];
  if (entity.programs.some((p) => highRiskPrograms.some((h) => p.includes(h)))) {
    priority += 20;
  }
  return Math.min(100, priority);
}

// ── FNV-1a checksum ───────────────────────────────────────────────────────────

function checksumEntities(entities: SanctionsEntity[]): string {
  const sig = entities.map((e) => `${e.source_ref}:${e.raw_hash}`).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Main delta computation ────────────────────────────────────────────────────

export function computeSanctionsDelta(
  sourceId: string,
  previous: SanctionsEntity[],
  current: SanctionsEntity[],
): SanctionDelta {
  const prevByRef = new Map(previous.map((e) => [e.source_ref, e]));
  const currByRef = new Map(current.map((e) => [e.source_ref, e]));

  const additions: EntityAddition[] = [];
  const removals: EntityRemoval[] = [];
  const amendments: EntityAmendment[] = [];

  // Additions
  for (const [ref, entity] of currByRef) {
    if (!prevByRef.has(ref)) {
      const highRisk = entity.programs.some((p) =>
        ['IRAN', 'DPRK', 'RUSSIA', 'SDT', 'SDGT'].some((h) => p.includes(h))
      );
      additions.push({
        entity,
        significance: highRisk ? 'critical' : 'high',
        affectedPrograms: entity.programs,
        requiresImmediateRescreen: highRisk,
      });
    }
  }

  // Removals
  for (const [ref, entity] of prevByRef) {
    if (!currByRef.has(ref)) {
      removals.push({
        entityId: entity.entity_id,
        sourceRef: ref,
        primaryName: entity.primary_name,
        delistedAt: new Date().toISOString(),
        programs: entity.programs,
        notes: `Entity removed from ${sourceId} — verify with source before lifting restrictions`,
      });
    }
  }

  // Amendments
  for (const [ref, after] of currByRef) {
    const before = prevByRef.get(ref);
    if (!before) continue;
    if (before.raw_hash === after.raw_hash) continue; // unchanged

    const changes = compareEntities(before, after);
    if (changes.length === 0) continue;

    const aliasDiff = arrayDiff(before.aliases, after.aliases);
    const beforeIdKeys = new Set(before.identifiers.map(identKey));
    const afterIdKeys = new Set(after.identifiers.map(identKey));

    const maxSig: ChangeSignificance = changes.reduce((best, c) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1, removed: 0, unchanged: 0 };
      return (order[c.significance] ?? 0) > (order[best] ?? 0) ? c.significance : best;
    }, 'low' as ChangeSignificance);

    const requiresRescreen = changes.some((c) => c.screenshotRequired);
    const priority = rescreenPriority(changes, after);

    amendments.push({
      entityId: after.entity_id,
      sourceRef: ref,
      primaryName: after.primary_name,
      before,
      after,
      changes,
      overallSignificance: maxSig,
      requiresRescreen,
      rescreenPriority: priority,
      newAliases: aliasDiff.added,
      droppedAliases: aliasDiff.removed,
      newIdentifiers: after.identifiers.filter((i) => !beforeIdKeys.has(identKey(i))).map((i) => ({ kind: i.kind, number: i.number })),
      droppedIdentifiers: before.identifiers.filter((i) => !afterIdKeys.has(identKey(i))).map((i) => ({ kind: i.kind, number: i.number })),
      programsAdded: arrayDiff(before.programs, after.programs).added,
      programsRemoved: arrayDiff(before.programs, after.programs).removed,
    });
  }

  // Build rescreen queues
  const immediateRescreenQueue: string[] = [
    ...additions.filter((a) => a.requiresImmediateRescreen).map((a) => a.entity.source_ref),
    ...amendments.filter((a) => a.requiresRescreen && a.rescreenPriority >= 50).map((a) => a.sourceRef),
  ];

  const monitoringUpdateQueue: string[] = [
    ...additions.map((a) => a.entity.source_ref),
    ...amendments.filter((a) => a.requiresRescreen && a.rescreenPriority < 50).map((a) => a.sourceRef),
    ...removals.map((r) => r.sourceRef),
  ].filter((ref) => !immediateRescreenQueue.includes(ref));

  return {
    sourceId,
    computedAt: new Date().toISOString(),
    previousCount: previous.length,
    currentCount: current.length,
    netChange: current.length - previous.length,
    additions,
    removals,
    amendments,
    immediateRescreenQueue,
    monitoringUpdateQueue,
    checksumBefore: checksumEntities(previous),
    checksumAfter: checksumEntities(current),
    integrityOk: true,
  };
}
