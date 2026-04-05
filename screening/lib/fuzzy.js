/**
 * String similarity metrics for sanctions name matching.
 *
 * All functions return a similarity score in [0, 1] where 1 is a perfect
 * match. The scoring module combines these with phonetic agreement.
 */

/**
 * Levenshtein edit distance with a symmetric O(n*m) implementation using
 * two rolling rows. Returns raw edit count; callers normalize if needed.
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Normalized Levenshtein similarity in [0, 1].
 */
export function levenshteinSim(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - d / maxLen;
}

/**
 * Jaro similarity — the base metric behind Jaro–Winkler. Works well for
 * short strings like personal names with transpositions.
 */
export function jaro(a, b) {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (!aLen || !bLen) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);
  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (
    matches / aLen +
    matches / bLen +
    (matches - transpositions) / matches
  ) / 3;
}

/**
 * Jaro–Winkler — boosts scores for strings sharing a common prefix, which
 * is desirable for names where surnames are often transliterated
 * identically but given names vary.
 */
export function jaroWinkler(a, b, prefixScale = 0.1, maxPrefix = 4) {
  if (!a || !b) return 0;
  const j = jaro(a, b);
  let prefix = 0;
  for (let i = 0; i < Math.min(a.length, b.length, maxPrefix); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * prefixScale * (1 - j);
}

/**
 * Token set ratio — inspired by fuzzywuzzy. Robust to word reordering and
 * to one string being a subset of the other. Returns [0, 1].
 *
 * Computes three similarities over:
 *   sorted intersection
 *   sorted intersection + remainder of a
 *   sorted intersection + remainder of b
 * and returns the maximum.
 */
export function tokenSetRatio(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection = [...aSet].filter(t => bSet.has(t)).sort();
  const aDiff = [...aSet].filter(t => !bSet.has(t)).sort();
  const bDiff = [...bSet].filter(t => !aSet.has(t)).sort();
  const t0 = intersection.join(' ');
  const t1 = (t0 + ' ' + aDiff.join(' ')).trim();
  const t2 = (t0 + ' ' + bDiff.join(' ')).trim();
  return Math.max(
    levenshteinSim(t0, t1),
    levenshteinSim(t0, t2),
    levenshteinSim(t1, t2)
  );
}

/**
 * Token sort ratio — sort both token lists alphabetically, then compare.
 * Cheaper than tokenSetRatio and catches reordering without subset logic.
 */
export function tokenSortRatio(aTokens, bTokens) {
  const a = [...aTokens].sort().join(' ');
  const b = [...bTokens].sort().join(' ');
  return levenshteinSim(a, b);
}

/**
 * Partial ratio — how well the shorter string matches as a substring of
 * the longer, using a sliding window of Levenshtein similarity. Catches
 * cases like "Mohammed Bin Salman" vs "Mohammed Bin Salman Al Saud".
 */
export function partialRatio(a, b) {
  if (!a || !b) return 0;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter === longer) return 1;
  let best = 0;
  const winLen = shorter.length;
  for (let i = 0; i <= longer.length - winLen; i++) {
    const slice = longer.slice(i, i + winLen);
    const sim = levenshteinSim(shorter, slice);
    if (sim > best) best = sim;
    if (best === 1) break;
  }
  return best;
}
