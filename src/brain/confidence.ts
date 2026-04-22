// Hawkeye Sterling — match-confidence calibrator.
// Operationalises the compliance charter's match-confidence taxonomy
// (EXACT / STRONG / POSSIBLE / WEAK / NO MATCH) as a deterministic function
// of ensemble scores + disambiguator presence.
//
// Rules reproduced from the charter (non-negotiable):
//   - A name-only match is NEVER above WEAK.
//   - Common names (high-frequency) are NEVER above POSSIBLE without strong
//     identifiers.
//   - Transliterated matches are NEVER above POSSIBLE without native-script
//     corroboration.
//   - Every classification states disambiguators PRESENT and ABSENT.

import type { EnsembleMatch } from './matching.js';
import {
  MATCH_CONFIDENCE_LEVELS,
  type MatchConfidenceLevel,
} from '../policy/systemPrompt.js';

export type StrongIdentifier =
  | 'dob'
  | 'nationality'
  | 'passport_number'
  | 'national_id'
  | 'registration_number'
  | 'registered_address'
  | 'known_ubo';

export type ContextualIdentifier =
  | 'profession'
  | 'sector'
  | 'city_of_residence'
  | 'country_only'
  | 'employer'
  | 'listed_alias';

export interface DisambiguatorState {
  strong: {
    present: StrongIdentifier[];
    absent: StrongIdentifier[];
    conflicting: StrongIdentifier[];
  };
  contextual: {
    present: ContextualIdentifier[];
    absent: ContextualIdentifier[];
  };
  commonName: boolean;        // subject name is common in the relevant locale
  transliterated: boolean;    // match relied on transliteration
  nativeScriptCorroborated: boolean; // source had native-script confirmation
}

export interface CalibrationResult {
  level: MatchConfidenceLevel;
  rationale: string;
  caps: string[];   // which charter rules engaged a ceiling
  score: number;    // best ensemble score in [0,1]
  method: string;   // method that produced the best score
  disambiguators: DisambiguatorState;
}

function strongCount(d: DisambiguatorState): number {
  return d.strong.present.length;
}
function hasConflict(d: DisambiguatorState): boolean {
  return d.strong.conflicting.length > 0;
}

export function calibrateConfidence(
  ensemble: EnsembleMatch,
  d: DisambiguatorState,
): CalibrationResult {
  const caps: string[] = [];
  const score = ensemble.best.score;
  const method = ensemble.best.method;

  // Any strong-identifier conflict collapses to POSSIBLE at most.
  if (hasConflict(d)) caps.push('strong-identifier-conflict');

  // Start from the ensemble score.
  let level: MatchConfidenceLevel;
  if (score < 0.7) level = 'NO_MATCH';
  else if (score < 0.82) level = 'WEAK';
  else if (score < 0.9) level = 'POSSIBLE';
  else if (score < 0.96) level = 'STRONG';
  else level = 'EXACT';

  const nameOnly = strongCount(d) === 0 && d.contextual.present.length === 0;
  if (nameOnly) {
    if (rank(level) > rank('WEAK')) {
      level = 'WEAK';
      caps.push('name-only-capped-at-weak');
    }
  }

  if (d.commonName && strongCount(d) === 0) {
    if (rank(level) > rank('POSSIBLE')) {
      level = 'POSSIBLE';
      caps.push('common-name-capped-at-possible');
    }
  }

  if (d.transliterated && !d.nativeScriptCorroborated) {
    if (rank(level) > rank('POSSIBLE')) {
      level = 'POSSIBLE';
      caps.push('transliterated-uncorroborated-capped-at-possible');
    }
  }

  // EXACT demands at least TWO strong identifiers per charter.
  if (level === 'EXACT' && strongCount(d) < 2) {
    level = 'STRONG';
    caps.push('exact-requires-two-strong-identifiers');
  }

  // STRONG demands at least ONE strong identifier.
  if (level === 'STRONG' && strongCount(d) < 1) {
    level = 'POSSIBLE';
    caps.push('strong-requires-one-strong-identifier');
  }

  // Hard conflict blocks everything above POSSIBLE.
  if (hasConflict(d) && rank(level) > rank('POSSIBLE')) {
    level = 'POSSIBLE';
    caps.push('conflict-capped-at-possible');
  }

  const rationale = [
    `Best method: ${method} (score ${score.toFixed(3)}).`,
    `Strong identifiers present: ${d.strong.present.join(', ') || 'none'}.`,
    `Strong identifiers absent: ${d.strong.absent.join(', ') || 'none'}.`,
    d.strong.conflicting.length ? `CONFLICT on: ${d.strong.conflicting.join(', ')}.` : '',
    d.commonName ? 'Subject name classified as common in locale.' : '',
    d.transliterated
      ? `Match relied on transliteration; native-script corroborated: ${d.nativeScriptCorroborated ? 'yes' : 'no'}.`
      : '',
    caps.length ? `Caps engaged: ${caps.join(', ')}.` : 'No caps engaged.',
  ]
    .filter(Boolean)
    .join(' ');

  return { level, rationale, caps, score, method, disambiguators: d };
}

function rank(level: MatchConfidenceLevel): number {
  return MATCH_CONFIDENCE_LEVELS.indexOf(level);
}
