// Hawkeye Sterling — composite entity resolver.
// Decides whether two entity records refer to the same real-world entity.
// Composes: name ensemble (matching.ts), alias expansion (aliases.ts),
// identifier overlap, DOB/incorporation-date proximity, nationality match.
// Applies charter caps via confidence.ts — never merges in the face of a
// strong-identifier conflict.

import { matchEnsemble } from './matching.js';
import { expandAliases } from './aliases.js';
import { calibrateConfidence, type DisambiguatorState } from './confidence.js';
import type { MatchConfidenceLevel } from '../policy/systemPrompt.js';

export interface EntityRecord {
  id: string;
  name: string;
  aliases?: string[];
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  nationality?: string;
  dateOfBirth?: string;
  dateOfIncorporation?: string;
  identifiers?: Array<{ kind: string; number: string; issuer?: string }>;
  commonName?: boolean;
}

export interface ResolutionResult {
  confidence: MatchConfidenceLevel;
  score: number;
  bestPair?: { a: string; b: string };
  agreements: string[];
  disagreements: string[];
  sharedIdentifiers: string[];
  conflictingIdentifiers: string[];
  rationale: string;
  caps: string[];
}

function yearsBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / (365.25 * 86_400_000);
}

function identifierKey(i: { kind: string; number: string }): string {
  return `${i.kind}::${i.number.replace(/\s+/g, '')}`;
}

export function resolveEntities(a: EntityRecord, b: EntityRecord): ResolutionResult {
  if (a.entityType !== b.entityType) {
    return {
      confidence: 'NO_MATCH',
      score: 0,
      agreements: [],
      disagreements: ['entity type differs'],
      sharedIdentifiers: [],
      conflictingIdentifiers: [],
      rationale: 'Entity types differ; not resolvable as same entity.',
      caps: ['entity-type-mismatch'],
    };
  }

  const aliasesA = [a.name, ...(a.aliases ?? [])].flatMap((n) => expandAliases(n).variants);
  const aliasesB = [b.name, ...(b.aliases ?? [])].flatMap((n) => expandAliases(n).variants);

  // Pairwise best name match across both alias sets.
  let best = { score: 0, method: 'exact', subject: a.name, candidate: b.name };
  for (const na of aliasesA) {
    for (const nb of aliasesB) {
      const e = matchEnsemble(na, nb);
      if (e.best.score > best.score) {
        best = { score: e.best.score, method: e.best.method, subject: na, candidate: nb };
      }
    }
  }

  const sharedIds: string[] = [];
  const conflictingIds: string[] = [];
  const idsA = (a.identifiers ?? []).map(identifierKey);
  const idsB = (b.identifiers ?? []).map(identifierKey);
  const setB = new Set(idsB);
  for (const idA of idsA) if (setB.has(idA)) sharedIds.push(idA);
  // Same kind, different number => conflict.
  const byKindA = new Map((a.identifiers ?? []).map((i) => [i.kind, i.number.replace(/\s+/g, '')]));
  for (const idB of b.identifiers ?? []) {
    const numA = byKindA.get(idB.kind);
    const numB = idB.number.replace(/\s+/g, '');
    if (numA && numA !== numB) conflictingIds.push(`${idB.kind}: ${numA} ≠ ${numB}`);
  }

  const strongPresent: DisambiguatorState['strong']['present'] = [];
  const strongAbsent: DisambiguatorState['strong']['absent'] = [];
  const strongConflicting: DisambiguatorState['strong']['conflicting'] = [];

  if (a.dateOfBirth && b.dateOfBirth) {
    const y = yearsBetween(a.dateOfBirth, b.dateOfBirth);
    if (y !== null && y <= 1 / 365.25) strongPresent.push('dob');
    else if (y !== null) strongConflicting.push('dob');
    else strongAbsent.push('dob');
  } else strongAbsent.push('dob');

  if (a.nationality && b.nationality) {
    if (a.nationality.toUpperCase() === b.nationality.toUpperCase()) strongPresent.push('nationality');
    else strongConflicting.push('nationality');
  } else strongAbsent.push('nationality');

  if (sharedIds.length > 0) strongPresent.push('passport_number');
  if (conflictingIds.length > 0) strongConflicting.push('passport_number');

  const d: DisambiguatorState = {
    strong: { present: strongPresent, absent: strongAbsent, conflicting: strongConflicting },
    contextual: { present: [], absent: [] },
    commonName: !!(a.commonName || b.commonName),
    transliterated: false,
    nativeScriptCorroborated: false,
  };

  const ensemble = {
    subject: best.subject,
    candidate: best.candidate,
    scores: [],
    best: { method: best.method as 'exact', score: best.score, threshold: 0, pass: true },
    phoneticAgreement: true,
  } as const;

  const cal = calibrateConfidence(ensemble as never, d);

  const agreements: string[] = [];
  const disagreements: string[] = [];
  if (a.entityType === b.entityType) agreements.push(`same entity type (${a.entityType})`);
  if (sharedIds.length) agreements.push(`shared identifiers: ${sharedIds.join(', ')}`);
  if (conflictingIds.length) disagreements.push(`conflicting identifiers: ${conflictingIds.join(', ')}`);
  agreements.push(`best name match ${best.method}=${best.score.toFixed(3)}`);

  return {
    confidence: cal.level,
    score: best.score,
    bestPair: { a: best.subject, b: best.candidate },
    agreements,
    disagreements,
    sharedIdentifiers: sharedIds,
    conflictingIdentifiers: conflictingIds,
    rationale: cal.rationale,
    caps: cal.caps,
  };
}
