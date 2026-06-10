// Hawkeye Sterling — runtime-configurable false-positive triage.
//
// FP-60: the deterministic FP triage layer activates the auto-resolve
// mechanism in quick-screen.ts (previously opt-in only, with no production
// caller) and mirrors the smart-disambiguate LLM rules in code so FP
// suppression works without ANTHROPIC_API_KEY.
//
// Design constraints (charter + CLAUDE.md invariants):
//   - absence of a discriminator is never treated as a conflict;
//   - critical lists (CRITICAL_LIST_IDS in quick-screen.ts) are never
//     auto-dismissed — at most flagged;
//   - nationality conflict alone never dismisses (FATF R.10 bias safety:
//     dismissal keyed on nationality could skew biasRatio by script);
//   - every dismissal carries a structured FP reason code (FP_01..FP_09).
//
// Reads:
//   HAWKEYE_FP_TRIAGE_ENABLED                  (default true)
//   HAWKEYE_FP_AUTO_RESOLVE_PROFILE            (default "standard"; off|conservative|standard|strict)
//   HAWKEYE_FP_DOB_DISMISS_MIN_YEARS           (default 3)
//   HAWKEYE_FP_DOB_CONFLICT_TOLERANCE_YEARS    (default 1)
//   HAWKEYE_FP_ENTITY_MISMATCH_DISMISS_MAX_SCORE (default 0.90)
//   HAWKEYE_FP_COMMON_NAME_CAP_ENABLED         (default true)
//   HAWKEYE_FP_SINGLE_TOKEN_SCORE_CAP          (default 0.74)
//   HAWKEYE_LIST_THRESHOLDS                    (default ""; JSON {listId: threshold})
//
// Invalid values are rejected with a console.warn and the default is used —
// fail-open on the knob itself (a misconfigured knob must not refuse
// screening on boot), matching the matching-config.ts convention.

const ENV_KEYS = {
  enabled: "HAWKEYE_FP_TRIAGE_ENABLED",
  profile: "HAWKEYE_FP_AUTO_RESOLVE_PROFILE",
  dobDismissMinYears: "HAWKEYE_FP_DOB_DISMISS_MIN_YEARS",
  dobConflictToleranceYears: "HAWKEYE_FP_DOB_CONFLICT_TOLERANCE_YEARS",
  entityMismatchDismissMaxScore: "HAWKEYE_FP_ENTITY_MISMATCH_DISMISS_MAX_SCORE",
  commonNameCapEnabled: "HAWKEYE_FP_COMMON_NAME_CAP_ENABLED",
  singleTokenScoreCap: "HAWKEYE_FP_SINGLE_TOKEN_SCORE_CAP",
  listThresholds: "HAWKEYE_LIST_THRESHOLDS",
} as const;

export type FpTriageProfile = "off" | "conservative" | "standard" | "strict";

export interface FpTriageConfig {
  enabled: boolean;
  profile: FpTriageProfile;
  dobDismissMinYears: number;
  dobConflictToleranceYears: number;
  entityMismatchDismissMaxScore: number;
  commonNameCapEnabled: boolean;
  singleTokenScoreCap: number;
  listThresholds: Record<string, number>;
}

const DEFAULTS: FpTriageConfig = {
  enabled: true,
  profile: "standard",
  dobDismissMinYears: 3,
  dobConflictToleranceYears: 1,
  entityMismatchDismissMaxScore: 0.9,
  commonNameCapEnabled: true,
  singleTokenScoreCap: 0.74,
  listThresholds: {},
};

const PROFILES: ReadonlySet<string> = new Set(["off", "conservative", "standard", "strict"]);

function parseBool(envValue: string | undefined, envKey: string, fallback: boolean): boolean {
  if (envValue === undefined || envValue === "") return fallback;
  const v = envValue.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  console.warn(`[fp-triage-config] ${envKey}="${envValue}" is not a boolean; using default ${fallback}.`);
  return fallback;
}

