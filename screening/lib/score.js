/**
 * Composite match scoring.
 *
 * Given a query entity and a candidate list entity, produce a single
 * score in [0, 1] plus a band ("low" | "medium" | "high" | "exact") and
 * a breakdown of contributing signals. The breakdown is persisted in the
 * audit log so a reviewer can see exactly why a hit fired.
 *
 * Weights were chosen so that:
 *   - a single strong signal is not enough to fire a "high" hit
 *   - phonetic agreement materially lifts borderline string matches
 *   - date-of-birth / country agreement can push a mid score to high
 *   - date-of-birth conflict caps the final score at 0.85
 */

import { normalize } from './normalize.js';
import { phoneticKeys } from './phonetic.js';
import { jaroWinkler, tokenSetRatio, tokenSortRatio, partialRatio, levenshteinSim } from './fuzzy.js';

// Tunable thresholds. Callers can override via config.
export const DEFAULT_THRESHOLDS = {
  reject: 0.62,   // below this → drop silently
  low: 0.72,      // low-confidence — reviewer optional
  medium: 0.82,   // medium — reviewer required
  high: 0.92,     // high — block + escalate
};

function classify(score, t = DEFAULT_THRESHOLDS) {
  if (score >= 0.995) return 'exact';
  if (score >= t.high) return 'high';
  if (score >= t.medium) return 'medium';
  if (score >= t.low) return 'low';
  return 'reject';
}

/**
 * Compare two normalized name bundles (output of normalize()) and return
 * a string-similarity sub-score in [0, 1].
 */
export function nameScore(qn, cn) {
  if (!qn.stripped || !cn.stripped) return 0;
  // Character-level
  const jw = jaroWinkler(qn.stripped, cn.stripped);
  const lev = levenshteinSim(qn.stripped, cn.stripped);
  // Token-level
  const tset = tokenSetRatio(qn.tokens, cn.tokens);
  const tsort = tokenSortRatio(qn.tokens, cn.tokens);
  // Substring
  const partial = partialRatio(qn.stripped, cn.stripped);
  // Weighted blend. Token-set dominates because it handles reordering +
  // subset, which is the most common real-world variation on sanctions
  // lists ("Al-Qaida" vs "Al-Qaeda in the Arabian Peninsula").
  return (
    jw * 0.20 +
    lev * 0.10 +
    tset * 0.35 +
    tsort * 0.20 +
    partial * 0.15
  );
}

/**
 * Phonetic agreement sub-score. 1 if any phonetic key matches, 0 otherwise.
 * Works across all candidate aliases.
 */
export function phoneticScore(qName, cNames) {
  const qKeys = new Set(phoneticKeys(qName));
  if (!qKeys.size) return 0;
  for (const n of cNames) {
    for (const k of phoneticKeys(n)) {
      if (qKeys.has(k)) return 1;
    }
  }
  return 0;
}

/**
 * Date-of-birth agreement. Returns 1 if both present and equal, -1 if both
 * present and different, 0 if either is missing. Partial dates (year only)
 * are compared on the overlapping precision.
 */
export function dobScore(qDob, cDob) {
  if (!qDob || !cDob) return 0;
  const q = String(qDob).slice(0, 10);
  const c = String(cDob).slice(0, 10);
  if (q === c) return 1;
  // Year-only match: conservative 0.3 to reduce false positives on incomplete DOB data
  if (q.slice(0, 4) && c.slice(0, 4) && q.slice(0, 4) === c.slice(0, 4)) return 0.3;
  return -1;
}

/**
 * Country / nationality agreement. Intersection-based.
 */
export function countryScore(qCountries = [], cCountries = []) {
  if (!qCountries.length || !cCountries.length) return 0;
  const q = new Set(qCountries.map(x => String(x).toLowerCase()));
  for (const c of cCountries) {
    if (q.has(String(c).toLowerCase())) return 1;
  }
  return 0;
}

/**
 * Full composite scoring. `query` is the subject being screened,
 * `candidate` is a stored entity from the sanctions/PEP store.
 *
 * Query shape:
 *   { name, aliases?, dob?, countries?, type? }   // type: 'person' | 'entity'
 *
 * Candidate shape (from store):
 *   { id, source, schema, names[], dob?, countries[], ... }
 */
export function scoreMatch(query, candidate, thresholds = DEFAULT_THRESHOLDS) {
  const qNorm = normalize(query.name);
  const qNames = [query.name, ...(query.aliases || [])];

  // Best name-score across all candidate names (primary + aliases).
  let bestNameScore = 0;
  let bestName = candidate.names[0];
  for (const n of candidate.names) {
    const cNorm = normalize(n);
    const s = nameScore(qNorm, cNorm);
    if (s > bestNameScore) { bestNameScore = s; bestName = n; }
    if (bestNameScore === 1) break;
  }

  const phon = phoneticScore(query.name, candidate.names);
  const dob = dobScore(query.dob, candidate.dob);
  const country = countryScore(query.countries, candidate.countries);

  // Composite: name + phonetic form the base (max 1.0 on a perfect match),
  // dob/country contribute additive bonuses. This lets name-only perfect
  // hits still classify as "exact" when the caller has no dob/country
  // info, while identity-confirming signals can still lift borderlines.
  const base = bestNameScore * 0.85 + phon * 0.15;
  const bonus = Math.max(0, dob) * 0.03 + country * 0.02;
  let composite = Math.min(1, base + bonus);

  // Short single-token queries get a penalty — they produce too many
  // false positives on large lists.
  if (qNorm.tokens.length === 1 && qNorm.stripped.length < 5) composite *= 0.85;

  // Entity-vs-person schema mismatch — reduce.
  if (query.type && candidate.schema) {
    const cIsPerson = /person/i.test(candidate.schema);
    const qIsPerson = query.type === 'person';
    if (cIsPerson !== qIsPerson) composite *= 0.90;
  }

  // Hard cap on DOB conflict.
  if (dob < 0) composite = Math.min(composite, 0.85);

  composite = Math.max(0, Math.min(1, composite));
  const band = classify(composite, thresholds);

  return {
    score: Number(composite.toFixed(4)),
    band,
    matchedName: bestName,
    signals: {
      name: Number(bestNameScore.toFixed(4)),
      phonetic: phon,
      dob,
      country,
    },
  };
}
