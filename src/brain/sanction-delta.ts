// Hawkeye Sterling — sanction-list snapshot delta.
// Compares two NormalisedListEntry snapshots of the same list and surfaces
// what was added, removed, or materially amended between them. Drives
// the delta-screen pass that runs every customer against every new
// designation since the last screen.

import type { NormalisedListEntry } from './watchlist-adapters.js';

export interface SanctionAddition {
  listId: string;
  sourceRef: string;
  primaryName: string;
  entityType: NormalisedListEntry['entityType'];
  programs: string[];
  publishedAt?: string | undefined;
}

export interface SanctionRemoval {
  listId: string;
  sourceRef: string;
  primaryName: string;
  entityType: NormalisedListEntry['entityType'];
  lastSeenAt?: string | undefined;
}

export interface SanctionAmendment {
  listId: string;
  sourceRef: string;
  before: NormalisedListEntry;
  after: NormalisedListEntry;
  fieldsChanged: string[];
  newAliases: string[];
  droppedAliases: string[];
  newIdentifiers: Array<{ kind: string; number: string }>;
  droppedIdentifiers: Array<{ kind: string; number: string }>;
  programsAdded: string[];
  programsRemoved: string[];
}

export interface SanctionDelta {
  listId: string;
  previousCount: number;
  currentCount: number;
  additions: SanctionAddition[];
  removals: SanctionRemoval[];
  amendments: SanctionAmendment[];
}

function identKey(i: { kind: string; number: string }): string {
  return `${i.kind}::${i.number.replace(/\s+/g, '')}`;
}

export function computeSanctionDelta(
  previous: readonly NormalisedListEntry[],
  current: readonly NormalisedListEntry[],
): SanctionDelta {
  const listId = current[0]?.listId ?? previous[0]?.listId ?? 'unknown';

  const prevByRef = new Map<string, NormalisedListEntry>(previous.map((e) => [e.sourceRef, e]));
  const currByRef = new Map<string, NormalisedListEntry>(current.map((e) => [e.sourceRef, e]));

  const additions: SanctionAddition[] = [];
  const removals: SanctionRemoval[] = [];
  const amendments: SanctionAmendment[] = [];

  for (const [ref, after] of currByRef) {
    const before = prevByRef.get(ref);
    if (!before) {
      additions.push({
        listId: after.listId,
        sourceRef: after.sourceRef,
        primaryName: after.primaryName,
        entityType: after.entityType,
        programs: [...(after.programs ?? [])],
        publishedAt: after.publishedAt,
      });
      continue;
    }
    // Diff fields that matter for screening.
    const fieldsChanged: string[] = [];
    if (before.primaryName !== after.primaryName) fieldsChanged.push('primaryName');
    if (before.entityType !== after.entityType) fieldsChanged.push('entityType');
    if ((before.remarks ?? '') !== (after.remarks ?? '')) fieldsChanged.push('remarks');
    if (before.rawHash !== after.rawHash) fieldsChanged.push('rawHash');

    const beforeAliases = new Set(before.aliases);
    const afterAliases = new Set(after.aliases);
    const newAliases = [...afterAliases].filter((a) => !beforeAliases.has(a));
    const droppedAliases = [...beforeAliases].filter((a) => !afterAliases.has(a));

    const beforeIdKeys = new Map<string, { kind: string; number: string }>(
      before.identifiers.map((i) => [identKey(i), { kind: i.kind, number: i.number }]),
    );
    const afterIdKeys = new Map<string, { kind: string; number: string }>(
      after.identifiers.map((i) => [identKey(i), { kind: i.kind, number: i.number }]),
    );
    const newIdentifiers = [...afterIdKeys.entries()].filter(([k]) => !beforeIdKeys.has(k)).map(([, v]) => v);
    const droppedIdentifiers = [...beforeIdKeys.entries()].filter(([k]) => !afterIdKeys.has(k)).map(([, v]) => v);

    const beforePrograms = new Set(before.programs ?? []);
    const afterPrograms = new Set(after.programs ?? []);
    const programsAdded = [...afterPrograms].filter((p) => !beforePrograms.has(p));
    const programsRemoved = [...beforePrograms].filter((p) => !afterPrograms.has(p));

    const materiallyChanged =
      fieldsChanged.length > 0 ||
      newAliases.length > 0 ||
      droppedAliases.length > 0 ||
      newIdentifiers.length > 0 ||
      droppedIdentifiers.length > 0 ||
      programsAdded.length > 0 ||
      programsRemoved.length > 0;

    if (materiallyChanged) {
      amendments.push({
        listId: after.listId,
        sourceRef: after.sourceRef,
        before,
        after,
        fieldsChanged,
        newAliases,
        droppedAliases,
        newIdentifiers,
        droppedIdentifiers,
        programsAdded,
        programsRemoved,
      });
    }
  }

  for (const [ref, before] of prevByRef) {
    if (!currByRef.has(ref)) {
      removals.push({
        listId: before.listId,
        sourceRef: before.sourceRef,
        primaryName: before.primaryName,
        entityType: before.entityType,
        lastSeenAt: before.publishedAt,
      });
    }
  }

  return {
    listId,
    previousCount: previous.length,
    currentCount: current.length,
    additions,
    removals,
    amendments,
  };
}

/** Convenience: collect every entry that requires a re-screen — new
 *  additions + amendments whose name / alias / identifier set changed. */
export function entriesRequiringReScreen(delta: SanctionDelta): string[] {
  const refs = new Set<string>();
  for (const a of delta.additions) refs.add(a.sourceRef);
  for (const am of delta.amendments) {
    if (am.newAliases.length || am.newIdentifiers.length || am.fieldsChanged.includes('primaryName')) {
      refs.add(am.sourceRef);
    }
  }
  return [...refs];
}