function parseYears(envValue: string | undefined, envKey: string, fallback: number): number {
  if (envValue === undefined || envValue === "") return fallback;
  const n = Number(envValue);
  if (!Number.isFinite(n) || n < 0 || n > 50) {
    console.warn(`[fp-triage-config] ${envKey}="${envValue}" is not in [0, 50]; using default ${fallback}.`);
    return fallback;
  }
  return n;
}

function parseScore(envValue: string | undefined, envKey: string, fallback: number): number {
  if (envValue === undefined || envValue === "") return fallback;
  const n = Number(envValue);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    console.warn(`[fp-triage-config] ${envKey}="${envValue}" is not in (0, 1]; using default ${fallback}.`);
    return fallback;
  }
  return n;
}

function parseProfile(envValue: string | undefined, envKey: string, fallback: FpTriageProfile): FpTriageProfile {
  if (envValue === undefined || envValue === "") return fallback;
  const v = envValue.trim().toLowerCase();
  if (PROFILES.has(v)) return v as FpTriageProfile;
  console.warn(`[fp-triage-config] ${envKey}="${envValue}" is not one of off|conservative|standard|strict; using default "${fallback}".`);
  return fallback;
}

function parseListThresholds(envValue: string | undefined, envKey: string): Record<string, number> {
  if (envValue === undefined || envValue === "") return {};
  try {
    const parsed = JSON.parse(envValue) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1) out[k] = v;
      else console.warn(`[fp-triage-config] ${envKey}: threshold for "${k}" not in (0, 1]; entry ignored.`);
    }
    return out;
  } catch {
    console.warn(`[fp-triage-config] ${envKey} is not valid JSON; using empty per-list thresholds.`);
    return {};
  }
}

// Resolved lazily (not at module load) so tests can mutate process.env and
// reset between cases; production pays the parse cost once.
let _resolved: FpTriageConfig | null = null;

export function fpTriageConfig(): FpTriageConfig {
  if (_resolved) return _resolved;
  const env = (typeof process !== "undefined" && process.env)
    ? process.env
    : ({} as Record<string, string | undefined>);
  _resolved = {
    enabled: parseBool(env[ENV_KEYS.enabled], ENV_KEYS.enabled, DEFAULTS.enabled),
    profile: parseProfile(env[ENV_KEYS.profile], ENV_KEYS.profile, DEFAULTS.profile),
    dobDismissMinYears: parseYears(env[ENV_KEYS.dobDismissMinYears], ENV_KEYS.dobDismissMinYears, DEFAULTS.dobDismissMinYears),
    dobConflictToleranceYears: parseYears(env[ENV_KEYS.dobConflictToleranceYears], ENV_KEYS.dobConflictToleranceYears, DEFAULTS.dobConflictToleranceYears),
    entityMismatchDismissMaxScore: parseScore(env[ENV_KEYS.entityMismatchDismissMaxScore], ENV_KEYS.entityMismatchDismissMaxScore, DEFAULTS.entityMismatchDismissMaxScore),
    commonNameCapEnabled: parseBool(env[ENV_KEYS.commonNameCapEnabled], ENV_KEYS.commonNameCapEnabled, DEFAULTS.commonNameCapEnabled),
    singleTokenScoreCap: parseScore(env[ENV_KEYS.singleTokenScoreCap], ENV_KEYS.singleTokenScoreCap, DEFAULTS.singleTokenScoreCap),
    listThresholds: parseListThresholds(env[ENV_KEYS.listThresholds], ENV_KEYS.listThresholds),
  };
  return _resolved;
}

/** Test hook — clears the resolved cache so env mutations take effect. */
export function resetFpTriageConfigForTests(): void {
  _resolved = null;
}

/** Snapshot of resolved triage config, suitable for /api/screening/config. */
export function fpTriageConfigSnapshot(): Array<{ key: string; value: unknown; default: unknown; envVar: string; overridden: boolean }> {
  const cfg = fpTriageConfig();
  return (Object.keys(DEFAULTS) as Array<keyof FpTriageConfig>).map((key) => ({
    key,
    value: cfg[key],
    default: DEFAULTS[key],
    envVar: ENV_KEYS[key],
    overridden: JSON.stringify(cfg[key]) !== JSON.stringify(DEFAULTS[key]),
  }));
}
