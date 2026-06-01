// Hawkeye Sterling — runtime-configurable fuzzy match thresholds.
//
// AML-09: prior to this module every matcher in matching.ts hardcoded its
// threshold as a literal default parameter (matchLevenshtein at 0.82,
// matchJaroWinkler at 0.9, matchTrigram at 0.5, etc.) and the ensemble
// floor in entity-screening-engine.ts was a const at 0.7.
//
// MLROs need to tune sensitivity without a code redeploy — a common-name
// false-positive (think "John Smith") should be adjustable to a slightly
// higher Jaro-Winkler threshold; a transliteration-heavy corpus may need
// a lower Levenshtein.  This module exposes those knobs as env vars with
// safe defaults, validated at module-load so a typo'd env value can't
// silently corrupt screening behaviour.
//
// Reads:
//   HAWKEYE_MATCH_LEVENSHTEIN_THRESHOLD   (default 0.82)
//   HAWKEYE_MATCH_JARO_WINKLER_THRESHOLD  (default 0.9)
//   HAWKEYE_MATCH_TRIGRAM_THRESHOLD       (default 0.5)
//   HAWKEYE_MATCH_PARTIAL_TOKEN_THRESHOLD (default 0.85)
//   HAWKEYE_MATCH_ABBREVIATED_THRESHOLD   (default 0.85)
//   HAWKEYE_MATCH_TOKEN_SET_THRESHOLD     (default 0.8)
//   HAWKEYE_MATCH_TOKEN_SORT_THRESHOLD    (default 0.85)
//   HAWKEYE_MATCH_PARTIAL_RATIO_THRESHOLD (default 0.9)
//   HAWKEYE_MATCH_ENSEMBLE_FLOOR          (default 0.7)
//
// Any value outside (0, 1] is rejected with a console.warn and the default
// is used — fail-open on the threshold itself rather than fail-closed,
// because a misconfigured threshold is better than a refused-screen on
// boot. The /api/screening/config endpoint exposes the resolved values so
// MLROs can confirm the active config.

const ENV_KEYS = {
  levenshtein: "HAWKEYE_MATCH_LEVENSHTEIN_THRESHOLD",
  jaroWinkler: "HAWKEYE_MATCH_JARO_WINKLER_THRESHOLD",
  trigram: "HAWKEYE_MATCH_TRIGRAM_THRESHOLD",
  partialToken: "HAWKEYE_MATCH_PARTIAL_TOKEN_THRESHOLD",
  abbreviated: "HAWKEYE_MATCH_ABBREVIATED_THRESHOLD",
  tokenSet: "HAWKEYE_MATCH_TOKEN_SET_THRESHOLD",
  tokenSort: "HAWKEYE_MATCH_TOKEN_SORT_THRESHOLD",
  partialRatio: "HAWKEYE_MATCH_PARTIAL_RATIO_THRESHOLD",
  ensembleFloor: "HAWKEYE_MATCH_ENSEMBLE_FLOOR",
} as const;

export interface MatchingThresholds {
  levenshtein: number;
  jaroWinkler: number;
  trigram: number;
  partialToken: number;
  abbreviated: number;
  tokenSet: number;
  tokenSort: number;
  partialRatio: number;
  ensembleFloor: number;
}

export type MatchingThresholdKey = keyof MatchingThresholds;

const DEFAULTS: MatchingThresholds = {
  levenshtein: 0.82,
  jaroWinkler: 0.9,
  trigram: 0.5,
  partialToken: 0.85,
  abbreviated: 0.85,
  tokenSet: 0.8,
  tokenSort: 0.85,
  partialRatio: 0.9,
  ensembleFloor: 0.7,
};

function parseThreshold(envValue: string | undefined, envKey: string, fallback: number): number {
  if (envValue === undefined || envValue === "") return fallback;
  const n = Number(envValue);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    console.warn(
      `[matching-config] ${envKey}="${envValue}" is not in (0, 1]; ignoring and using default ${fallback}.`,
    );
    return fallback;
  }
  return n;
}

// Resolved once at module load. Reads process.env defensively — vitest and
// edge runtimes both expose it but Worker bundles may not.
const env = (typeof process !== "undefined" && process.env) ? process.env : ({} as Record<string, string | undefined>);

export const MATCHING_THRESHOLDS: MatchingThresholds = {
  levenshtein: parseThreshold(env[ENV_KEYS.levenshtein], ENV_KEYS.levenshtein, DEFAULTS.levenshtein),
  jaroWinkler: parseThreshold(env[ENV_KEYS.jaroWinkler], ENV_KEYS.jaroWinkler, DEFAULTS.jaroWinkler),
  trigram: parseThreshold(env[ENV_KEYS.trigram], ENV_KEYS.trigram, DEFAULTS.trigram),
  partialToken: parseThreshold(env[ENV_KEYS.partialToken], ENV_KEYS.partialToken, DEFAULTS.partialToken),
  abbreviated: parseThreshold(env[ENV_KEYS.abbreviated], ENV_KEYS.abbreviated, DEFAULTS.abbreviated),
  tokenSet: parseThreshold(env[ENV_KEYS.tokenSet], ENV_KEYS.tokenSet, DEFAULTS.tokenSet),
  tokenSort: parseThreshold(env[ENV_KEYS.tokenSort], ENV_KEYS.tokenSort, DEFAULTS.tokenSort),
  partialRatio: parseThreshold(env[ENV_KEYS.partialRatio], ENV_KEYS.partialRatio, DEFAULTS.partialRatio),
  ensembleFloor: parseThreshold(env[ENV_KEYS.ensembleFloor], ENV_KEYS.ensembleFloor, DEFAULTS.ensembleFloor),
};

/** Snapshot of resolved thresholds + their sources, suitable for /api/screening/config. */
export function matchingThresholdsSnapshot(): Array<{ key: MatchingThresholdKey; value: number; default: number; envVar: string; overridden: boolean }> {
  return (Object.keys(DEFAULTS) as MatchingThresholdKey[]).map((key) => ({
    key,
    value: MATCHING_THRESHOLDS[key],
    default: DEFAULTS[key],
    envVar: ENV_KEYS[key],
    overridden: MATCHING_THRESHOLDS[key] !== DEFAULTS[key],
  }));
}
